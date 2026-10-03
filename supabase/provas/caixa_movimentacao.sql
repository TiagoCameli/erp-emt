-- Prova: caixa com movimentacao (D1) e CAPEX como investimento (D3).
-- So SELECT. Rodar no banco vivo antes e depois das migrations:
--   npx supabase db query --linked -f supabase/provas/caixa_movimentacao.sql
-- Cada linha e (bloco, item, funcao, independente, diferenca). Depois das
-- migrations, os blocos a, b, c e d tem de fechar com diferenca zero; o bloco e
-- mostra os totais do DRE por natureza para comparar antes x depois.
--
-- fn_saldos_das_contas filtra por fn_pode_ver_saldo (auth.uid()). A prova roda
-- como o Tiago (admin) para enxergar todas as contas.
select set_config('request.jwt.claims',
  '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', false);

with
-- (a) Saldo de cada conta ativa: funcao x soma independente.
saldo_funcao as (
  select s.conta_bancaria_id, s.saldo from public.fn_saldos_das_contas() s
),
parcelas_no_saldo as (
  select p.conta_bancaria_id,
         sum(case when l.tipo = 'a_receber' then p.valor_liquido else -p.valor_liquido end) as total
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  join public.contas_bancarias c on c.id = p.conta_bancaria_id
  where p.status = 'pago'
    and l.status <> 'cancelado'
    and (c.saldo_inicial_data is null or p.data_pagamento is null
         or p.data_pagamento > c.saldo_inicial_data)
  group by p.conta_bancaria_id
),
transf as (
  select x.conta, sum(x.valor) as total
  from (
    select t.conta_destino_id as conta, t.valor
    from public.transferencias_contas t
    join public.contas_bancarias c on c.id = t.conta_destino_id
    where c.saldo_inicial_data is null or t.data_transferencia > c.saldo_inicial_data
    union all
    select t.conta_origem_id, -(t.valor + t.tarifa)
    from public.transferencias_contas t
    join public.contas_bancarias c on c.id = t.conta_origem_id
    where c.saldo_inicial_data is null or t.data_transferencia > c.saldo_inicial_data
  ) x
  group by x.conta
),
bloco_a as (
  select 'a_saldo'::text as bloco, c.nome as item,
         sf.saldo as funcao,
         round(c.saldo_inicial + coalesce(pn.total, 0) + coalesce(tr.total, 0), 2) as independente
  from public.contas_bancarias c
  left join saldo_funcao sf on sf.conta_bancaria_id = c.id
  left join parcelas_no_saldo pn on pn.conta_bancaria_id = c.id
  left join transf tr on tr.conta = c.id
  where c.ativo
),
-- (b) Fluxo de caixa 2026-07 a 2026-12 por serie. A funcao antiga so devolve
-- a_pagar/a_receber; as series novas aparecem como diferenca ate a migration.
fluxo_funcao as (
  select f.mes, f.tipo, sum(f.total) as total
  from public.fn_rel_fluxo_caixa() f
  where f.mes between '2026-07' and '2026-12'
  group by f.mes, f.tipo
),
centro_financeiro as (
  select distinct r.lancamento_id
  from public.lancamento_rateios r
  join lateral (
    with recursive up as (
      select cc.id, cc.pai_id, cc.tipo from public.centros_custo cc where cc.id = r.centro_custo_id
      union all
      select c.id, c.pai_id, c.tipo from public.centros_custo c join up on c.id = up.pai_id
    )
    select up.tipo from up where up.pai_id is null
  ) raiz on true
  where raiz.tipo = 'financeiro'
),
fluxo_indep as (
  select to_char(p.mes_fluxo, 'YYYY-MM') as mes,
         case
           when coalesce(cf.natureza, 'operacional') <> 'movimentacao' then l.tipo
           when l.tipo = 'a_pagar' then 'amortizacao'
           when cfin.lancamento_id is not null then 'emprestimo_tomado'
           else 'a_receber'
         end as tipo,
         round(sum(p.valor_liquido), 2) as total
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  left join public.categorias_financeiras cf on cf.id = l.categoria_id
  left join centro_financeiro cfin on cfin.lancamento_id = l.id
  where p.status <> 'cancelado'
    and l.status <> 'cancelado'
    and not (l.origem = 'aplicacao' and coalesce(cf.natureza, 'operacional') = 'movimentacao')
    and to_char(p.mes_fluxo, 'YYYY-MM') between '2026-07' and '2026-12'
  group by 1, 2
),
bloco_b as (
  select 'b_fluxo'::text, coalesce(i.mes, f.mes) || ' ' || coalesce(i.tipo, f.tipo),
         coalesce(f.total, 0), coalesce(i.total, 0)
  from fluxo_indep i
  full join fluxo_funcao f on f.mes = i.mes and f.tipo = i.tipo
),
-- (c) Painel de competencias x Custo por centro, mes a mes (2026).
meses as (
  select generate_series('2026-01-01'::date, '2026-12-01'::date, interval '1 month')::date as mes
),
bloco_c as (
  select 'c_competencia'::text, to_char(m.mes, 'YYYY-MM'),
         coalesce((select cp.custo from public.fn_competencias_painel(24) cp where cp.mes = m.mes), 0),
         coalesce((select sum(cc.total)
                   from public.fn_rel_custo_centro_custo(m.mes, (m.mes + interval '1 month')::date) cc), 0)
  from meses m
),
-- (d) Painel de Gestao: pago no mes x soma das parcelas a pagar pagas no mes.
dias as (
  select d::date as hoje from (values ('2026-08-31'), ('2026-09-30'), ('2026-10-03')) v(d)
),
bloco_d as (
  select 'd_pago_mes'::text, to_char(d.hoje, 'YYYY-MM'),
         (select g.pago_mes_valor from public.fn_rel_gestao_financeiro_resumo(d.hoje) g),
         coalesce((select sum(p.valor_liquido)
                   from public.lancamento_parcelas p
                   join public.lancamentos l on l.id = p.lancamento_id
                   where l.tipo = 'a_pagar' and l.status <> 'cancelado' and p.status = 'pago'
                     and p.data_pagamento >= date_trunc('month', d.hoje)::date
                     and p.data_pagamento < (date_trunc('month', d.hoje) + interval '1 month')::date), 0)
  from dias d
),
-- (e) DRE jan-set/2026 por natureza. Informativo: a coluna "independente" e a
-- soma das tres categorias de CAPEX no mesmo periodo (pela categoria do rateio,
-- caindo na do lancamento), que e o quanto o operacional cai e o investimento sobe.
dre as (
  select d.tipo, d.natureza, sum(d.total) as total
  from public.fn_rel_dre('2026-01-01', '2026-10-01') d
  group by d.tipo, d.natureza
),
capex as (
  select round(sum(r.valor), 2) as total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  join public.categorias_financeiras c on c.id = coalesce(r.categoria_id, l.categoria_id)
  where l.status <> 'cancelado'
    and l.mes_competencia >= '2026-01-01' and l.mes_competencia < '2026-10-01'
    and c.nome in ('Aquisição de Equipamento', 'Investimentos', 'Compra de Terreno')
),
bloco_e as (
  select 'e_dre'::text, d.tipo || ' ' || d.natureza, d.total,
         case when d.natureza = 'investimento' then (select total from capex) end
  from dre d
  union all
  select 'e_dre', 'capex (3 categorias)', null, (select total from capex)
),
tudo as (
  select * from bloco_a
  union all select * from bloco_b
  union all select * from bloco_c
  union all select * from bloco_d
  union all select * from bloco_e
)
select t.bloco, t.item, t.funcao, t.independente,
       round(coalesce(t.funcao, 0) - coalesce(t.independente, 0), 2) as diferenca
from tudo t
order by t.bloco, t.item;
