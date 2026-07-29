-- Custo por grupo de insumo, com drill-down grupo -> subcategoria -> insumo.
--
-- De onde sai o numero: a dimensao de insumo existe em oc_itens, nao em
-- lancamento_rateios. Entao o custo por grupo vem dos itens da OC cujo
-- LANCAMENTO caiu no mes de referencia pedido. O que nao tem insumo (lancamento
-- avulso, diaria) entra numa linha "Sem insumo", com grupo nulo, senao a soma
-- por grupo nao fecharia com o custo total do mes.
--
-- Por que fecha: o rateio de um lancamento de OC e criado a partir dos proprios
-- oc_itens na aprovacao, entao sum(oc_itens) = sum(rateios) daquele lancamento.
-- A soma das linhas destas funcoes e igual a fn_rel_custo_centro_custo do mesmo
-- periodo, que e o custo total do mes.
--
-- quantidade e numeric(14,3) e preco numeric(14,2): o produto sai com 5 casas,
-- entao tudo volta arredondado em 2 (dinheiro tem 2 casas em todo o projeto).

create or replace function public.fn_rel_custo_por_grupo(
  p_inicio date default null,
  p_fim date default null,
  p_centro_custo uuid default null
)
returns table(
  grupo_id uuid,
  grupo_nome text,
  grupo_cor text,
  grupo_ordem smallint,
  total numeric
)
language sql
stable
set search_path to ''
as $$
  with lancs as (
    select l.id, l.origem, l.origem_id
    from public.lancamentos l
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
      and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
      and (p_fim is null or l.mes_competencia < p_fim)
  ),
  com_insumo as (
    select g.id as grupo_id, g.nome as grupo_nome, g.cor as grupo_cor, g.ordem as grupo_ordem,
           round(sum(oi.quantidade * oi.preco_unitario), 2) as total
    from lancs l
    join public.oc_itens oi on oi.ordem_compra_id = l.origem_id
    join public.insumos i on i.id = oi.insumo_id
    join public.categorias_insumo c on c.id = i.categoria_id
    join public.insumo_grupos g on g.id = c.grupo_id
    where l.origem = 'oc'
      and (p_centro_custo is null or oi.centro_custo_id = p_centro_custo)
    group by g.id, g.nome, g.cor, g.ordem
  ),
  sem_insumo as (
    select null::uuid as grupo_id, 'Sem insumo (lançamento avulso)'::text as grupo_nome,
           'neutro'::text as grupo_cor, 99::smallint as grupo_ordem,
           round(sum(r.valor), 2) as total
    from lancs l
    join public.lancamento_rateios r on r.lancamento_id = l.id
    where l.origem <> 'oc'
      and (p_centro_custo is null or r.centro_custo_id = p_centro_custo)
    having sum(r.valor) is not null
  )
  select * from com_insumo
  union all
  select * from sem_insumo
  order by grupo_ordem
$$;

revoke all on function public.fn_rel_custo_por_grupo(date, date, uuid) from public;
grant execute on function public.fn_rel_custo_por_grupo(date, date, uuid) to authenticated;

comment on function public.fn_rel_custo_por_grupo(date, date, uuid) is
  'Custo por grupo de insumo no mes de referencia (regime de competencia). Linha "Sem insumo" cobre lancamento avulso, para a soma fechar com o custo total.';

create or replace function public.fn_rel_custo_por_subcategoria(
  p_grupo_id uuid,
  p_inicio date default null,
  p_fim date default null,
  p_centro_custo uuid default null
)
returns table(categoria_id uuid, categoria_nome text, total numeric)
language sql
stable
set search_path to ''
as $$
  select c.id, c.nome, round(sum(oi.quantidade * oi.preco_unitario), 2) as total
  from public.lancamentos l
  join public.oc_itens oi on oi.ordem_compra_id = l.origem_id
  join public.insumos i on i.id = oi.insumo_id
  join public.categorias_insumo c on c.id = i.categoria_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and l.origem = 'oc'
    and c.grupo_id = p_grupo_id
    and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
    and (p_fim is null or l.mes_competencia < p_fim)
    and (p_centro_custo is null or oi.centro_custo_id = p_centro_custo)
  group by c.id, c.nome
  order by round(sum(oi.quantidade * oi.preco_unitario), 2) desc
$$;

revoke all on function public.fn_rel_custo_por_subcategoria(uuid, date, date, uuid) from public;
grant execute on function public.fn_rel_custo_por_subcategoria(uuid, date, date, uuid) to authenticated;

create or replace function public.fn_rel_custo_por_insumo(
  p_categoria_id uuid,
  p_inicio date default null,
  p_fim date default null,
  p_centro_custo uuid default null
)
returns table(insumo_id uuid, insumo_nome text, quantidade numeric, total numeric)
language sql
stable
set search_path to ''
as $$
  select i.id, i.nome, round(sum(oi.quantidade), 3) as quantidade,
         round(sum(oi.quantidade * oi.preco_unitario), 2) as total
  from public.lancamentos l
  join public.oc_itens oi on oi.ordem_compra_id = l.origem_id
  join public.insumos i on i.id = oi.insumo_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and l.origem = 'oc'
    and i.categoria_id = p_categoria_id
    and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
    and (p_fim is null or l.mes_competencia < p_fim)
    and (p_centro_custo is null or oi.centro_custo_id = p_centro_custo)
  group by i.id, i.nome
  order by round(sum(oi.quantidade * oi.preco_unitario), 2) desc
$$;

revoke all on function public.fn_rel_custo_por_insumo(uuid, date, date, uuid) from public;
grant execute on function public.fn_rel_custo_por_insumo(uuid, date, date, uuid) to authenticated;
