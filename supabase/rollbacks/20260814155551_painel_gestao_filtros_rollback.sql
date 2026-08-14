-- Rollback de 20260814155551_painel_gestao_filtros.sql: devolve as três funções
-- de custo às assinaturas e aos corpos que tinham antes dos filtros do painel.
--
-- Os corpos abaixo foram copiados da definição VIVA no banco (pg_get_functiondef)
-- antes da alteração, não do .sql do repo: o ledger de migrations deste projeto
-- divergiu do banco, e restaurar por arquivo velho podia reintroduzir uma versão
-- que nunca esteve valendo.
--
-- Atenção: rodar isto quebra o painel filtrado, porque a tela passa a mandar
-- parâmetros que a função não tem mais. Faça o revert do código junto.

drop function if exists public.fn_rel_custo_por_mes(integer, date, date, uuid, uuid);

create function public.fn_rel_custo_por_mes(p_meses integer default 6)
returns table(mes date, total numeric, lancamentos integer)
language sql
stable
set search_path to ''
as $function$
  select
    l.mes_competencia as mes,
    sum(r.valor) as total,
    count(distinct l.id)::int as lancamentos
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and l.mes_competencia >= (
      date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date
      - ((greatest(coalesce(p_meses, 6), 1) - 1) || ' months')::interval
    )::date
  group by l.mes_competencia
  order by l.mes_competencia
$function$;

grant execute on function public.fn_rel_custo_por_mes(integer) to authenticated;

drop function if exists public.fn_rel_custo_centro_custo(date, date, uuid, uuid);

create function public.fn_rel_custo_centro_custo(
  p_inicio date default null,
  p_fim date default null
)
returns table(centro_custo_id uuid, nome text, codigo text, total numeric)
language sql
stable
set search_path to ''
as $function$
  select r.centro_custo_id, cc.nome, cc.codigo, sum(r.valor) as total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join public.centros_custo cc on cc.id = r.centro_custo_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
    and (p_fim is null or l.mes_competencia < p_fim)
  group by r.centro_custo_id, cc.nome, cc.codigo
$function$;

grant execute on function public.fn_rel_custo_centro_custo(date, date) to authenticated;

drop function if exists public.fn_rel_custo_por_grupo(date, date, uuid, uuid);

create function public.fn_rel_custo_por_grupo(
  p_inicio date default null,
  p_fim date default null,
  p_centro_custo uuid default null
)
returns table(grupo_id uuid, grupo_nome text, grupo_cor text, grupo_ordem smallint, total numeric)
language sql
stable
set search_path to ''
as $function$
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
$function$;

grant execute on function public.fn_rel_custo_por_grupo(date, date, uuid) to authenticated;
