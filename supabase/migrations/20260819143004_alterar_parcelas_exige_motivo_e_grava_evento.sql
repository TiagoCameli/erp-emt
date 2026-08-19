-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-19, versão
-- 20260819143004 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Alterar parcela de um lançamento que JÁ tinha parcela passa a exigir motivo,
-- e cada parcela que muda de valor ou de vencimento ganha um evento em
-- parcela_eventos com o de-para. Pedido do dono em 19/08/2026: "uma parcela que
-- ainda não foi paga pode sofrer alteração mas precisa de um texto explicando o
-- por que da alteração".
--
-- A fronteira é já existir parcela, não o status dela: lançamento que nasceu sem
-- parcela nenhuma (o caso da OC que não definiu) está em DEFINIÇÃO inicial e não
-- pede motivo, porque não há o que explicar. Provado nos dois sentidos em
-- transação revertida.
--
-- Drop e create na MESMA migration, e o grant reconcedido em seguida: parâmetro
-- novo com default criaria sobrecarga ambígua com a chamada nomeada de dois
-- argumentos da action, e toda edição de parcela morreria com "function is not
-- unique". Foi o que já aconteceu nesta base com fn_pagar_parcela.
--
-- Limites declarados: parcela REMOVIDA não gera evento, porque o cascade de
-- parcela_eventos apagaria a linha junto com ela; parcela NOVA também não,
-- porque não há de-para. Se a única mudança for remover ou acrescentar parcela,
-- o motivo é exigido mas nenhum evento fica registrado.
--
-- Rollback: recriar fn_definir_parcelas_lancamento(uuid, jsonb) a partir do
-- corpo em md5(prosrc) = 7c10d09e70fad0c3a19a0b3ea984c1df, dropando a versão de
-- três parâmetros e reconcedendo o grant para authenticated.
do $mig$
declare
  v_src text; v_novo text; v_acl text;
  v_a1 text; v_t1 text; v_a2 text; v_t2 text; v_a3 text; v_t3 text;
begin
  select prosrc, proacl::text into v_src, v_acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_definir_parcelas_lancamento'
    and pg_get_function_identity_arguments(p.oid) = 'p_lanc_id uuid, p_parcelas jsonb';

  if v_src is null then
    raise exception 'fn_definir_parcelas_lancamento(uuid, jsonb) nao encontrada';
  end if;
  if md5(v_src) <> '7c10d09e70fad0c3a19a0b3ea984c1df' then
    raise exception 'a funcao mudou debaixo de mim: md5 % (esperado 7c10d09e70fad0c3a19a0b3ea984c1df)', md5(v_src);
  end if;
  if v_acl is null or v_acl not ilike '%authenticated=X%' then
    raise exception 'nao achei o grant de authenticated para restaurar: %', coalesce(v_acl, 'null');
  end if;

  -- 1. variaveis novas
  v_a1 := $a1$  v_falta text;
begin$a1$;
  v_t1 := $t1$  v_falta text;
  v_antes jsonb;
  v_eventos int;
