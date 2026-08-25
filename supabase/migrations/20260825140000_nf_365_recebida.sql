-- =============================================================
-- A NF 365 do Ramal do Gama foi recebida
--
-- O TIAGO CONFIRMOU (25/08/2026): "teve sim a entrada dessa nota 365".
--
-- A migration anterior (20260825120000) deixou esta em aberto de proposito,
-- porque eu nao achava o credito em nenhum extrato disponivel e preferi nao
-- inventar recebimento. Ele confirmou que entrou, entao a parcela e recebida.
--
-- ============================================================
-- A DATA: 22/07/2026, E POR QUE ESSA
-- ============================================================
-- Ele confirmou a entrada, nao a data. As duas coisas nao sao a mesma, e a data
-- aqui nao e detalhe: a conta 30.893-5 tem corte em 21/08/2026, e de que lado do
-- corte a data cai decide se o saldo se mexe.
--
-- Existem exatamente duas janelas em que o credito pode ter caido sem eu ver:
--
--   22/07 a 30/07/2026  -- o extrato de julho/2026 da 30.893-5 nunca foi
--                          levantado, e a nota e do dia 22/07
--   22/08 a 25/08/2026  -- o extrato de agosto que tenho cobre 31/07 a 21/08
--
-- Tudo entre 31/07 e 21/08 eu vi, e la nao esta: as unicas entradas de fora nesse
-- periodo sao duas do DNIT e uma de R$ 1.000.000,00 da Amazonia Construtora (que
-- e transferencia entre empresas dele, e o valor coincide com o BRUTO da nota por
-- acaso, nao com o liquido de R$ 951.500,00). E o historico "PAVIMENTACAO RAMAL
-- GAMA", que e como o municipio identifica esses creditos, aparece uma unica vez
-- em 2026: a propria 354, em fevereiro.
--
-- Fico com 22/07/2026, o mesmo dia da emissao, por tres razoes que apontam juntas
-- para a primeira janela:
--   1. a nota irma (354) foi paga no MESMO DIA em que foi emitida -- emitida
--      17:48, creditada 19:01. O municipio paga na hora.
--   2. a nota nao tem prazo: a 354 declara "A vista" na forma de pagamento.
--   3. a propria nota declara competencia 22/07/2026.
--
-- CONSEQUENCIA DA ESCOLHA, dita em voz alta porque e dinheiro: 22/07 e ANTERIOR
-- ao corte, entao este recebimento ja esta dentro do saldo inicial de
-- R$ 1.406.246,33 que foi medido no extrato de 21/08. Lanca-lo nao pode somar de
-- novo, e a guarda abaixo exige que o saldo continue em R$ 879.246,33.
--
-- Se a data verdadeira estivesse na SEGUNDA janela (22 a 25/08), o saldo correto
-- passaria a ser R$ 1.830.746,33, e a diferenca de R$ 951.500,00 apareceria como
-- saldo faltando na conta. O teste e de um segundo e esta na mao dele: se o app
-- do banco mostra R$ 879.246,33 (corrente mais aplicado), a data em julho esta
-- certa; se mostra por volta de R$ 1,83 milhao, a data muda para o dia do credito
-- e o saldo passa a contar. E quando o extrato de julho chegar, a data exata
-- dentro da janela se confirma sozinha.
--
-- Dentro da primeira janela, aliais, o dia exato nao muda valor nenhum: 22 ou 30
-- de julho, os dois sao anteriores ao corte, os dois caem na competencia 07/2026
-- e nenhum move o saldo. So o mes importa, e o mes esta certo.
--
-- ============================================================
-- A OBSERVACAO TEM DE MUDAR TAMBEM
-- ============================================================
-- A observacao gravada dizia "EM ABERTO: este credito nao foi encontrado em
-- nenhum extrato disponivel...". Deixar esse texto num lancamento recebido faria
-- a tela contradizer o proprio status -- quem abrisse o documento leria que esta
-- em aberto. Ela e reescrita para dizer o que passou a ser verdade, incluindo que
-- a data e a provavel e nao a conferida.
--
-- ============================================================
-- AS GUARDAS
-- ============================================================
-- A que NAO pode mudar: o saldo, porque a data e anterior ao corte.
-- A que TEM de mudar: o recebido antes do corte sobe exatamente R$ 951.500,00 e
-- ganha uma parcela. Sem ela, "o saldo nao mudou" passaria igual se este UPDATE
-- nao tivesse tocado em linha nenhuma -- que e precisamente como um update com
-- WHERE que nao casa nada passa calado.
-- =============================================================

