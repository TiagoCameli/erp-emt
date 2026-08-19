-- =============================================================
-- Saldo inicial das contas, recalculado sobre a carga correta
--
-- O saldo inicial anterior foi calculado sobre a carga estimada, que tinha
-- R$ 3,1 milhoes a mais. Com a carga correta no lugar, ele passou a estar
-- errado nas cinco contas.
--
-- Escolha do Tiago, mantida: "so o necessario, as contas terminam em zero".
-- saldo_inicial = exatamente o que saiu de cada conta, entao o saldo de hoje
-- fecha em zero e o ERP nao inventa dinheiro que ninguem conferiu.
--
-- DERIVADO DOS DADOS, e nao cinco numeros digitados: numero escrito a mao
-- aqui envelhece na primeira correcao de carga, como acabou de acontecer.
--
-- Conferido contra a origem antes de rodar: BB 102.124-9 R$ 38.965.880,83,
-- CAIXA R$ 8.694.886,12, BB 30.893-5 R$ 1.330.562,70, CAIXINHA
-- R$ 604.216,42, BB 1197-5 R$ 137.833,03. Soma R$ 49.733.379,10, igual ao
-- pago total.
--
-- CONSEQUENCIA, de proposito: com saldo zero, fn_pagar_parcela recusa o
-- proximo pagamento por saldo insuficiente ate alguem informar o saldo real
-- em Financeiro > Contas bancarias. E a guarda funcionando.
-- =============================================================

update public.contas_bancarias c
set saldo_inicial = coalesce((
  select sum(case when l.tipo = 'a_receber' then -p.valor_liquido else p.valor_liquido end)
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.conta_bancaria_id = c.id and p.status = 'pago'
), 0);