begin$t1$;

  -- 2. exigir motivo quando JA existem parcelas (ai e alteracao, nao definicao
  --    inicial), e fotografar as abertas antes de qualquer escrita
  v_a2 := $a2$  v_qtd := jsonb_array_length(coalesce(p_parcelas, '[]'::jsonb));$a2$;
  v_t2 := $t2$  -- Motivo obrigatorio quando ja existe parcela: ai e ALTERACAO de um
  -- parcelamento que alguem combinou, e o "por que" tem que ficar registrado
  -- (pedido do dono, 19/08/2026). Lancamento que nasceu sem parcela nenhuma e
  -- DEFINICAO inicial, e nao pede motivo: nao ha o que explicar.
  if (v_preservadas + v_abertas) > 0 and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da alteracao das parcelas';
  end if;

  -- Foto das abertas antes de escrever, para o evento saber de onde veio cada
  -- valor. Depois do update nao ha como reconstruir o anterior.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'valor', valor, 'venc', data_vencimento)), '[]'::jsonb)
  into v_antes
  from public.lancamento_parcelas
  where lancamento_id = p_lanc_id and status in ('pendente', 'em_revisao');

  v_qtd := jsonb_array_length(coalesce(p_parcelas, '[]'::jsonb));$t2$;

  -- 3. gravar o evento por parcela que mudou de valor ou de vencimento
  v_a3 := $a3$  perform public.fn_aplicar_regra_pagamento(p_lanc_id);$a3$;
  v_t3 := $t3$  -- Um evento por parcela que REALMENTE mudou de valor ou de vencimento, com
  -- o de-para, para a trilha do lancamento mostrar o que houve e por que. Parcela
  -- removida nao gera evento: o cascade de parcela_eventos apagaria a linha junto
  -- com ela. Parcela nova tambem nao, porque nao ha "de onde veio".
  with antes as (
    select (x->>'id')::uuid as id,
           round((x->>'valor')::numeric, 2) as valor,
           nullif(x->>'venc', '')::date as venc
    from jsonb_array_elements(v_antes) x
  ),
  agora as (
    select id, round(valor, 2) as valor, data_vencimento as venc
    from public.lancamento_parcelas
    where lancamento_id = p_lanc_id
  ),
  mudou as (
    select a.id, a.valor as valor_de, g.valor as valor_para,
           a.venc as venc_de, g.venc as venc_para
    from antes a join agora g on g.id = a.id
    where a.valor <> g.valor or coalesce(a.venc, '0001-01-01') <> coalesce(g.venc, '0001-01-01')
  )
  insert into public.parcela_eventos
    (parcela_id, tipo, motivo, valor_de, valor_para, data_de, data_para, created_by)
  select id, 'alterou', btrim(p_motivo), valor_de, valor_para, venc_de, venc_para,
         (select auth.uid())
  from mudou;

  get diagnostics v_eventos = row_count;

  perform public.fn_aplicar_regra_pagamento(p_lanc_id);$t3$;

  if position(v_a1 in v_src) = 0 then raise exception 'ancora 1 (declare) nao encontrada'; end if;
  if position(v_a2 in v_src) = 0 then raise exception 'ancora 2 (v_qtd) nao encontrada'; end if;
  if position(v_a3 in v_src) = 0 then raise exception 'ancora 3 (fn_aplicar_regra_pagamento) nao encontrada'; end if;

  v_novo := replace(replace(replace(v_src, v_a1, v_t1), v_a2, v_t2), v_a3, v_t3);
  if v_novo = v_src then raise exception 'nenhum replace pegou'; end if;

  -- Drop e create na MESMA migration: parametro novo com default criaria
  -- sobrecarga ambigua com a chamada nomeada de 2 argumentos da action, e toda
  -- edicao de parcela morreria com "function is not unique".
  drop function public.fn_definir_parcelas_lancamento(uuid, jsonb);

  execute 'create function public.fn_definir_parcelas_lancamento('
    || 'p_lanc_id uuid, p_parcelas jsonb, p_motivo text default null) '
    || 'returns void language plpgsql security definer set search_path to '''' '
    || 'as $fn$' || v_novo || '$fn$';

  execute 'grant execute on function public.fn_definir_parcelas_lancamento(uuid, jsonb, text) to authenticated';
end $mig$;

do $trava$
declare v_n int; v_acl text; v_src text;
begin
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_definir_parcelas_lancamento';
  if v_n <> 1 then
    raise exception 'ficaram % versoes de fn_definir_parcelas_lancamento: sobrecarga ambigua', v_n;
  end if;

  select proacl::text, prosrc into v_acl, v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_definir_parcelas_lancamento';

  if v_acl is null or v_acl not ilike '%authenticated=X%' then
    raise exception 'o grant de execute para authenticated nao foi restaurado: %', coalesce(v_acl,'null');
  end if;
  if v_src not ilike '%Informe o motivo da alteracao das parcelas%' then
    raise exception 'a exigencia de motivo nao entrou';
  end if;
  if v_src not ilike '%parcela_eventos%' then
    raise exception 'a gravacao do evento nao entrou';
  end if;
  if v_src not ilike '%lancamento_rateios%' then
    raise exception 'a redistribuicao de rateio se perdeu';
  end if;
  if v_src not ilike '%extrato_transacoes%' then
    raise exception 'a guarda de parcela conciliada se perdeu';
  end if;
  if v_src not ilike '%folha_guia%' then
    raise exception 'as guardas de origem se perderam';
  end if;
end $trava$;
