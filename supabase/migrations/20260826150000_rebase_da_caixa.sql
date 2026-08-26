-- =============================================================
-- A CAIXA 578367973-5 passa a valer o dinheiro que existe
--
-- O TIAGO MANDOU O PRINT DO BANCO (26/08/2026, 09:26):
--   Saldo Atual ................ R$   280.923,65
--   CDB FLEX EMPRESARIAL ....... R$ 4.318.176,69
--   -------------------------------------------
--   o que a empresa tem ........ R$ 4.599.100,34
--
-- E o mesmo rebase que a 30.893-5 e a 102.124-9 receberam em 22/08: o saldo da
-- conta no ERP passa a ser o dinheiro medido no banco, numa data declarada, e o
-- movimento anterior a essa data para de somar.
--
-- ============================================================
-- O SALDO DISPONIVEL DO PRINT NAO ENTRA
-- ============================================================
-- A mesma tela mostra "Saldo Disponivel R$ 380.923,65", exatos R$ 100.000,00
-- acima do Saldo Atual. Essa diferenca e limite de credito, nao dinheiro da
-- empresa: entrar com ela inflaria o caixa em cem mil e, pior, faria o sistema
-- autorizar pagamento contra credito que ninguem decidiu tomar. Vale o Saldo
-- Atual, que e o proprio Tiago quem cita na mensagem.
--
-- ============================================================
-- POR QUE CORRENTE MAIS APLICADO, E NAO SO A CORRENTE
-- ============================================================
-- A conta corrente da Caixa fecha em R$ 0,00 quase todo dia: a Caixa faz
-- RESGATE AUTOMAT e APLICACAO AUTOMAT diariamente, entao tudo que entra e
-- aplicado e tudo que sai e resgatado antes. O dinheiro da empresa esta no CDB.
-- Registrar so a conta corrente diria que a EMT tem R$ 280 mil quando ela tem
-- R$ 4,6 milhoes -- e travaria os pagamentos, porque a fn_pagar_parcela recusa
-- por saldo. E a mesma decisao ja tomada para o BB Rende Fácil (opcao A, em
-- 20260822210000): saldo da conta = corrente + aplicado.
--
-- ============================================================
-- O QUE ESTE REBASE CORRIGE
-- ============================================================
-- O saldo_inicial estava em R$ 11.074.003,22, posto pela tela em 25/08 as 21:38
-- depois de quatro ajustes de carga direta. Ele nao era um saldo de abertura: era
-- o valor que faltava para o saldo dar um numero apresentavel, porque a conta tem
-- R$ 10,8 milhoes de ENTRADAS que nunca foram lancadas -- estao lancados
-- R$ 2,76 mi de entradas contra R$ 13,6 mi de saidas (pagamentos mais
-- transferencias). Com o saldo real de abertura de 2024 (R$ 32.149,00, do
-- extrato) e o movimento que existe hoje, a conta fecharia em
-- R$ -10.817.304,46.
--
-- A data de corte resolve isso sem inventar lancamento nenhum: o saldo passa a
-- ser o medido, e o movimento anterior fica registrado para custo, DRE e
-- historico, mas fora do saldo. As entradas que faltam continuam faltando -- e
-- continuam valendo a pena lancar, para o DRE de 2024 e 2025 ficar certo -- mas
-- agora o saldo nao depende mais delas.
--
-- ============================================================
-- A DATA: 26/08/2026
-- ============================================================
-- O print e de hoje, 09:26. Conferido antes de escolher: a parcela paga mais
-- recente nesta conta e de 24/08 (R$ 50.000,00) e nao existe movimento nem
-- transferencia em 25 ou 26/08. Entao nada lancado cai depois do corte, e o
-- saldo do ERP passa a ser exatamente o do print -- sem sobra e sem falta.
--
-- ============================================================
-- AS GUARDAS
-- ============================================================
-- A que TEM de mudar: o saldo da Caixa vai de R$ 224.549,76 para exatamente
-- R$ 4.599.100,34. Sem ela, "nada quebrou" seria verdade tambem se o update nao
-- tivesse pegado linha nenhuma.
-- A que NAO pode mudar: o saldo das outras quatro contas. Data de corte e coluna
-- por conta, mas as funcoes de saldo e de posicao bancaria sao globais: mexer no
-- filtro de uma conta e um jeito conhecido de mover o saldo de todas.
-- =============================================================

