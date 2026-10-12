-- Relatorios: aba "Custos indiretos" e Oficina fora de "Equipamentos e
-- consorcios" (Tiago, 12/10/2026).
--
-- fn_rel_custos_indiretos: o custo dos centros indiretos (papel_rateio =
-- 'indireto') por mes, etapa e categoria, com o mesmo criterio de custo de
-- fn_rel_custo_receita (o que o rateio do indireto distribui). A soma de um mes
-- e o custo_indireto_mes de fn_rateio_indireto_mes.

CREATE OR REPLACE FUNCTION public.fn_rel_aquisicoes()
 RETURNS TABLE(tipo text, grupo text, centro_id uuid, centro text, lancamento_id uuid, numero text, descricao text, fornecedor text, primeira_competencia date, lancamentos integer, parcelas integer, parcelas_pagas integer, valor numeric, pago numeric, a_pagar numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.tem_permissao('financeiro.relatorios', 'ver') then
    raise exception 'Sem permissao para ver relatorios';
  end if;

  return query
  -- Entra o rateio num centro de imobilizado OU com categoria de compra de
  -- equipamento/consorcio em qualquer centro (as carretas da 001 - Carretas
  -- EMT sao centro de obra com categoria Aquisicao de Equipamento).
  with etapas as (
    select e.id, e.nome, r.nome as raiz, r.tipo = 'imobilizado' as imobilizado,
           coalesce(r.papel_rateio, '') = 'indireto' as indireto
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
    -- Centro indireto (Escritorio, Manutencao, Colorado) nao entra: o que se
    -- compra para a oficina e custo indireto, e tem aba propria.
    where et.imobilizado or (ct.id is not null and not et.indireto)
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

create or replace function public.fn_rel_custos_indiretos(p_ano int)
returns table (mes date, raiz_id uuid, raiz text, centro_id uuid, centro text, categoria_id uuid, categoria text, total numeric)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.tem_permissao('financeiro.relatorios', 'ver') then
    raise exception 'Sem permissao para ver relatorios';
  end if;
  if p_ano is null then raise exception 'Informe o ano'; end if;

  return query
  with recursive raizes as (
    select c.id as centro_id, c.id as raiz_id from public.centros_custo c
    where c.pai_id is null and c.papel_rateio = 'indireto'
    union all
    select f.id, a.raiz_id from public.centros_custo f join raizes a on f.pai_id = a.centro_id
  )
  select l.mes_competencia, a.raiz_id, rz.nome, r.centro_custo_id, cc.nome, cat.id, coalesce(cat.nome, 'Sem categoria'),
         round(sum(r.valor), 2)
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  join raizes a on a.centro_id = r.centro_custo_id
  join public.centros_custo rz on rz.id = a.raiz_id
  join public.centros_custo cc on cc.id = r.centro_custo_id
  left join public.categorias_financeiras cat on cat.id = coalesce(r.categoria_id, l.categoria_id)
  where l.status <> 'cancelado'
    and l.tipo = 'a_pagar'
    -- O mesmo predicado de custo de fn_rel_custo_receita (sem investimento).
    and coalesce(cat.natureza, 'operacional') not in ('movimentacao', 'distribuicao', 'mutuo', 'investimento')
    and l.mes_competencia >= make_date(p_ano, 1, 1) and l.mes_competencia < make_date(p_ano + 1, 1, 1)
  group by l.mes_competencia, a.raiz_id, rz.nome, r.centro_custo_id, cc.nome, cat.id, cat.nome;
end;
$function$;
revoke all on function public.fn_rel_custos_indiretos(int) from public, anon;
grant execute on function public.fn_rel_custos_indiretos(int) to authenticated;
