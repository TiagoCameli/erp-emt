-- Familia de resultado (D3 e D4, Tiago, 03/10/2026), parte 3 de 4.
-- Ver o cabecalho de 20261005183221_resultado_sem_investimento_custo_centro.sql.

-- Itens de OC, custo por grupo, por subcategoria e por insumo.

-- Itens de OC: a natureza agora e medida no RATEIO (D4). O documento entra
-- pelo valor dos rateios que contam como custo; se nenhum conta, ele some.
drop function public.fn_rel_custo_itens_oc(date, date);

create function public.fn_rel_custo_itens_oc(p_inicio date default null::date, p_fim date default null::date, p_incluir_investimento boolean default false)
 returns table(lancamento_id uuid, item_id uuid, centro_custo_id uuid, insumo_id uuid, categoria_insumo_id uuid, categoria_financeira_id uuid, grupo_id uuid, quantidade numeric, valor numeric)
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
  ),
  lancs as (
    select l.id, l.origem_id, l.categoria_id
    from public.lancamentos l
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      and l.origem = 'oc'
      and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
      and (p_fim is null or l.mes_competencia < p_fim)
  ),
  item as (
    select
      l.id as lancamento_id,
      oi.id as item_id,
      oi.centro_custo_id,
      oi.insumo_id,
      ci.id as categoria_insumo_id,
      ci.categoria_financeira_id,
      ci.grupo_id,
      oi.quantidade,
      oi.quantidade * oi.preco_unitario as bruto
    from lancs l
    join public.oc_itens oi on oi.ordem_compra_id = l.origem_id
    join public.insumos i on i.id = oi.insumo_id
    join public.categorias_insumo ci on ci.id = i.categoria_id
    join public.insumo_grupos g on g.id = ci.grupo_id
    left join raizes rz on rz.centro_id = oi.centro_custo_id
    where coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento')
  ),
  -- O valor do documento e a soma do RATEIO que conta como custo, que e
  -- exatamente o que `fn_rel_custo_centro_custo` conta.
  valor_do_doc as (
    select r.lancamento_id, sum(r.valor) as valor_doc
    from public.lancamento_rateios r
    join lancs l on l.id = r.lancamento_id
    left join raizes rz on rz.centro_id = r.centro_custo_id
    left join public.categorias_financeiras cat
      on cat.id = coalesce(r.categoria_id, l.categoria_id)
    where coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento')
      and coalesce(cat.natureza, 'operacional') <> 'movimentacao'
      and (coalesce(p_incluir_investimento, false)
           or coalesce(cat.natureza, 'operacional') <> 'investimento')
    group by r.lancamento_id
  ),
  bruto_do_doc as (
    select i.lancamento_id, sum(i.bruto) as bruto_total
    from item i
    group by i.lancamento_id
  ),
  proporcional as (
    select
      i.*,
      v.valor_doc,
      case when b.bruto_total = 0 then 0
           else round(i.bruto * v.valor_doc / b.bruto_total, 2) end as valor_bruto_ajustado,
      row_number() over (
        partition by i.lancamento_id order by i.bruto desc, i.item_id
      ) as ordem_item
    from item i
    join bruto_do_doc b on b.lancamento_id = i.lancamento_id
    join valor_do_doc v on v.lancamento_id = i.lancamento_id
  ),
  sobra as (
    select p.lancamento_id,
           max(p.valor_doc) - sum(p.valor_bruto_ajustado) as resto
    from proporcional p
    group by p.lancamento_id
  )
  select
    p.lancamento_id,
    p.item_id,
    p.centro_custo_id,
    p.insumo_id,
    p.categoria_insumo_id,
    p.categoria_financeira_id,
    p.grupo_id,
    p.quantidade,
    p.valor_bruto_ajustado + case when p.ordem_item = 1 then s.resto else 0 end
  from proporcional p
  join sobra s on s.lancamento_id = p.lancamento_id
$function$;

revoke all on function public.fn_rel_custo_itens_oc(date, date, boolean) from public, anon;
grant execute on function public.fn_rel_custo_itens_oc(date, date, boolean) to authenticated;

drop function public.fn_rel_custo_por_grupo(date, date, uuid, uuid, uuid[], uuid[]);

