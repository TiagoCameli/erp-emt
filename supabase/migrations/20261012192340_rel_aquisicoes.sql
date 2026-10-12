-- Relatorios: aba "Equipamentos e consorcios" (Tiago, 12/10/2026). O que
-- foi comprado (centros de imobilizado, ou categoria Aquisicao de Equipamento
-- em qualquer centro), por bem, e as cotas de consorcio (etapa "Consorcios a
-- contemplar" ou categoria Consorcio a contemplar), por lancamento.
--
-- Pago e a pagar vem das parcelas do lancamento, na proporcao do rateio:
-- um lancamento dividido entre tres carretas paga um terco de cada.

create or replace function public.fn_rel_aquisicoes()
returns table (
  tipo text, grupo text, centro_id uuid, centro text, lancamento_id uuid, numero text, descricao text, fornecedor text,
  primeira_competencia date, lancamentos int, parcelas int, parcelas_pagas int, valor numeric, pago numeric, a_pagar numeric)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.tem_permissao('financeiro.relatorios', 'ver') then
    raise exception 'Sem permissao para ver relatorios';
  end if;

  return query
  -- Entra o rateio num centro de imobilizado OU com categoria de compra de
  -- equipamento/consorcio em qualquer centro (as carretas da 001 - Carretas
  -- EMT sao centro de obra com categoria Aquisicao de Equipamento).
  with etapas as (
    select e.id, e.nome, r.nome as raiz, r.tipo = 'imobilizado' as imobilizado
    from public.centros_custo e
    join public.centros_custo r on r.id = coalesce(e.pai_id, e.id)
  ),
  cats as (
    select cf.id, cf.nome from public.categorias_financeiras cf
    where cf.tipo = 'despesa' and cf.nome in ('Aquisição de Equipamento', 'Consórcio a contemplar')
  ),
  rat as (
    select et.id as centro_id, et.nome as centro, et.raiz,
           coalesce(et.nome = 'Consórcios a contemplar' or ct.nome = 'Consórcio a contemplar', false) as consorcio,
           l.id as lancamento_id, l.numero, l.descricao,
           coalesce(f.nome_fantasia, f.razao_social) as fornecedor, l.mes_competencia, r.valor,
           (select count(*) from public.lancamento_parcelas p where p.lancamento_id = l.id)::int as np,
           (select count(*) from public.lancamento_parcelas p where p.lancamento_id = l.id and p.status = 'pago')::int as npg,
           coalesce((select sum(p.valor) from public.lancamento_parcelas p where p.lancamento_id = l.id and p.status = 'pago'), 0) as pago_lanc,
           coalesce((select sum(p.valor) from public.lancamento_parcelas p where p.lancamento_id = l.id), 0) as total_lanc
    from public.lancamento_rateios r
    join etapas et on et.id = r.centro_custo_id
    join public.lancamentos l on l.id = r.lancamento_id and l.status <> 'cancelado' and l.tipo = 'a_pagar'
    left join cats ct on ct.id = coalesce(r.categoria_id, l.categoria_id)
    left join public.fornecedores f on f.id = l.fornecedor_id
    where et.imobilizado or ct.id is not null
  ),
  calc as (
    select rat.*,
           round(case when rat.total_lanc > 0 then rat.valor * rat.pago_lanc / rat.total_lanc else 0 end, 2) as pago_rat
    from rat
  )
  -- Equipamentos e imoveis: uma linha por bem (etapa).
  select 'equipamento'::text, c.raiz, c.centro_id, c.centro, null::uuid, null::text, null::text,
         string_agg(distinct c.fornecedor, ', '), min(c.mes_competencia), count(distinct c.lancamento_id)::int,
         null::int, null::int, sum(c.valor), sum(c.pago_rat), sum(c.valor) - sum(c.pago_rat)
  from calc c where not c.consorcio
  group by c.raiz, c.centro_id, c.centro
  union all
  -- Consorcios a contemplar: uma linha por lancamento (cota).
  select 'consorcio'::text, c.raiz, c.centro_id, c.centro, c.lancamento_id, c.numero, c.descricao, c.fornecedor,
         c.mes_competencia, 1, c.np, c.npg, c.valor, c.pago_rat, c.valor - c.pago_rat
  from calc c where c.consorcio
  order by 1 desc, 2, 4, 6;
end;
$function$;

revoke all on function public.fn_rel_aquisicoes() from public, anon;
grant execute on function public.fn_rel_aquisicoes() to authenticated;
