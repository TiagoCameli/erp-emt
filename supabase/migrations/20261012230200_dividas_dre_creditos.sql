-- Dividas: juros dos contratos e taxa de administracao dos consorcios no DRE,
-- no mes do vencimento da parcela (PR 5 do controle total, 12/10/2026).
--
-- O lancamento das parcelas fica como esta (contrato: "Pagamento de
-- Emprestimo", movimentacao; consorcio: "Consorcio a contemplar",
-- investimento). Para cada parcela do cronograma vencendo no periodo, o DRE
-- ganha +juros/encargos em "Juros de emprestimos" (ou +taxa adm + fundo de
-- reserva em "Taxa de administracao de consorcio") e -o mesmo na categoria do
-- lancamento. So de contrato/cota ligado a um lancamento nao cancelado.

-- Definer: o DRE e security invoker e o cronograma so e visivel com
-- financeiro.dividas; o DRE nao pode mudar conforme quem olha.
create or replace function public.fn_dre_linhas_do_cronograma(p_inicio date, p_fim date)
returns table (categoria_id uuid, valor numeric)
language sql
stable
security definer
set search_path to ''
as $function$
  with base as (
    select (select cf.id from public.categorias_financeiras cf where cf.nome = 'Juros de empréstimos') as cat_nova,
           coalesce((select r.categoria_id from public.lancamento_rateios r where r.lancamento_id = l.id order by r.valor desc limit 1),
                    l.categoria_id) as cat_lanc,
           cr.juros + cr.encargos as valor
    from public.contratos_divida d
    join public.lancamentos l on l.id = d.lancamento_id and l.status <> 'cancelado'
    join public.contrato_divida_cronograma cr on cr.contrato_id = d.id and cr.substituida_em is null and cr.tipo = 'parcela'
    where cr.vencimento >= date_trunc('month', p_inicio)::date and cr.vencimento < p_fim
      and cr.juros + cr.encargos > 0
    union all
    select (select cf.id from public.categorias_financeiras cf where cf.nome = 'Taxa de administração de consórcio'),
           coalesce((select r.categoria_id from public.lancamento_rateios r where r.lancamento_id = l.id order by r.valor desc limit 1),
                    l.categoria_id),
           cr.taxa_adm + cr.fundo_reserva
    from public.consorcio_cotas q
    join public.lancamentos l on l.id = q.lancamento_id and l.status <> 'cancelado'
    join public.consorcio_cota_cronograma cr on cr.cota_id = q.id
    where cr.vencimento >= date_trunc('month', p_inicio)::date and cr.vencimento < p_fim
      and cr.taxa_adm + cr.fundo_reserva > 0
  )
  select x.categoria_id, sum(x.valor)
  from (
    select b.cat_nova as categoria_id, b.valor from base b where b.cat_lanc is not null and b.cat_nova is not null
    union all
    select b.cat_lanc, -b.valor from base b where b.cat_lanc is not null and b.cat_nova is not null
  ) x
  where public.tem_permissao('financeiro.relatorios', 'ver')
  group by x.categoria_id;
$function$;
revoke all on function public.fn_dre_linhas_do_cronograma(date, date) from public, anon;
grant execute on function public.fn_dre_linhas_do_cronograma(date, date) to authenticated;

