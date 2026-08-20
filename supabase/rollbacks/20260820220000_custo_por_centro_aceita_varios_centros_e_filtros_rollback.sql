-- Rollback de 20260820220000: volta as três funções do relatório de custo por
-- centro de custo às assinaturas escalares.
--
-- Cópia literal do que `pg_get_functiondef` devolvia em 20/08/2026, antes da
-- migration, inclusive os defeitos (a série sem os filtros de categoria/fornecedor
-- e com `p_fim` inclusivo). Rollback é voltar, não é consertar pela metade.
--
-- ATENÇÃO: rodar isto com o app já apontando para as assinaturas de array derruba
-- os três blocos do relatório (PostgREST não acha a função). Rollback aqui é para
-- acompanhar um revert do código, não para rodar sozinho.

drop function if exists public.fn_rel_custo_centro_custo(date, date, uuid[], uuid[], uuid[], uuid[], boolean, text[], boolean, text[]);

create function public.fn_rel_custo_centro_custo(
  p_inicio date default null,
  p_fim date default null,
  p_centro_custo uuid default null,
  p_categoria uuid default null,
  p_fornecedor uuid default null,
  p_excluir_previsto boolean default false,
  p_tipo_centro text default null
)
returns table(centro_custo_id uuid, nome text, codigo text, total numeric)
language sql
stable
set search_path to ''
as $function$
  with recursive raizes as (
    select c.id as centro_id, c.id as raiz_id
    from public.centros_custo c
    where c.pai_id is null
    union all
    select f.id, a.raiz_id
    from public.centros_custo f
    join raizes a on f.pai_id = a.centro_id
  )
  select raiz.id, raiz.nome, raiz.codigo, sum(r.valor) as total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join raizes a on a.centro_id = r.centro_custo_id
  left join public.centros_custo raiz on raiz.id = a.raiz_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and (not coalesce(p_excluir_previsto, false) or l.status <> 'previsto')
    and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
    and (p_fim is null or l.mes_competencia < p_fim)
    and (
      p_centro_custo is null
      or r.centro_custo_id in (select s.id from public.fn_centro_custo_subarvore(p_centro_custo) s)
    )
    and (p_categoria is null or l.categoria_id = p_categoria)
    and (p_fornecedor is null or l.fornecedor_id = p_fornecedor)
    and (p_tipo_centro is null or raiz.tipo = p_tipo_centro)
  group by raiz.id, raiz.nome, raiz.codigo
$function$;

revoke all on function public.fn_rel_custo_centro_custo(date, date, uuid, uuid, uuid, boolean, text) from public;
grant execute on function public.fn_rel_custo_centro_custo(date, date, uuid, uuid, uuid, boolean, text) to authenticated;

drop function if exists public.fn_rel_custo_centro_vida(uuid[]);

create function public.fn_rel_custo_centro_vida(p_centro uuid)
returns date
language sql
stable
set search_path to ''
as $function$
  select min(l.mes_competencia)
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  where r.centro_custo_id in (select s.id from public.fn_centro_custo_subarvore(p_centro) s)
    and l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
$function$;

revoke all on function public.fn_rel_custo_centro_vida(uuid) from public;
grant execute on function public.fn_rel_custo_centro_vida(uuid) to authenticated;

drop function if exists public.fn_rel_custo_centro_serie(uuid[], date, date, uuid[], uuid[], uuid[], boolean, text[], boolean);

create function public.fn_rel_custo_centro_serie(
  p_centro uuid,
  p_inicio date default null,
  p_fim date default null
)
returns table(mes text, total numeric)
language sql
stable
set search_path to ''
as $function$
  with arvore as (
    select s.id from public.fn_centro_custo_subarvore(p_centro) s
  ),
  extremos as (
    select min(l.mes_competencia) as primeiro, max(l.mes_competencia) as ultimo
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    where r.centro_custo_id in (select id from arvore)
      and l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
  ),
  limites as (
    select
      coalesce(date_trunc('month', p_inicio)::date, e.primeiro) as inicio,
      coalesce(date_trunc('month', p_fim)::date, e.ultimo) as fim
    from extremos e
  ),
  meses as (
    select generate_series(l.inicio, l.fim, interval '1 month')::date as mes
    from limites l
    where l.inicio is not null and l.fim is not null and l.inicio <= l.fim
  ),
  custo as (
    select l.mes_competencia as mes, sum(r.valor) as total
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    where r.centro_custo_id in (select id from arvore)
      and l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
    group by l.mes_competencia
  )
  select to_char(m.mes, 'YYYY-MM'), coalesce(c.total, 0)
  from meses m
  left join custo c on c.mes = m.mes
  order by m.mes
$function$;

revoke all on function public.fn_rel_custo_centro_serie(uuid, date, date) from public;
grant execute on function public.fn_rel_custo_centro_serie(uuid, date, date) to authenticated;
