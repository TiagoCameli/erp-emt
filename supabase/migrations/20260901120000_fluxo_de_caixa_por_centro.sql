-- =============================================================
-- Fluxo de caixa filtra por centro de custo (saidas) e por centro de receita
-- (entradas), e o que ele soma passa a ser a FATIA do centro
--
-- Pedido do Tiago em 01/09/2026: "inclua filtros de centro de custo e etapas
-- quando aplicavel e centro de receita, para eu ver o fluxo de caixa por centro
-- de custo, posso selecionar mais de um centro de custo e de receita ao mesmo
-- tempo".
--
-- ============================================================
-- POR QUE FATIA, E NAO RECORTE
-- ============================================================
-- "Fluxo de caixa por centro de custo" so tem uma leitura honesta: quanto de
-- dinheiro entrou e saiu POR AQUELE centro. Um lancamento nao tem centro, tem
-- RATEIO -- 247 documentos dividem entre varios centros (medido em 01/09/2026),
-- e sao justamente os de maior valor. Contar a parcela INTEIRA em cada centro
-- que ela toca faria a soma de duas obras ser maior que o total da empresa, com
-- a tela abrindo sem erro nenhum.
--
-- Entao a linha vale `valor_liquido * (rateio escolhido / rateio do documento)`.
-- E a mesma regra que `fn_rel_custo_receita` ja usa (ela soma `r.valor`, a
-- fatia) e a mesma da planilha de Lancamentos por centro de custo.
--
-- Multiplicar ANTES de dividir e de proposito: `liquido * escolhido / total`
-- guarda a precisao que `liquido * (escolhido / total)` jogaria fora. E o
-- `round` fica no fim, sobre a SOMA -- arredondar cada fatia antes de somar
-- espalha centavo por mes.
--
-- ============================================================
-- SEM FILTRO, A FUNCAO CONTINUA EXATAMENTE A DE ANTES
-- ============================================================
-- `tem_corte` decide por LADO: sem `p_centros_custo` as saidas valem a parcela
-- inteira, sem `p_centros_receita` as entradas tambem. Isso nao e cortesia com o
-- codigo velho, e a condicao de a tela de hoje nao se mover: os quatro cartoes
-- do print do Tiago (R$ 49.915.527,24 de entradas, R$ 41.637.346,00 de saidas)
-- tem de continuar iguais quando ninguem escolheu centro. `round(x, 2)` sobre
-- numeric de duas casas e no-op, entao o caminho sem filtro e byte a byte o
-- mesmo SELECT de antes com uma coluna a mais no meio.
--
-- Os dois lados sao independentes, como em `fn_rel_custo_receita`: escolher a
-- obra so no custo recorta as saidas e deixa as entradas inteiras. E de
-- proposito (comparar "o custo da obra mais o das maquinas dela" contra "a
-- receita da obra" precisa dos dois lados soltos), e por isso a tela escreve
-- "Fatia de N centros" no detalhe do cartao de cada lado -- um saldo que mistura
-- fatia com total tem de dizer que mistura.
--
-- ============================================================
-- ASSINATURA MUDA, ENTAO DROP + CREATE + RE-GRANT
-- ============================================================
-- `create or replace` com lista de argumentos diferente cria SOBRECARGA, e com
-- a antiga viva a chamada `fn_rel_fluxo_caixa()` casa com as duas e o banco
-- responde `function is not unique`. E recriar funcao apaga o ACL: sem o
-- `grant execute to authenticated` o relatorio fica em branco SEM erro na tela.
-- O bloco de prova no fim estoura se o grant ou o INVOKER faltarem.
--
-- Nenhuma funcao viva chama `fn_rel_fluxo_caixa()`: as duas mencoes no repo sao
-- blocos de prova de migrations antigas (20260822270000), que ja rodaram. Os
-- dois parametros tem `default null`, entao a chamada sem argumento continua
-- resolvendo mesmo assim.
-- =============================================================

drop function if exists public.fn_rel_fluxo_caixa();

create function public.fn_rel_fluxo_caixa(
  p_centros_custo uuid[] default null,
  p_centros_receita uuid[] default null
)
returns table(mes text, tipo text, realizado boolean, total numeric)
language sql
stable
set search_path to ''
as $function$
  -- A subarvore do que foi escolhido: escolher a obra traz as etapas dela,
  -- escolher a manutencao traz os equipamentos. Mesmo helper que as sete
  -- funcoes de custo usam, para filtrar centro querer dizer a mesma coisa no
  -- modulo inteiro.
  with alvo_custo as (
    select distinct s.id as centro_id
    from unnest(coalesce(p_centros_custo, '{}'::uuid[])) as escolhido(id)
    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
  ),
  alvo_receita as (
    select distinct s.id as centro_id
    from unnest(coalesce(p_centros_receita, '{}'::uuid[])) as escolhido(id)
    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
  ),
  -- Quanto do rateio de cada documento cabe aos centros escolhidos DO LADO
  -- dele. Os dois `left join` batem em CTEs com `distinct`, entao nenhum deles
  -- multiplica a linha do rateio.
  fatia as (
    select
      r.lancamento_id,
      sum(r.valor) as rateio_total,
      sum(case
            when l.tipo = 'a_pagar'   and ac.centro_id is not null then r.valor
            when l.tipo = 'a_receber' and ar.centro_id is not null then r.valor
            else 0
          end) as rateio_escolhido
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    left join alvo_custo ac on ac.centro_id = r.centro_custo_id
    left join alvo_receita ar on ar.centro_id = r.centro_custo_id
    where l.status <> 'cancelado'
    group by r.lancamento_id
  ),
  parcela as (
    select
      case
        when p.status = 'pago'
          then to_char(coalesce(p.data_pagamento, p.data_vencimento), 'YYYY-MM')
        else to_char(coalesce(p.data_programada, p.data_vencimento), 'YYYY-MM')
      end as mes,
      p.lancamento_id,
      l.tipo,
      (p.status = 'pago') as realizado,
      -- Realizado sai pelo liquido (foi o que passou no caixa). Previsto tem
      -- desconto zero por construcao, entao a linha nao paga nao muda: o
      -- desconto so nasce no ato do pagamento e o estorno o zera.
      p.valor_liquido as valor,
      -- O corte e por LADO: cada tipo olha a propria lista.
      case
        when l.tipo = 'a_pagar'
          then coalesce(cardinality(p_centros_custo), 0) > 0
        else coalesce(cardinality(p_centros_receita), 0) > 0
      end as tem_corte
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    left join public.categorias_financeiras cf on cf.id = l.categoria_id
    where p.status <> 'cancelado'
      and l.status <> 'cancelado'
      -- Opcao A (22/08/2026): aplicar o saldo a noite e resgatar na manha
      -- seguinte nao e caixa entrando nem saindo. Era 45% das entradas.
      and coalesce(cf.natureza, 'operacional') <> 'movimentacao'
  )
  select t.mes, t.tipo, t.realizado, round(sum(t.valor), 2) as total
  from (
    select
      pa.mes,
      pa.tipo,
      pa.realizado,
      case
        when pa.tem_corte
          then pa.valor * f.rateio_escolhido / nullif(f.rateio_total, 0)
        else pa.valor
      end as valor
    from parcela pa
    left join fatia f on f.lancamento_id = pa.lancamento_id
    where pa.mes is not null
      -- Documento que nao encosta em nenhum centro escolhido sai da conta em
      -- vez de entrar como zero: mes sem movimento no recorte nao pode contar
      -- no cartao "Meses com movimento".
      and (not pa.tem_corte or coalesce(f.rateio_escolhido, 0) <> 0)
  ) t
  group by t.mes, t.tipo, t.realizado
$function$;

revoke all on function public.fn_rel_fluxo_caixa(uuid[], uuid[]) from public, anon;
grant execute on function public.fn_rel_fluxo_caixa(uuid[], uuid[]) to authenticated;

comment on function public.fn_rel_fluxo_caixa(uuid[], uuid[]) is
  'Entradas e saidas por mes, realizado e previsto. Ignora categoria de natureza movimentacao. Com centro escolhido soma a FATIA do rateio daquele centro (subarvore), por lado: p_centros_custo recorta a_pagar, p_centros_receita recorta a_receber. Sem parametro, identica a versao sem filtro.';

-- =============================================================
-- PROVA
--
-- Roda na mesma transacao da migration: se qualquer linha destas falhar, a
-- versao nao fica registrada quebrada.
-- =============================================================
do $$
declare
  v_acl text;
  v_definer boolean;
  v_sem_rateio bigint;
  v_rateio_negativo bigint;
  v_rateio_zero bigint;
begin
  -- 1. O ACL voltou, e a funcao continua INVOKER (a RLS do usuario tem de
  --    continuar valendo).
  select array_to_string(p.proacl, ' '), p.prosecdef
    into v_acl, v_definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'fn_rel_fluxo_caixa';

  if v_acl is null or v_acl not like '%authenticated=X%' then
    raise exception 'fn_rel_fluxo_caixa sem grant execute para authenticated (acl: %)', v_acl;
  end if;
  -- `public` aparece no aclitem com o beneficiario VAZIO ("=X/postgres"), no
  -- comeco da string ou depois de um espaco. Sem os dois casos, o teste passaria
  -- com a funcao aberta.
  if v_acl like '%anon=X%'
     or v_acl like '=X/%'
     or v_acl like '% =X/%' then
    raise exception 'fn_rel_fluxo_caixa com grant para anon ou public (acl: %)', v_acl;
  end if;
  if v_definer then
    raise exception 'fn_rel_fluxo_caixa virou SECURITY DEFINER';
  end if;

  -- 2. A fatia so existe se TODO lancamento com parcela tiver rateio. O centro
  --    de custo e invariante de banco desde 22/08/2026
  --    (trg_lancamento_exige_centro), entao isto tem de ser zero -- e se um dia
  --    deixar de ser, o dinheiro desse documento sairia do relatorio filtrado
  --    em silencio. Melhor a migration recusar.
  select count(*) into v_sem_rateio
  from public.lancamentos l
  where l.status <> 'cancelado'
    and exists (select 1 from public.lancamento_parcelas p
                where p.lancamento_id = l.id and p.status <> 'cancelado')
    and not exists (select 1 from public.lancamento_rateios r
                    where r.lancamento_id = l.id);

  if v_sem_rateio > 0 then
    raise exception 'ha % lancamento(s) com parcela e sem rateio: a fatia por centro perderia esse dinheiro', v_sem_rateio;
  end if;

  -- 3. Rateio negativo inverteria o sinal da fatia; rateio somando zero faria a
  --    divisao virar nulo. Nem um nem outro existe hoje.
  select count(*) into v_rateio_negativo
  from public.lancamento_rateios r
  where r.valor < 0;

  if v_rateio_negativo > 0 then
    raise exception 'ha % rateio(s) com valor negativo: a fatia por centro nao esta definida', v_rateio_negativo;
  end if;

  select count(*) into v_rateio_zero
  from (
    select r.lancamento_id
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    where l.status <> 'cancelado'
    group by r.lancamento_id
    having sum(r.valor) = 0
  ) z;

  if v_rateio_zero > 0 then
    raise exception 'ha % lancamento(s) com rateio somando zero: a divisao da fatia ficaria nula', v_rateio_zero;
  end if;

  raise notice 'fn_rel_fluxo_caixa: ACL ok, INVOKER ok, rateio completo em todo lancamento com parcela';
end
$$;