CREATE OR REPLACE FUNCTION public.fn_rel_dre(p_inicio date, p_fim date)
 RETURNS TABLE(tipo text, categoria_id uuid, categoria text, natureza text, total numeric, retencao numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$

  with doc as (
    select
      l.id,
      (coalesce(l.retencao_iss, 0) + coalesce(l.retencao_pis, 0)
       + coalesce(l.retencao_cofins, 0) + coalesce(l.retencao_csll, 0)
       + coalesce(l.retencao_ir, 0) + coalesce(l.retencao_inss, 0)
       + coalesce(l.retencao_outras, 0)) as retencao_doc,
      (select sum(r2.valor) from public.lancamento_rateios r2
       where r2.lancamento_id = l.id) as rateio_do_doc
    from public.lancamentos l
    where l.status <> 'cancelado'
      and l.mes_competencia >= date_trunc('month', p_inicio)::date
      and l.mes_competencia < p_fim
  ),
  base as (
  select
    l.tipo,
    c.id as categoria_id,
    c.nome as categoria,
    -- Sem categoria cai em operacional: sumir com despesa por falta de
    -- cadastro seria pior.
    coalesce(c.natureza, 'operacional') as natureza,
    r.valor as total,
    coalesce(d.retencao_doc * r.valor / nullif(d.rateio_do_doc, 0), 0) as retencao
  from doc d
  join public.lancamentos l on l.id = d.id
  join public.lancamento_rateios r on r.lancamento_id = l.id
  left join public.categorias_financeiras c
    on c.id = coalesce(r.categoria_id, l.categoria_id)
  -- Ajuste de abertura de aplicacao: saldo anterior e rendimento passado,
  -- nao e movimento do periodo (Tiago, 25/09/2026).
  where not (l.origem = 'aplicacao' and coalesce(c.natureza, 'operacional') = 'movimentacao')
  ),
  -- Juros dos contratos e taxa dos consorcios no mes do vencimento: entram
  -- na categoria deles e saem da categoria do lancamento das parcelas (o total
  -- geral nao muda). Ver fn_dre_linhas_do_cronograma.
  cron as (
    select 'a_pagar'::text as tipo, cr.categoria_id, c.nome as categoria, c.natureza, cr.valor as total, 0::numeric as retencao
    from public.fn_dre_linhas_do_cronograma(p_inicio, p_fim) cr
    join public.categorias_financeiras c on c.id = cr.categoria_id
  )
  select x.tipo, x.categoria_id, x.categoria, coalesce(x.natureza, 'operacional'), sum(x.total),
         round(sum(x.retencao), 2)
  from (select * from base union all select * from cron) x
  group by x.tipo, x.categoria_id, x.categoria, x.natureza
$function$;

-- ---------- Creditos: contratos e consorcios ----------
-- Parcela paga: a do lancamento com o mesmo numero esta paga (sem lancamento
-- ligado, vale o vencimento ate a data). Linha de evento (amortizacao,
-- quitacao, renegociacao) ja aconteceu. Saldo devedor de principal = principal
-- ainda nao pago na versao atual (parcela atrasada continua devida).
create or replace function public.fn_rel_dividas_contratos(p_data date)
returns table (
  contrato_id uuid, credor text, numero text, tipo text, status text, centro_custo_id uuid, centro text,
  valor_liberado numeric, data_liberacao date, taxa_am numeric, sistema text, tem_cronograma boolean,
  principal_pago numeric, saldo_devedor numeric, juros_pagos numeric, juros_a_pagar numeric,
  proximas jsonb, fluxo jsonb)
language sql
stable
security definer
set search_path to ''
as $function$
  with linhas as (
    select cr.*, d.lancamento_id,
      case
        when cr.tipo <> 'parcela' then cr.vencimento <= p_data
        when d.lancamento_id is null then cr.vencimento <= p_data
        else exists (select 1 from public.lancamento_parcelas p
                      where p.lancamento_id = d.lancamento_id and p.numero_parcela = cr.numero and p.status = 'pago')
      end as pago
    from public.contrato_divida_cronograma cr
    join public.contratos_divida d on d.id = cr.contrato_id
    where cr.substituida_em is null
  )
  select d.id, d.credor, d.numero, d.tipo, d.status, d.centro_custo_id, cc.nome,
    d.valor_liberado, d.data_liberacao, d.taxa_am, d.sistema,
    exists (select 1 from linhas l where l.contrato_id = d.id),
    coalesce((select sum(l.principal) from linhas l where l.contrato_id = d.id and l.pago), 0),
    coalesce((select sum(l.principal) from linhas l where l.contrato_id = d.id and not l.pago),
             case when exists (select 1 from linhas l where l.contrato_id = d.id) then 0 else d.valor_liberado end),
    coalesce((select sum(l.juros + l.encargos) from linhas l where l.contrato_id = d.id and l.pago), 0),
    coalesce((select sum(l.juros + l.encargos) from linhas l where l.contrato_id = d.id and not l.pago), 0),
    coalesce((select jsonb_agg(jsonb_build_object('numero', x.numero, 'vencimento', x.vencimento, 'principal', x.principal,
                'juros', x.juros, 'encargos', x.encargos, 'total', x.principal + x.juros + x.encargos) order by x.vencimento)
              from (select * from linhas l where l.contrato_id = d.id and not l.pago order by l.vencimento limit 12) x), '[]'::jsonb),
    jsonb_build_array(jsonb_build_object('data', d.data_liberacao, 'valor', d.valor_liberado))
      || coalesce((select jsonb_agg(jsonb_build_object('data', l.vencimento, 'valor', -(l.principal + l.juros + l.encargos))
                     order by l.vencimento) from linhas l where l.contrato_id = d.id and l.tipo <> 'renegociacao'), '[]'::jsonb)
  from public.contratos_divida d
  left join public.centros_custo cc on cc.id = d.centro_custo_id
  where public.tem_permissao('financeiro.relatorios', 'ver') or public.tem_permissao('financeiro.dividas', 'ver')
  order by d.status, d.credor, d.numero;
$function$;

-- Consorcio: pago e a pagar por parte; depois de contemplada, o que falta
-- pagar e divida (D9).
create or replace function public.fn_rel_consorcios(p_data date)
returns table (
  cota_id uuid, administradora text, grupo text, cota text, bem text, status text, valor_credito numeric, prazo smallint,
  parcelas_pagas int, fundo_comum_pago numeric, taxa_paga numeric, a_pagar numeric, divida numeric,
  contemplacao_data date, contemplacao_forma text, valor_carta numeric, proximas jsonb)
language sql
stable
security definer
set search_path to ''
as $function$
  with linhas as (
    select cr.*, case when q.lancamento_id is null then cr.vencimento <= p_data
                      else exists (select 1 from public.lancamento_parcelas p
                                    where p.lancamento_id = q.lancamento_id and p.numero_parcela = cr.numero and p.status = 'pago')
                 end as pago
    from public.consorcio_cota_cronograma cr join public.consorcio_cotas q on q.id = cr.cota_id
  )
  select q.id, q.administradora, q.grupo, q.cota, q.bem, q.status, q.valor_credito, q.prazo,
    (select count(*)::int from linhas l where l.cota_id = q.id and l.pago),
    coalesce((select sum(l.fundo_comum) from linhas l where l.cota_id = q.id and l.pago), 0),
    coalesce((select sum(l.taxa_adm + l.fundo_reserva) from linhas l where l.cota_id = q.id and l.pago), 0),
    coalesce((select sum(l.fundo_comum + l.taxa_adm + l.fundo_reserva) from linhas l where l.cota_id = q.id and not l.pago), 0),
    case when q.status = 'contemplada'
         then coalesce((select sum(l.fundo_comum + l.taxa_adm + l.fundo_reserva) from linhas l where l.cota_id = q.id and not l.pago), 0)
         else 0 end,
    q.contemplacao_data, q.contemplacao_forma, q.valor_carta,
    coalesce((select jsonb_agg(jsonb_build_object('numero', x.numero, 'vencimento', x.vencimento,
                'total', x.fundo_comum + x.taxa_adm + x.fundo_reserva) order by x.vencimento)
              from (select * from linhas l where l.cota_id = q.id and not l.pago order by l.vencimento limit 12) x), '[]'::jsonb)
  from public.consorcio_cotas q
  where public.tem_permissao('financeiro.relatorios', 'ver') or public.tem_permissao('financeiro.dividas', 'ver')
  order by q.status, q.administradora, q.grupo, q.cota;
$function$;
revoke all on function public.fn_rel_dividas_contratos(date), public.fn_rel_consorcios(date) from public, anon;
grant execute on function public.fn_rel_dividas_contratos(date), public.fn_rel_consorcios(date) to authenticated;
