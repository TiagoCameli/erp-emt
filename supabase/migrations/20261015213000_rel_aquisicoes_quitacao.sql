-- Equipamentos e consórcios: quanto falta pagar e até quando (15/10/2026).
--
-- `fn_rel_aquisicoes_quitacao` é a `fn_rel_aquisicoes` com, por linha:
--
--   parcelas_abertas     parcelas não pagas nem canceladas dos lançamentos do
--                        bem (no consórcio, do cronograma da cota).
--   proximo_vencimento   a primeira delas.
--   ultimo_vencimento    a última: a quitação, se nada mudar.
--   divida               'contrato' quando o financiamento do bem está em
--                        Financeiro > Dívidas (contratos_divida), 'cota' quando
--                        a cota de consórcio está lá (consorcio_cotas), null
--                        quando não está.
--
-- O A PAGAR DO CONSÓRCIO passa a vir do cronograma da cota em Dívidas
-- (`consorcio_cota_cronograma`, a mesma regra de `fn_rel_consorcios`: parcela
-- do cronograma paga quando a parcela de mesmo número do lançamento está
-- paga). O PAGO continua sendo o dinheiro que saiu (parcelas do lançamento).
-- Em 15/10/2026 as duas fontes diferem em R$ 6,97 nas cotas Randon 0130 e 0160
-- (arredondamento do cronograma): valor - pago deixa de ser igual ao a pagar
-- nessas duas, e a tela aponta a diferença. Cota sem cronograma cai no
-- lançamento, como antes.
--
-- Função NOVA, ao lado da antiga, em vez de trocar o tipo de retorno da
-- `fn_rel_aquisicoes` (que pediria DROP): o cliente em produção continua
-- chamando a antiga até o deploy, e ela pode sair numa limpeza depois.

create or replace function public.fn_rel_aquisicoes_quitacao()
returns table(
  tipo text,
  grupo text,
  centro_id uuid,
  centro text,
  lancamento_id uuid,
  numero text,
  descricao text,
  fornecedor text,
  primeira_competencia date,
  lancamentos integer,
  parcelas integer,
  parcelas_pagas integer,
  valor numeric,
  pago numeric,
  a_pagar numeric,
  parcelas_abertas integer,
  proximo_vencimento date,
  ultimo_vencimento date,
  divida text
)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
begin
  if not public.tem_permissao('financeiro.relatorios', 'ver') then
    raise exception 'Sem permissao para ver relatorios';
  end if;

  return query
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
    where et.imobilizado or (ct.id is not null and not et.indireto)
  ),
  calc as (
    select rat.*,
           round(case when rat.total_lanc > 0 then rat.valor * rat.pago_lanc / rat.total_lanc else 0 end, 2) as pago_rat
    from rat
  ),
  -- Parcelas abertas dos lançamentos de cada bem (uma vez por parcela, mesmo
  -- que o lançamento esteja rateado entre vários bens: o vencimento é dele).
  abertas_bem as (
    select b.centro_id,
           count(*)::int as n,
           min(p.data_vencimento) as proximo,
           max(p.data_vencimento) as ultimo
    from (select distinct c.centro_id, c.lancamento_id from calc c where not c.consorcio) b
    join public.lancamento_parcelas p on p.lancamento_id = b.lancamento_id
    where p.status not in ('pago', 'cancelado')
    group by b.centro_id
  ),
  bem_em_dividas as (
    select distinct c.centro_id
    from calc c
    join public.contratos_divida cd on cd.lancamento_id = c.lancamento_id or cd.centro_custo_id = c.centro_id
    where not c.consorcio
  ),
  -- Cronograma da cota, com a mesma regra de pago de `fn_rel_consorcios`.
  cronograma as (
    select q.lancamento_id, cr.vencimento, cr.fundo_comum + cr.taxa_adm + cr.fundo_reserva as total,
           case when q.lancamento_id is null then cr.vencimento <= v_hoje
                else exists (select 1 from public.lancamento_parcelas p
                              where p.lancamento_id = q.lancamento_id and p.numero_parcela = cr.numero and p.status = 'pago')
           end as pago
    from public.consorcio_cota_cronograma cr
    join public.consorcio_cotas q on q.id = cr.cota_id
    where q.lancamento_id is not null
  ),
  cota as (
    select cg.lancamento_id,
           coalesce(sum(cg.total) filter (where not cg.pago), 0) as a_pagar,
           (count(*) filter (where not cg.pago))::int as n,
           min(cg.vencimento) filter (where not cg.pago) as proximo,
           max(cg.vencimento) filter (where not cg.pago) as ultimo
    from cronograma cg
    group by cg.lancamento_id
  ),
  abertas_lanc as (
    select c.lancamento_id,
           count(*)::int as n,
           min(p.data_vencimento) as proximo,
           max(p.data_vencimento) as ultimo
    from (select distinct c.lancamento_id from calc c where c.consorcio) c
    join public.lancamento_parcelas p on p.lancamento_id = c.lancamento_id
    where p.status not in ('pago', 'cancelado')
    group by c.lancamento_id
  )
  select 'equipamento'::text, c.raiz, c.centro_id, c.centro, null::uuid, null::text, null::text,
         string_agg(distinct c.fornecedor, ', '), min(c.mes_competencia), count(distinct c.lancamento_id)::int,
         null::int, null::int, sum(c.valor), sum(c.pago_rat), sum(c.valor) - sum(c.pago_rat),
         coalesce(max(ab.n), 0), max(ab.proximo), max(ab.ultimo),
         case when bool_or(bd.centro_id is not null) then 'contrato' end
  from calc c
  left join abertas_bem ab on ab.centro_id = c.centro_id
  left join bem_em_dividas bd on bd.centro_id = c.centro_id
  where not c.consorcio
  group by c.raiz, c.centro_id, c.centro
  union all
  select 'consorcio'::text, c.raiz, c.centro_id, c.centro, c.lancamento_id, c.numero, c.descricao, c.fornecedor,
         c.mes_competencia, 1, c.np, c.npg, c.valor,
         c.pago_rat,
         case when ct.lancamento_id is not null then ct.a_pagar else c.valor - c.pago_rat end,
         coalesce(ct.n, al.n, 0), coalesce(ct.proximo, al.proximo), coalesce(ct.ultimo, al.ultimo),
         case when ct.lancamento_id is not null then 'cota' end
  from calc c
  left join cota ct on ct.lancamento_id = c.lancamento_id
  left join abertas_lanc al on al.lancamento_id = c.lancamento_id
  where c.consorcio
  order by 1 desc, 2, 4, 6;
end;
$function$;

revoke execute on function public.fn_rel_aquisicoes_quitacao() from public, anon;
grant execute on function public.fn_rel_aquisicoes_quitacao() to authenticated;