do $recebida$
declare
  v_conta uuid; v_cli uuid; v_lanc uuid;
  v_saldo_a numeric; v_saldo_d numeric;
  v_corte_a numeric; v_corte_d numeric;
  v_parc_a int; v_parc_d int;
  v_tocadas int;
begin
  select id into v_conta from public.contas_bancarias where nome = 'BANCO DO BRASIL 30.893-5';
  select id into v_cli from public.clientes
   where regexp_replace(coalesce(cpf_cnpj,''), '[^0-9]', '', 'g') = '22812242000112' and ativo;

  select l.id into v_lanc
    from public.lancamentos l
   where l.tipo = 'a_receber' and l.numero_documento = '365'
     and l.cliente_id = v_cli and l.status <> 'cancelado';

  if v_conta is null or v_cli is null or v_lanc is null then
    raise exception 'Nao achei o que preciso: conta=% cliente=% lancamento da NF 365=%',
      v_conta, v_cli, v_lanc;
  end if;

  v_saldo_a := public.fn_saldo_conta(v_conta);
  select recebido, parcelas into v_corte_a, v_parc_a
    from public.fn_rel_movimento_antes_do_corte() where conta_bancaria_id = v_conta;

  update public.lancamento_parcelas
     set status = 'pago',
         data_pagamento = '2026-07-22',
         conta_bancaria_id = v_conta
   where lancamento_id = v_lanc and status = 'pendente';
  get diagnostics v_tocadas = row_count;

  if v_tocadas <> 1 then
    raise exception 'Esperava receber 1 parcela pendente da NF 365 e o update tocou em %.', v_tocadas;
  end if;

  update public.lancamentos
     set status = 'pago',
         observacoes = 'NFS-e 365, emitida em 22/07/2026. 6ª medição da recuperação'
           || ' do Ramal do Gama, Guajará/AM, contrato 049/2022 da Prefeitura'
           || ' Municipal de Guajará, convênio 00023/2022-UGPE. Período do serviço:'
           || ' 01/01/2026 a 21/07/2026. Bruto R$ 1000000.00, retido na fonte'
           || ' R$ 48500.00 (ISS 20000.00 + IRRF 12000.00 + INSS 16500.00),'
           || ' líquido R$ 951500.00. Recebido: confirmado pelo Tiago em'
           || ' 25/08/2026. A DATA de 22/07/2026 é a provável, não a conferida:'
           || ' é o mesmo dia da emissão, seguindo a nota irmã (354), que foi'
           || ' creditada 1h13 depois de emitida, e a nota é à vista. O crédito'
           || ' não aparece no extrato de 31/07 a 21/08, então caiu entre 22 e'
           || ' 30/07 (extrato de julho não levantado) ou depois de 21/08.'
           || ' Confirmar a data quando o extrato de julho/2026 chegar.'
   where id = v_lanc;

  v_saldo_d := public.fn_saldo_conta(v_conta);
  select recebido, parcelas into v_corte_d, v_parc_d
    from public.fn_rel_movimento_antes_do_corte() where conta_bancaria_id = v_conta;

  -- a que nao pode mudar
  if v_saldo_d <> v_saldo_a then
    raise exception
      'O saldo da 30.893-5 mudou de R$ % para R$ %. Um recebimento de 22/07 e anterior ao corte de 21/08 e ja esta no saldo inicial.',
      to_char(v_saldo_a,'FM999999999990.00'), to_char(v_saldo_d,'FM999999999990.00');
  end if;

  -- a que tem de mudar
  if v_corte_d - v_corte_a <> 951500.00 or v_parc_d <> v_parc_a + 1 then
    raise exception
      'O recebido antes do corte foi de R$ % para R$ % (delta %, esperado 951500.00) e as parcelas de % para % (esperado +1).',
      to_char(v_corte_a,'FM999999999990.00'), to_char(v_corte_d,'FM999999999990.00'),
      to_char(v_corte_d - v_corte_a,'FM999999999990.00'), v_parc_a, v_parc_d;
  end if;

  raise notice 'NF 365 recebida em 22/07/2026. Saldo intacto em R$ %, recebido antes do corte R$ % em % parcelas.',
    to_char(v_saldo_d,'FM999999999990.00'), to_char(v_corte_d,'FM999999999990.00'), v_parc_d;
end $recebida$;
