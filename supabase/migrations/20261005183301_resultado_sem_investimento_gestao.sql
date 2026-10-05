-- Familia de resultado (D3 e D4, Tiago, 03/10/2026), parte 2 de 4.
-- Ver o cabecalho de 20261005183221_resultado_sem_investimento_custo_centro.sql.

-- Painel de Gestao: maiores custos e maiores fornecedores.

drop function public.fn_rel_gestao_maiores_custos(date, date, uuid[], uuid[], integer);

CREATE FUNCTION public.fn_rel_gestao_maiores_custos(p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date, p_centros uuid[] DEFAULT NULL::uuid[], p_categorias uuid[] DEFAULT NULL::uuid[], p_limite integer DEFAULT 8, p_incluir_investimento boolean DEFAULT false)
 RETURNS TABLE(lancamento_id uuid, numero text, descricao text, fornecedor text, mes_competencia date, data_vencimento date, valor numeric, centros integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with recursive raizes as (
    select c.id as centro_id, c.tipo as raiz_tipo
    from public.centros_custo c
    where c.pai_id is null
    union all
    select f.id, a.raiz_tipo
    from public.centros_custo f
    join raizes a on f.pai_id = a.centro_id
  ),
  escolhidos as (
    select distinct e.id
    from unnest(coalesce(p_centros, '{}'::uuid[])) as e(id)
  ),
  arvore as (
    select distinct s.id
    from escolhidos e
    cross join lateral public.fn_centro_custo_subarvore(e.id) s
  ),
  somado as (
    select
      l.id as lancamento_id,
      round(sum(r.valor), 2) as valor,
      count(distinct r.centro_custo_id)::int as centros
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    left join raizes rz on rz.centro_id = r.centro_custo_id
    left join public.categorias_financeiras cat
    on cat.id = coalesce(r.categoria_id, l.categoria_id)
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      and coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento')
      and coalesce(cat.natureza, 'operacional') <> 'movimentacao'
    -- D3: CAPEX (natureza investimento) fora do custo, salvo pedido explicito.
    and (coalesce(p_incluir_investimento, false)
         or coalesce(cat.natureza, 'operacional') <> 'investimento')
      and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
      and (p_fim is null or l.mes_competencia < p_fim)
      and (
        not exists (select 1 from escolhidos)
        or r.centro_custo_id in (select a.id from arvore a)
      )
      and (
        coalesce(cardinality(p_categorias), 0) = 0
        or coalesce(r.categoria_id, l.categoria_id) = any(p_categorias)
      )
    group by l.id
  )
  select
    l.id,
    l.numero,
    l.descricao,
    coalesce(nullif(f.nome_fantasia, ''), f.razao_social) as fornecedor,
    l.mes_competencia,
    l.data_vencimento,
    s.valor,
    s.centros
  from somado s
  join public.lancamentos l on l.id = s.lancamento_id
  left join public.fornecedores f on f.id = l.fornecedor_id
  order by s.valor desc, l.id desc
  limit greatest(coalesce(p_limite, 8), 1)
$function$;

revoke all on function public.fn_rel_gestao_maiores_custos(date, date, uuid[], uuid[], integer, boolean) from public, anon;
grant execute on function public.fn_rel_gestao_maiores_custos(date, date, uuid[], uuid[], integer, boolean) to authenticated;

drop function public.fn_rel_gestao_maiores_fornecedores(date, date, uuid[], uuid[], integer);

CREATE FUNCTION public.fn_rel_gestao_maiores_fornecedores(p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date, p_centros uuid[] DEFAULT NULL::uuid[], p_categorias uuid[] DEFAULT NULL::uuid[], p_limite integer DEFAULT 8, p_incluir_investimento boolean DEFAULT false)
 RETURNS TABLE(fornecedor_id uuid, nome text, tipo_linha text, total numeric, pago numeric, aberto numeric, lancamentos integer, fornecedores integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with recursive raizes as (
    select c.id as centro_id, c.tipo as raiz_tipo
    from public.centros_custo c
    where c.pai_id is null
    union all
    select f.id, a.raiz_tipo
    from public.centros_custo f
    join raizes a on f.pai_id = a.centro_id
  ),
  escolhidos as (
    select distinct e.id
    from unnest(coalesce(p_centros, '{}'::uuid[])) as e(id)
  ),
  arvore as (
    select distinct s.id
    from escolhidos e
    cross join lateral public.fn_centro_custo_subarvore(e.id) s
  ),
  -- Fracao PAGA de cada documento, medida nas PARCELAS: o dinheiro e da parcela,
  -- nao do status do lancamento.
  pagamento as (
    select pc.lancamento_id,
           sum(pc.valor) filter (where pc.status = 'pago') / nullif(sum(pc.valor), 0) as fracao
    from public.lancamento_parcelas pc
    group by pc.lancamento_id
  ),
  base as (
    select
      l.fornecedor_id,
      l.id as lancamento_id,
      r.valor,
      r.valor * coalesce(pg.fracao, 0) as valor_pago
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    left join raizes rz on rz.centro_id = r.centro_custo_id
    left join public.categorias_financeiras cat
    on cat.id = coalesce(r.categoria_id, l.categoria_id)
    left join pagamento pg on pg.lancamento_id = l.id
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      and coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento')
      and coalesce(cat.natureza, 'operacional') <> 'movimentacao'
    -- D3: CAPEX (natureza investimento) fora do custo, salvo pedido explicito.
    and (coalesce(p_incluir_investimento, false)
         or coalesce(cat.natureza, 'operacional') <> 'investimento')
      and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
      and (p_fim is null or l.mes_competencia < p_fim)
      and (
        not exists (select 1 from escolhidos)
        or r.centro_custo_id in (select a.id from arvore a)
      )
      and (
        coalesce(cardinality(p_categorias), 0) = 0
        or coalesce(r.categoria_id, l.categoria_id) = any(p_categorias)
      )
  ),
  por_fornecedor as (
    select
      b.fornecedor_id as id,
      coalesce(nullif(f.nome_fantasia, ''), f.razao_social) as nome,
      round(sum(b.valor), 2) as total,
      round(sum(b.valor_pago), 2) as pago,
      count(distinct b.lancamento_id)::int as lancamentos
    from base b
    left join public.fornecedores f on f.id = b.fornecedor_id
    group by b.fornecedor_id, coalesce(nullif(f.nome_fantasia, ''), f.razao_social)
  ),
  ordenado as (
    select p.*,
           row_number() over (order by p.total desc, p.id) as posicao
    from por_fornecedor p
  ),
  linhas as (
    select
      o.id as fornecedor_id,
      coalesce(o.nome, 'Sem fornecedor') as nome,
      case when o.id is null then 'sem_fornecedor' else 'fornecedor' end as tipo_linha,
      o.total,
      o.pago,
      round(o.total - o.pago, 2) as aberto,
      o.lancamentos,
      1 as fornecedores,
      0 as ordem
    from ordenado o
    where o.posicao <= greatest(coalesce(p_limite, 8), 1)
    union all
    select
      null::uuid,
      'Outros'::text,
      'outros'::text,
      round(sum(o.total), 2),
      round(sum(o.pago), 2),
      round(sum(o.total) - sum(o.pago), 2),
      sum(o.lancamentos)::int,
      count(*)::int,
      1
    from ordenado o
    where o.posicao > greatest(coalesce(p_limite, 8), 1)
    having count(*) > 0
  )
  select
    x.fornecedor_id, x.nome, x.tipo_linha, x.total, x.pago, x.aberto,
    x.lancamentos, x.fornecedores
  from linhas x
  order by x.ordem, x.total desc
$function$;

revoke all on function public.fn_rel_gestao_maiores_fornecedores(date, date, uuid[], uuid[], integer, boolean) from public, anon;
grant execute on function public.fn_rel_gestao_maiores_fornecedores(date, date, uuid[], uuid[], integer, boolean) to authenticated;
