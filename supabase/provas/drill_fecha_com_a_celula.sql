-- Prova: o total do drill-down fecha com a célula do relatório, nos seis.
--
-- POR QUE ELA CONSTRÓI O CASO EM VEZ DE CONFERIR O DADO DE HOJE. Medido em
-- 14/08/2026 a base tem 0 lançamentos cancelados, 0 previstos e 0 parcelas sem
-- vencimento. Então o caminho ERRADO (não excluir cancelado, não excluir
-- previsto, reconstruir a faixa do aging por data) daria exatamente o mesmo
-- número do caminho certo, e uma prova escrita sobre o retrato de hoje passaria
-- sem provar nada. Ela insere o caso parcial numa transação REVERTIDA e confere
-- com ele dentro.
--
-- Como ler o resultado: toda linha tem que sair com `dif` = 0, MENOS a última.
-- A última (`CONTROLE_sem_a_trava_da_erro`) tem que dar 50000.00: ela roda a
-- mesma conta de propósito SEM a exclusão de cancelado, e é o que prova que a
-- prova é capaz de pegar o erro. Se um dia ela também der zero, a prova parou de
-- provar (o caso construído sumiu) e é ela que precisa de conserto.
--
-- Rodado em 14/08/2026: as seis primeiras deram 0.00 e o controle deu 50000.00.
--
-- Rodar com: mcp execute_sql, o arquivo inteiro de uma vez.

begin;

-- ---------------------------------------------------------------------------
-- O caso parcial
-- ---------------------------------------------------------------------------
-- 1. Um lançamento RATEADO 60/40 entre duas obras. É o caso dos 121 lançamentos
--    reais: a célula do relatório conta só a parte de cada centro, e a lista
--    mostraria o valor cheio se o recorte não existisse.
-- 2. Um CANCELADO no mesmo mês e centro. O relatório não conta; a lista sem
--    `sem_cancelado` contaria.
-- 3. Um PREVISTO no mesmo mês e centro. O relatório conta por padrão (é o
--    comportamento histórico) e deixa de contar com `sem_previsto`.
-- 4. Uma parcela PAGA em mês diferente do vencimento. O fluxo de caixa agrupa o
--    realizado pelo mês do PAGAMENTO; um drill por faixa de vencimento erraria.
insert into lancamentos (origem, descricao, valor, tipo, status, mes_competencia, data_compra, data_vencimento, categoria_id)
select 'manual', d.descricao, d.valor, 'a_pagar', d.status, date '2026-07-01', date '2026-07-05', date '2026-07-25',
       (select id from categorias_financeiras order by nome limit 1)
from (values
  ('PROVA rateado 60/40', 100000.00, 'aprovado'),
  ('PROVA cancelado',      50000.00, 'cancelado'),
  ('PROVA previsto',       30000.00, 'previsto'),
  ('PROVA pago fora do mes', 8000.00, 'pago')
) as d(descricao, valor, status);

-- Rateios: o primeiro dividido 60/40, os outros três inteiros no centro A.
insert into lancamento_rateios (lancamento_id, centro_custo_id, valor)
select l.id,
       (select id from centros_custo where nome = '009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10'),
       case when l.descricao = 'PROVA rateado 60/40' then 60000.00 else l.valor end
from lancamentos l where l.descricao like 'PROVA %';

insert into lancamento_rateios (lancamento_id, centro_custo_id, valor)
select l.id,
       (select id from centros_custo where nome = '007 - AC 405 - Lote 2'),
       40000.00
from lancamentos l where l.descricao = 'PROVA rateado 60/40';

-- Parcelas: uma por lançamento. A do "pago fora do mes" vence em 07/2026 e é
-- paga em 08/2026, com desconto (para o líquido diferir do valor).
--
-- `valor_liquido` NÃO entra no insert: é coluna GERADA (valor menos desconto), e
-- o Postgres recusa valor não-DEFAULT nela. Isso também quer dizer que ela nunca
-- fica nula por descuido — o `coalesce(valor_liquido, valor)` do código é defesa
-- contra parcela antiga, não contra o caminho normal.
insert into lancamento_parcelas
  (lancamento_id, numero_parcela, valor, desconto, data_vencimento, status, conta_bancaria_id, data_pagamento)
select l.id, 1, l.valor,
       case when l.descricao = 'PROVA pago fora do mes' then 500.00 else 0 end,
       date '2026-07-25',
       case when l.descricao = 'PROVA pago fora do mes' then 'pago' else 'pendente' end,
       (select id from contas_bancarias order by nome limit 1),
       case when l.descricao = 'PROVA pago fora do mes' then date '2026-08-10' else null end
from lancamentos l where l.descricao like 'PROVA %';

-- ---------------------------------------------------------------------------
-- 1. Custo por centro de custo: célula vs os rateios que o drill vai listar
-- ---------------------------------------------------------------------------
select 'custo_centro (padrao, previsto DENTRO)' as prova,
       coalesce(sum(abs(coalesce(c.total,0) - coalesce(d.total,0))), 0) as dif
