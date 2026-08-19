-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-19, versão
-- 20260819140229 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- O valor do lançamento avulso passou a acompanhar a soma das parcelas
-- (20260819131404), mas o RATEIO por centro de custo ficou parado. Como
-- fn_salvar_lancamento exige que a soma do rateio seja IGUAL ao valor (compara
-- com <>, não com tolerância), um lançamento avulso reparcelado ficava
-- impossível de salvar pela tela depois, com uma mensagem que fala de rateio
-- para quem só mexeu em parcela.
--
-- Medido antes: 5.911 lançamentos com rateio, ZERO com soma fora do valor. O
-- risco estava armado e ainda não disparado, porque ninguém tinha reparcelado
-- um avulso com rateio desde a mudança.
--
-- A regra: proporcional ao que cada centro já tinha, com a sobra de centavos
-- inteira numa linha só (a de maior valor novo, desempate por id). Sobra numa
-- linha só, escolhida por critério fixo, é o que faz duas execuções darem o
-- mesmo resultado; distribuir de um em um dependeria da ordem de leitura.
do $mig$
declare
  v_src text;
  v_novo text;
  v_ancora text;
  v_troca text;
begin
  select prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_definir_parcelas_lancamento';

  if v_src is null then
    raise exception 'fn_definir_parcelas_lancamento nao encontrada';
  end if;
  if md5(v_src) <> '4dc76a288c78033b038f5763f68985d2' then
    raise exception 'a funcao mudou debaixo de mim: md5 % (esperado 4dc76a288c78033b038f5763f68985d2). Outra sessao pode estar mexendo: pare e confira.', md5(v_src);
  end if;

  v_ancora := $ancora$  if v_origem = 'manual' then
    update public.lancamentos
    set valor = v_total
    where id = p_lanc_id and round(valor, 2) <> v_total;
  end if;$ancora$;

  v_troca := $troca$  if v_origem = 'manual' and round(v_valor, 2) <> v_total then
    update public.lancamentos
    set valor = v_total
    where id = p_lanc_id;

    -- O valor mudou, entao o rateio por centro de custo acompanha. Sem isto a
    -- soma do rateio para de fechar com o valor, e fn_salvar_lancamento (que
    -- compara com <>) recusa qualquer edicao posterior do lancamento com uma
    -- mensagem sobre rateio, para quem so mexeu em parcela.
    -- Proporcional ao que cada centro tinha, com a sobra de centavos inteira na
    -- linha de maior valor novo (desempate por id): sobra numa linha so, por
    -- criterio fixo, faz duas execucoes darem o mesmo resultado.
    if v_valor > 0 and exists (
      select 1 from public.lancamento_rateios where lancamento_id = p_lanc_id
    ) then
      with base as (
        select id, round(valor * v_total / v_valor, 2) as novo
        from public.lancamento_rateios
        where lancamento_id = p_lanc_id
      ),
      tot as (select coalesce(sum(novo), 0) as s from base),
      alvo as (select id from base order by novo desc, id limit 1)
      update public.lancamento_rateios r
      set valor = b.novo
        + case when r.id = (select id from alvo)
               then v_total - (select s from tot) else 0 end
      from base b
      where b.id = r.id and r.lancamento_id = p_lanc_id;
    end if;
  end if;$troca$;

  if position(v_ancora in v_src) = 0 then
    raise exception 'ancora do update do valor nao encontrada no corpo vivo';
  end if;

  v_novo := replace(v_src, v_ancora, v_troca);
  if v_novo = v_src then
    raise exception 'o replace nao mudou nada';
  end if;

  execute 'create or replace function public.fn_definir_parcelas_lancamento('
    || 'p_lanc_id uuid, p_parcelas jsonb) returns void language plpgsql '
    || 'security definer set search_path to '''' as $fn$' || v_novo || '$fn$';
end $mig$;

do $trava$
declare v_src text; v_acl text;
begin
  select prosrc, proacl::text into v_src, v_acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_definir_parcelas_lancamento';

  if v_src not ilike '%lancamento_rateios%' then
    raise exception 'a funcao nao ficou com a redistribuicao de rateio';
  end if;
  if v_src not ilike '%extrato_transacoes%' then
    raise exception 'a guarda de parcela conciliada com o extrato desapareceu';
  end if;
  if v_src not ilike '%folha_guia%' or v_src not ilike '%adiantamento%' then
    raise exception 'as guardas de origem folha/adiantamento desapareceram';
  end if;
  if v_acl is null or v_acl not ilike '%authenticated=X%' then
    raise exception 'o grant de execute para authenticated se perdeu: %', coalesce(v_acl,'null');
  end if;
end $trava$;
