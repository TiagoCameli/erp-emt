-- =============================================================
-- Saldo inicial das contas depois da carga do historico
--
-- A carga gravou 7.663 parcelas pagas, R$ 49.516.950,73 saindo das cinco
-- contas. O saldo de uma conta no app e derivado, nao guardado:
--
--   saldo = saldo_inicial + soma(parcelas pagas: +a_receber, -a_pagar)
--
-- Com saldo_inicial zero, as contas passaram a exibir milhoes NEGATIVOS,
-- que e um numero errado na cara do usuario: o dinheiro existia quando
-- esses pagamentos aconteceram, so nao existia no ERP.
--
-- Escolha do Tiago: "so o necessario, as contas terminam em zero". Ou
-- seja, saldo_inicial = exatamente o que saiu de cada conta, e o saldo de
-- hoje fecha em zero. O ERP nao inventa dinheiro que ninguem conferiu.
--
-- DERIVADO DOS DADOS, e nao cinco numeros digitados: numero digitado a
-- mao nesta migration ja nasceria diferente do banco, porque o
-- arredondamento do centavo na divisao das parcelas so se conhece depois
-- de gravar.
--
-- CONSEQUENCIA, de proposito: com saldo zero, fn_pagar_parcela recusa o
-- proximo pagamento por saldo insuficiente, ate alguem informar o saldo
-- real das contas em Financeiro > Contas bancarias. Isso e a guarda
-- fazendo o trabalho dela, nao um efeito colateral.
-- =============================================================

update public.contas_bancarias c
set saldo_inicial = coalesce((
  select sum(case when l.tipo = 'a_receber' then -p.valor_liquido else p.valor_liquido end)
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.conta_bancaria_id = c.id and p.status = 'pago'
), 0)
where exists (
  select 1 from public.lancamento_parcelas p
  where p.conta_bancaria_id = c.id and p.status = 'pago'
);
