-- =============================================================
-- `fn_rel_custo_por_mes` faz os mesmos cortes do custo por centro de custo
--
-- ============================================================
-- POR QUE ISTO VEM JUNTO
-- ============================================================
-- Esta e a quarta funcao da mesma familia: "custo a pagar por competencia,
-- somando `lancamento_rateios`". As outras tres (centro de custo, serie e vida)
-- passaram a excluir o centro raiz `financeiro` e a natureza que nao e
-- `operacional` nas migrations 20260827180000 e 20260828234000. Esta ficou para
-- tras, e o painel da Gestao mostra as tres lado a lado.
--
-- Medido em 28/08/2026, com os cortes das outras ja aplicados:
--   fn_rel_custo_por_mes ......... R$ 55.038.244,19
--   fn_rel_custo_centro_custo .... R$ 52.131.257,57
--   diferenca .................... R$  2.906.986,62 em 20 dos 21 meses
--
-- E ela fecha exatamente com o que falta:
--   centro raiz `financeiro` (Emprestimos) . R$ 2.843.964,90
--   natureza `financeira` (tarifa bancaria)  R$    25.721,72
--   natureza `movimentacao` (LAN-2026-3680)  R$    37.300,00
--
-- Parte dessa diferenca (a raiz financeira) ja existia antes; a outra parte
-- nasceu na migration 20260828234000, quando o custo por centro passou a
-- filtrar natureza. Deixar so uma das quatro sem o corte poria dois numeros
-- diferentes na mesma tela para a mesma pergunta -- que e o defeito que aquela
-- migration existe para matar, e nao para espalhar.
--
-- Assinatura IGUAL, entao `create or replace` basta. O ACL nao se perde no
-- replace, e a migration anterior (20260828235500) ja tirou o PUBLIC dele.
-- =============================================================

create or replace function public.fn_rel_custo_por_mes(
  p_meses integer default 6,
  p_inicio date default null,
  p_fim date default null,
  p_centro_custo uuid default null,
  p_categoria uuid default null
)
returns table(mes date, total numeric, lancamentos integer)
language sql
stable
set search_path to ''
as $function$
  with recursive raizes as (
    select c.id as centro_id, c.tipo as raiz_tipo
    from public.centros_custo c
    where c.pai_id is null
    union all
    select f.id, a.raiz_tipo
    from public.centros_custo f
    join raizes a on f.pai_id = a.centro_id
  )
  select
    l.mes_competencia as mes,
    sum(r.valor) as total,
    count(distinct l.id)::int as lancamentos
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join raizes rz on rz.centro_id = r.centro_custo_id
  left join public.categorias_financeiras cat on cat.id = l.categoria_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    -- Os dois cortes da familia. Ver fn_rel_custo_centro_custo.
    and coalesce(rz.raiz_tipo, '') <> 'financeiro'
    and coalesce(cat.natureza, 'operacional') = 'operacional'
    and (
      p_inicio is not null
      or l.mes_competencia >= (
        date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date
        - ((greatest(coalesce(p_meses, 6), 1) - 1) || ' months')::interval
      )::date
    )
    and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
    and (p_fim is null or l.mes_competencia < p_fim)
    and (
      p_centro_custo is null
      or r.centro_custo_id in (select s.id from public.fn_centro_custo_subarvore(p_centro_custo) s)
    )
    and (p_categoria is null or coalesce(r.categoria_id, l.categoria_id) = p_categoria)
  group by l.mes_competencia
  order by l.mes_competencia
$function$;

comment on function public.fn_rel_custo_por_mes(integer, date, date, uuid, uuid) is
  'Custo a pagar por mes de competencia. Mesmos cortes de fn_rel_custo_centro_custo (raiz financeira fora, so natureza operacional), para os cartoes do painel da Gestao concordarem entre si.';
