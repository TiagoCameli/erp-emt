-- =============================================================
-- Rebase das duas contas do Banco do Brasil
--
-- AUTORIZADO PELO TIAGO (22/08/2026): "aqui esta o ultimo extrato da 102.124-9,
-- vamos deixar o da caixa para depois por enquanto, e pode fazer o rebase da
-- 30.893-5."
--
-- Primeira migration desta serie que ESCREVE dinheiro. As tres anteriores
-- (natureza, data de corte, opcao A) entregaram mecanismo; esta usa o mecanismo
-- com numeros lidos de extrato, um por conta.
--
-- ============================================================
-- DE ONDE VEM CADA NUMERO
-- ============================================================
-- Os dois extratos sao de 21/08/2026 e os dois fecham a aritmetica do proprio
-- banco ao centavo. Sob a opcao A o saldo do ERP e corrente + aplicado, que e
-- exatamente a linha que o BB chama de "Saldo":
--
--   BANCO DO BRASIL 102.124-9 (00921082026-5.pdf, emitido 21/08 17:49)
--     S A L D O (conta corrente) .............. 43.668,57 D   ou seja -43.668,57
--     Invest. Resgate Autom. .................. 56.880,27 C
--     Saldo ................................... 13.211,70 C   <- o alvo
--     conferido: 56.880,27 - 43.668,57 = 13.211,70
--
--   BANCO DO BRASIL 30.893-5 (ComprovanteBB 21/08 17:15)
--     SALDO (conta corrente) ................. 140.000,00 (-) ou seja -140.000,00
--     Invest. Resgate Autom. ............... 1.546.246,33 (+)
--     Saldo ................................ 1.406.246,33 (+) <- o alvo
--     conferido: 1.546.246,33 - 140.000,00 = 1.406.246,33
--
-- O "Saldo de fundos de investimento" (R$ 56.882,36 na 102.124-9 e
-- R$ 1.546.305,29 na 30.893-5) NAO e o numero usado: ele e saldo por dia base,
-- alguns centavos acima do resgatavel naquele instante, e nao e o que o banco
-- soma na linha "Saldo". Usar ele poria uns reais que a conta ainda nao tem.
--
-- ============================================================
-- POR QUE O CORTE E 21/08/2026 E NAO 20/08
-- ============================================================
-- O corte diz "o saldo ao lado ja representa tudo ate esta data, inclusive".
-- Conferido antes de aplicar: o ULTIMO pagamento das duas contas no ERP e de
-- 21/08/2026 (12 parcelas de R$ 63.668,57 na 102.124-9 e 1 de R$ 29.700,00 na
-- 30.893-5, esta em 20/08), e NAO existe nada depois. Entao:
--
--   corte 21/08  -> tudo o que ja esta no extrato sai do saldo. Certo.
--   corte 20/08  -> os 12 pagamentos de 21/08 entrariam no saldo, mas eles JA
--                   estao dentro do saldo do extrato. Contaria duas vezes.
--
-- Efeito imediato: como nao ha movimento posterior ao corte, o saldo das duas
-- contas passa a ser exatamente o do extrato. A partir do proximo pagamento ele
-- volta a andar sozinho.
--
-- ============================================================
-- O QUE ESTA MIGRATION NAO FAZ
-- ============================================================
-- Nao toca na CAIXA ECONOMICA 578367973-5 (decisao dele: fica para depois, o
-- saldo aplicado dela ainda nao foi levantado). Nao toca na CAIXINHA DE DINHEIRO
-- nem na BB 1197-5 AMAZONIA, que continuam com o plug antigo e sem data de
-- corte.
--
-- Nao apaga nem edita lancamento nenhum. O movimento anterior ao corte continua
-- inteiro na base, alimentando DRE, custo de obra e extrato de fornecedor -- ele
-- so para de somar no SALDO BANCARIO, porque aquele periodo passou a ser
-- representado pelo numero do extrato. `fn_rel_movimento_antes_do_corte` mede
-- quanto e isso, e a tela mostra ao lado do saldo.
-- =============================================================

update public.contas_bancarias
set saldo_inicial = 13211.70,
    saldo_inicial_data = '2026-08-21',
    updated_at = now()
where nome = 'BANCO DO BRASIL 102.124-9';

update public.contas_bancarias
set saldo_inicial = 1406246.33,
    saldo_inicial_data = '2026-08-21',
    updated_at = now()
where nome = 'BANCO DO BRASIL 30.893-5';

-- Guarda: se um dos dois nomes nao existir mais, a migration nao pode passar em
-- silencio deixando uma conta com o plug antigo e a outra rebaseada.
do $$
declare v_qtd integer;
begin
  select count(*) into v_qtd
  from public.contas_bancarias
  where nome in ('BANCO DO BRASIL 102.124-9', 'BANCO DO BRASIL 30.893-5')
    and saldo_inicial_data = '2026-08-21';
  if v_qtd <> 2 then
    raise exception
      'Esperava 2 contas rebaseadas em 21/08/2026 e achei %. Conta renomeada?', v_qtd;
  end if;
end $$;