from (
  select centro_custo_id, total from fn_rel_custo_centro_custo(p_inicio => date '2026-07-01', p_fim => date '2026-08-01')
) c
full join (
  select r.centro_custo_id, sum(r.valor) as total
  from lancamento_rateios r
  join lancamentos l on l.id = r.lancamento_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and l.mes_competencia >= date '2026-07-01' and l.mes_competencia < date '2026-08-01'
  group by r.centro_custo_id
) d on d.centro_custo_id = c.centro_custo_id

union all

-- Mesma conta com previsto FORA: é o que o drill manda quando sem_previsto=1.
select 'custo_centro (sem_previsto=1)',
       coalesce(sum(abs(coalesce(c.total,0) - coalesce(d.total,0))), 0)
from (
  select centro_custo_id, total
  from fn_rel_custo_centro_custo(p_inicio => date '2026-07-01', p_fim => date '2026-08-01', p_excluir_previsto => true)
) c
full join (
  select r.centro_custo_id, sum(r.valor) as total
  from lancamento_rateios r
  join lancamentos l on l.id = r.lancamento_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and l.status <> 'previsto'
    and l.mes_competencia >= date '2026-07-01' and l.mes_competencia < date '2026-08-01'
  group by r.centro_custo_id
) d on d.centro_custo_id = c.centro_custo_id

union all

-- ---------------------------------------------------------------------------
-- 2. Aging: faixa a faixa, os dois tipos
-- ---------------------------------------------------------------------------
select 'aging',
       coalesce(sum(abs(coalesce(a.total,0) - coalesce(d.total,0))), 0)
from (select faixa_aging, tipo, sum(total) as total from fn_rel_aging() group by 1,2) a
full join (
  select f.faixa, t.tipo, sum(r.valor_no_recorte) as total
  from (values ('a_vencer'),('v_1_7'),('v_8_15'),('v_16_30'),('v_31_60'),('v_60_mais')) f(faixa)
  cross join (values ('a_pagar'),('a_receber')) t(tipo)
  cross join lateral fn_lancamentos_do_recorte('aging', f.faixa, t.tipo, null, null, null, null) r
  group by f.faixa, t.tipo
) d on d.faixa = a.faixa_aging and d.tipo = a.tipo

union all

-- ---------------------------------------------------------------------------
-- 3. Fluxo de caixa: mês a mês, realizado e previsto
-- ---------------------------------------------------------------------------
select 'fluxo',
       coalesce(sum(abs(f.total - coalesce(d.total,0))), 0)
from (select mes, tipo, realizado, sum(total) as total from fn_rel_fluxo_caixa() group by 1,2,3) f
left join lateral (
  select sum(x.valor_no_recorte) as total
  from fn_lancamentos_do_recorte('fluxo', null, null, f.mes, f.realizado, null, null) x
  join lancamentos l on l.id = x.lancamento_id
  where l.tipo = f.tipo
) d on true

union all

-- ---------------------------------------------------------------------------
-- 4. Posição bancária: conta a conta, pelo líquido
-- ---------------------------------------------------------------------------
select 'posicao_bancaria',
       coalesce(sum(abs(p.total - coalesce(d.total,0))), 0)
from (select conta_bancaria_id, tipo, sum(total) as total from fn_rel_posicao_bancaria() group by 1,2) p
left join lateral (
  select sum(x.valor_no_recorte) as total
  from fn_lancamentos_do_recorte('conta_paga', null, null, null, null, p.conta_bancaria_id, null) x
  join lancamentos l on l.id = x.lancamento_id
  where l.tipo = p.tipo
) d on true

union all

-- ---------------------------------------------------------------------------
-- 5 e 6. DRE e grupo de insumo somam o VALOR do lançamento, que é o que a
--        listagem já soma. A prova aqui é a invariante que sustenta isso: a soma
--        dos rateios de um lançamento é igual ao valor dele.
-- ---------------------------------------------------------------------------
select 'rateio_fecha_com_o_valor',
       count(*)::numeric
from lancamentos l
join (select lancamento_id, sum(valor) as soma from lancamento_rateios group by 1) r
  on r.lancamento_id = l.id
where r.soma <> l.valor

union all

-- ---------------------------------------------------------------------------
-- 7. A trava que o caso construído existe para exercer: SEM o `sem_cancelado`, o
--    drill do custo por centro traria o cancelado e passaria da célula. Esta
--    linha tem que dar DIFERENTE de zero — é a prova de que a prova funciona.
--    (esperado: 50.000,00, o valor do lançamento cancelado)
-- ---------------------------------------------------------------------------
select 'CONTROLE_sem_a_trava_da_erro',
       coalesce(sum(abs(coalesce(c.total,0) - coalesce(d.total,0))), 0)
from (
  select centro_custo_id, total from fn_rel_custo_centro_custo(p_inicio => date '2026-07-01', p_fim => date '2026-08-01')
) c
full join (
  select r.centro_custo_id, sum(r.valor) as total
  from lancamento_rateios r
  join lancamentos l on l.id = r.lancamento_id
  where l.tipo = 'a_pagar'
    -- de propósito SEM o `and l.status <> 'cancelado'`
    and l.mes_competencia >= date '2026-07-01' and l.mes_competencia < date '2026-08-01'
  group by r.centro_custo_id
) d on d.centro_custo_id = c.centro_custo_id;

rollback;
