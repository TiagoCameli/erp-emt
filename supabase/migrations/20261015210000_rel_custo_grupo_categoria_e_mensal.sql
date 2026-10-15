-- Custo por grupo de insumo: o "Sem insumo" aberto por categoria e a série
-- mensal (15/10/2026).
--
-- Em 2026, 92,8% do custo (R$ 29,14 mi de R$ 31,40 mi) cai na linha "Sem
-- insumo (lançamento avulso)", e a linha não abria: o relatório não dizia
-- nada. `fn_rel_custo_sem_insumo_por_categoria` abre essa linha pela categoria
-- financeira (a do rateio, caindo na do lançamento), com EXATAMENTE o filtro do
-- ramo `sem_insumo` de `fn_rel_custo_por_grupo`: a soma das categorias fecha
-- com a linha.
--
-- `fn_rel_custo_por_grupo_mensal` não reescreve regra nenhuma: chama a própria
-- `fn_rel_custo_por_grupo` mês a mês, então o mês e o período não têm como
-- discordar. Teto de 36 meses (cada mês é uma chamada de ~60 ms).

create or replace function public.fn_rel_custo_sem_insumo_por_categoria(
  p_inicio date default null,
  p_fim date default null,
  p_centro_custo uuid default null,
  p_categoria uuid default null,
  p_incluir_investimento boolean default false
)
returns table(categoria_id uuid, categoria_nome text, total numeric)
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
  arvore as (
    select s.id from public.fn_centro_custo_subarvore(p_centro_custo) s
    where p_centro_custo is not null
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
    select it.lancamento_id from public.fn_rel_custo_itens_oc(p_inicio, p_fim, p_incluir_investimento) it
  )
  select cat.id,
         coalesce(cat.nome, 'Sem categoria'),
         round(sum(r.valor), 2)
  from lancs l
  join public.lancamento_rateios r on r.lancamento_id = l.id
  left join raizes rz on rz.centro_id = r.centro_custo_id
  left join public.categorias_financeiras cat
    on cat.id = coalesce(r.categoria_id, l.categoria_id)
  where not exists (select 1 from itens it where it.lancamento_id = l.id)
    and coalesce(rz.raiz_tipo, '') not in ('financeiro', 'investimento', 'socio', 'empresa_ligada', 'imobilizado')
    and coalesce(cat.natureza, 'operacional') not in ('movimentacao', 'distribuicao', 'mutuo')
    and (coalesce(p_incluir_investimento, false)
         or coalesce(cat.natureza, 'operacional') <> 'investimento')
    and (p_categoria is null or coalesce(r.categoria_id, l.categoria_id) = p_categoria)
    and (p_centro_custo is null or r.centro_custo_id in (select a.id from arvore a))
  group by cat.id, cat.nome
  order by 3 desc, 2
$function$;

revoke execute on function public.fn_rel_custo_sem_insumo_por_categoria(date, date, uuid, uuid, boolean) from public, anon;
grant execute on function public.fn_rel_custo_sem_insumo_por_categoria(date, date, uuid, uuid, boolean) to authenticated;

create or replace function public.fn_rel_custo_por_grupo_mensal(
  p_inicio date,
  p_fim date,
  p_centro_custo uuid default null,
  p_categoria uuid default null,
  p_incluir_investimento boolean default false
)
returns table(mes date, grupo_id uuid, grupo_nome text, total numeric)
language plpgsql
stable
set search_path to ''
as $function$
begin
  if p_inicio is null or p_fim is null then
    raise exception 'Informe o periodo';
  end if;
  if p_fim > (date_trunc('month', p_inicio) + interval '36 months')::date then
    raise exception 'Periodo longo demais para a serie mensal (maximo 36 meses)';
  end if;

  return query
    select m.inicio::date, g.grupo_id, g.grupo_nome, g.total
      from generate_series(date_trunc('month', p_inicio), p_fim - interval '1 day', interval '1 month') as m(inicio)
      cross join lateral public.fn_rel_custo_por_grupo(
        m.inicio::date,
        (m.inicio + interval '1 month')::date,
        p_centro_custo,
        p_categoria,
        null,
        null,
        p_incluir_investimento
      ) g
     order by 1, g.grupo_ordem;
end;
$function$;

revoke execute on function public.fn_rel_custo_por_grupo_mensal(date, date, uuid, uuid, boolean) from public, anon;
grant execute on function public.fn_rel_custo_por_grupo_mensal(date, date, uuid, uuid, boolean) to authenticated;