create function public.fn_rel_custo_por_grupo(p_inicio date default null::date, p_fim date default null::date, p_centro_custo uuid default null::uuid, p_categoria uuid default null::uuid, p_centros uuid[] default null::uuid[], p_categorias uuid[] default null::uuid[], p_incluir_investimento boolean default false)
 returns table(grupo_id uuid, grupo_nome text, grupo_cor text, grupo_ordem smallint, total numeric)
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
  ),
  escolhidos as (
    select distinct e.id
    from unnest(
      case
        when coalesce(cardinality(p_centros), 0) > 0 then p_centros
        when p_centro_custo is not null then array[p_centro_custo]
        else '{}'::uuid[]
      end
    ) as e(id)
  ),
  arvore as (
    select distinct s.id
    from escolhidos e
    cross join lateral public.fn_centro_custo_subarvore(e.id) s
  ),
  cats as (
    select distinct c.id
    from unnest(
      case
        when coalesce(cardinality(p_categorias), 0) > 0 then p_categorias
        when p_categoria is not null then array[p_categoria]
        else '{}'::uuid[]
      end
    ) as c(id)
  ),
  lancs as (
    select l.id, l.categoria_id
    from public.lancamentos l
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
      and (p_fim is null or l.mes_competencia < p_fim)
  ),
  itens as (
    select * from public.fn_rel_custo_itens_oc(p_inicio, p_fim, p_incluir_investimento)
  ),
  com_insumo as (
    select g.id as grupo_id, g.nome as grupo_nome, g.cor as grupo_cor, g.ordem as grupo_ordem,
           round(sum(it.valor), 2) as total
    from itens it
    join public.insumo_grupos g on g.id = it.grupo_id
    where (
        not exists (select 1 from cats)
        or it.categoria_financeira_id in (select c.id from cats c)
      )
      and (
        not exists (select 1 from escolhidos)
        or it.centro_custo_id in (select a.id from arvore a)
      )
    group by g.id, g.nome, g.cor, g.ordem
  ),
  -- Todo rateio que NAO virou item ajustado cai aqui. Definir o balde por
  -- ausencia e o que garante que cada rateio e contado exatamente uma vez. A
  -- natureza e a do rateio (D4), a mesma que `fn_rel_custo_itens_oc` usa.
  sem_insumo as (
    select null::uuid as grupo_id, 'Sem insumo (lançamento avulso)'::text as grupo_nome,
           'neutro'::text as grupo_cor, 99::smallint as grupo_ordem,
           round(sum(r.valor), 2) as total
    from lancs l
    join public.lancamento_rateios r on r.lancamento_id = l.id
    left join raizes rz on rz.centro_id = r.centro_custo_id
    left join public.categorias_financeiras cat
      on cat.id = coalesce(r.categoria_id, l.categoria_id)
    where not exists (select 1 from itens it where it.lancamento_id = l.id)
      and coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento')
      and coalesce(cat.natureza, 'operacional') <> 'movimentacao'
      and (coalesce(p_incluir_investimento, false)
           or coalesce(cat.natureza, 'operacional') <> 'investimento')
      and (
        not exists (select 1 from cats)
        or coalesce(r.categoria_id, l.categoria_id) in (select c.id from cats c)
      )
      and (
        not exists (select 1 from escolhidos)
        or r.centro_custo_id in (select a.id from arvore a)
      )
    having sum(r.valor) is not null
  )
  select * from com_insumo
  union all
  select * from sem_insumo
  order by grupo_ordem
$function$;

revoke all on function public.fn_rel_custo_por_grupo(date, date, uuid, uuid, uuid[], uuid[], boolean) from public, anon;
grant execute on function public.fn_rel_custo_por_grupo(date, date, uuid, uuid, uuid[], uuid[], boolean) to authenticated;

drop function public.fn_rel_custo_por_insumo(uuid, date, date, uuid);

create function public.fn_rel_custo_por_insumo(p_categoria_id uuid, p_inicio date default null::date, p_fim date default null::date, p_centro_custo uuid default null::uuid, p_incluir_investimento boolean default false)
 returns table(insumo_id uuid, insumo_nome text, quantidade numeric, total numeric)
 language sql
 stable
 set search_path to ''
as $function$
  with arvore as (
    select s.id from public.fn_centro_custo_subarvore(p_centro_custo) s
  )
  select i.id, i.nome, round(sum(it.quantidade), 3) as quantidade,
         round(sum(it.valor), 2) as total
  from public.fn_rel_custo_itens_oc(p_inicio, p_fim, p_incluir_investimento) it
  join public.insumos i on i.id = it.insumo_id
  where i.categoria_id = p_categoria_id
    and (p_centro_custo is null or it.centro_custo_id in (select id from arvore))
  group by i.id, i.nome
  order by round(sum(it.valor), 2) desc
$function$;

revoke all on function public.fn_rel_custo_por_insumo(uuid, date, date, uuid, boolean) from public, anon;
grant execute on function public.fn_rel_custo_por_insumo(uuid, date, date, uuid, boolean) to authenticated;

drop function public.fn_rel_custo_por_subcategoria(uuid, date, date, uuid);

create function public.fn_rel_custo_por_subcategoria(p_grupo_id uuid, p_inicio date default null::date, p_fim date default null::date, p_centro_custo uuid default null::uuid, p_incluir_investimento boolean default false)
 returns table(categoria_id uuid, categoria_nome text, total numeric)
 language sql
 stable
 set search_path to ''
as $function$
  with arvore as (
    select s.id from public.fn_centro_custo_subarvore(p_centro_custo) s
  )
  select c.id, c.nome, round(sum(it.valor), 2) as total
  from public.fn_rel_custo_itens_oc(p_inicio, p_fim, p_incluir_investimento) it
  join public.categorias_insumo c on c.id = it.categoria_insumo_id
  where c.grupo_id = p_grupo_id
    and (p_centro_custo is null or it.centro_custo_id in (select id from arvore))
  group by c.id, c.nome
  order by round(sum(it.valor), 2) desc
$function$;

revoke all on function public.fn_rel_custo_por_subcategoria(uuid, date, date, uuid, boolean) from public, anon;
grant execute on function public.fn_rel_custo_por_subcategoria(uuid, date, date, uuid, boolean) to authenticated;
