-- Relatórios "Resultado por obra" e "Indireto" (15/10/2026).
--
-- 1. fn_rel_rateio_indireto_meses: o rateio do indireto MÊS A MÊS numa janela.
--    `fn_rateio_indireto_periodo` soma a janela inteira e perde o mês, e as duas
--    telas novas precisam dele (a matriz mês x obra e a linha de cada mês do
--    Indireto). É a mesma `fn_rateio_indireto_mes` por baixo, então o número não
--    tem como divergir do rateio que o Tiago ajusta e confirma.
--
-- 2. fn_rel_obras_ponte_dre: os termos que separam o custo e a receita das obras
--    (fn_rel_custo_receita) do custo e da receita operacionais do DRE (fn_rel_dre)
--    no mesmo período. Medido em jan-set/2026: DRE 30.177.437,50 de custo
--    operacional contra 30.086.303,48 das obras, diferença 91.134,02 =
--    77.130,08 operacional lançado em centro fora das obras (imobilizado)
--    + 28.721,28 de juros do cronograma que o DRE reclassifica para operacional
--    - 14.717,34 de despesa financeira lançada nas obras (o custo da obra conta,
--    o operacional do DRE não). A tela mostra os termos para fechar com o DRE.

create or replace function public.fn_rel_rateio_indireto_meses(p_inicio date, p_fim date)
returns table(mes date, centro_id uuid, centro text, custo_direto numeric, indireto numeric,
              status text, nao_rateado numeric, custo_indireto_mes numeric)
language sql
stable
set search_path to ''
as $$
  -- A permissão é cobrada por fn_rateio_indireto_mes, que é SECURITY DEFINER.
  select g.mes::date, m.centro_id, m.centro, m.custo_direto, m.indireto,
         m.status, m.nao_rateado, m.custo_indireto_mes
    from generate_series(date_trunc('month', p_inicio)::date,
                         (p_fim - interval '1 day')::date, interval '1 month') g(mes)
    cross join lateral public.fn_rateio_indireto_mes(g.mes::date) m
$$;

create or replace function public.fn_rel_obras_ponte_dre(p_inicio date, p_fim date)
returns table(termo text, valor numeric)
language sql
stable
set search_path to ''
as $$
  with recursive raizes as (
    select c.id as centro_id, c.tipo as raiz_tipo
      from public.centros_custo c where c.pai_id is null
    union all
    select f.id, a.raiz_tipo from public.centros_custo f join raizes a on f.pai_id = a.centro_id
  ),
  base as (
    select l.tipo,
           coalesce(cat.natureza, 'operacional') as natureza,
           -- Os mesmos tipos de raiz que fn_rel_custo_receita deixa de fora.
           coalesce(a.raiz_tipo, '') in ('financeiro', 'investimento', 'socio', 'empresa_ligada', 'imobilizado') as fora,
           r.valor
      from public.vw_custo_rateios r
      join public.lancamentos l on l.id = r.lancamento_id
      join raizes a on a.centro_id = r.centro_custo_id
      left join public.categorias_financeiras cat on cat.id = coalesce(r.categoria_id, l.categoria_id)
     where l.status <> 'cancelado'
       and r.mes_competencia >= date_trunc('month', p_inicio)::date
       and r.mes_competencia < p_fim
  )
  select 'custo_operacional_fora_das_obras', round(coalesce(sum(valor), 0), 2)
    from base where tipo = 'a_pagar' and natureza = 'operacional' and fora
  union all
  select 'receita_operacional_fora_das_obras', round(coalesce(sum(valor), 0), 2)
    from base where tipo = 'a_receber' and natureza = 'operacional' and fora
  union all
  select 'despesa_financeira_nas_obras', round(coalesce(sum(valor), 0), 2)
    from base where tipo = 'a_pagar' and natureza = 'financeira' and not fora
  union all
  select 'cronograma_reclassificado_operacional', round(coalesce(sum(cr.valor), 0), 2)
    from public.fn_dre_linhas_do_cronograma(p_inicio, p_fim) cr
    join public.categorias_financeiras c on c.id = cr.categoria_id
   where c.natureza = 'operacional'
$$;

revoke all on function public.fn_rel_rateio_indireto_meses(date, date) from public, anon;
revoke all on function public.fn_rel_obras_ponte_dre(date, date) from public, anon;
grant execute on function public.fn_rel_rateio_indireto_meses(date, date) to authenticated;
grant execute on function public.fn_rel_obras_ponte_dre(date, date) to authenticated;