do $rebase$
declare
  v_caixa uuid;
  v_antes numeric; v_depois numeric;
  v_outras_antes jsonb; v_outras_depois jsonb;
  v_n int;
  -- 280.923,65 na conta corrente + 4.318.176,69 no CDB Flex Empresarial
  c_saldo constant numeric := 4599100.34;
  c_corte constant date := '2026-08-26';
begin
  select id into v_caixa from public.contas_bancarias
   where nome = 'CAIXA ECONOMICA 578367973-5';
  if v_caixa is null then
    raise exception 'Nao achei a conta CAIXA ECONOMICA 578367973-5.';
  end if;

  -- Nada lancado pode cair DEPOIS do corte, senao o saldo passa do print.
  select count(*) into v_n
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.conta_bancaria_id = v_caixa and p.status = 'pago'
    and p.data_pagamento > c_corte and l.status <> 'cancelado';
  if v_n > 0 then
    raise exception 'Existem % parcelas pagas depois de %: o saldo ficaria diferente do print. Conferir antes.',
      v_n, to_char(c_corte, 'DD/MM/YYYY');
  end if;

  select count(*) into v_n from public.transferencias_contas
   where (conta_origem_id = v_caixa or conta_destino_id = v_caixa)
     and data_transferencia > c_corte;
  if v_n > 0 then
    raise exception 'Existem % transferencias depois de %.', v_n, to_char(c_corte, 'DD/MM/YYYY');
  end if;

  v_antes := public.fn_saldo_conta(v_caixa);
  select jsonb_object_agg(nome, public.fn_saldo_conta(id)) into v_outras_antes
    from public.contas_bancarias where id <> v_caixa;

  update public.contas_bancarias
     set saldo_inicial = c_saldo,
         saldo_inicial_data = c_corte
   where id = v_caixa;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'Esperava rebasear 1 conta e o update pegou %.', v_n;
  end if;

  v_depois := public.fn_saldo_conta(v_caixa);
  select jsonb_object_agg(nome, public.fn_saldo_conta(id)) into v_outras_depois
    from public.contas_bancarias where id <> v_caixa;

  -- a que tem de mudar, e para um valor exato
  if v_depois <> c_saldo then
    raise exception 'O saldo da Caixa ficou em R$ % e o print diz R$ %.',
      to_char(v_depois, 'FM999999999990.00'), to_char(c_saldo, 'FM999999999990.00');
  end if;
  if v_depois = v_antes then
    raise exception 'O saldo da Caixa nao mudou (continua R$ %): o update nao pegou.',
      to_char(v_antes, 'FM999999999990.00');
  end if;

  -- a que nao pode mudar
  if v_outras_depois <> v_outras_antes then
    raise exception 'O saldo de outra conta mudou. Antes: %. Depois: %.',
      v_outras_antes::text, v_outras_depois::text;
  end if;

  raise notice 'Caixa rebaseada: saldo de R$ % para R$ % (corrente 280.923,65 + CDB 4.318.176,69), corte em %. Outras contas intactas.',
    to_char(v_antes, 'FM999999999990.00'), to_char(v_depois, 'FM999999999990.00'),
    to_char(c_corte, 'DD/MM/YYYY');
end $rebase$;

comment on column public.contas_bancarias.saldo_inicial is
  'Saldo medido no banco (conta corrente + aplicado) na data de saldo_inicial_data. O saldo da conta = este valor + o movimento POSTERIOR ao corte. Nao e saldo de abertura historico: as tres contas ativas foram rebaseadas contra o extrato/app do banco (BB em 21/08/2026, Caixa em 26/08/2026).';
