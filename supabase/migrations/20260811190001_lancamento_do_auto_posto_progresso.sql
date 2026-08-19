-- =============================================================
-- O lancamento que entrou no maiscontrole depois do export
--
-- Agosto/2026 estava R$ 34.494,36 em aberto abaixo do maiscontrole, e a
-- diferenca era UMA parcela: AUTO POSTO PROGRESSO EIRELI, "REFERENTE
-- ABASTECIMENTO NA EXTREMA", vencimento 12/08/2026, a vista, BB 102.124-9,
-- centro 009 (Lote 09), documento "19947 E 4672". Achada filtrando a tela de
-- Pagamentos por agosto + Em aberto: era a primeira linha, com o valor exato
-- da diferenca do mes.
--
-- Ela nao veio na carga porque foi registrada no maiscontrole DEPOIS do export
-- das 13h20 de 11/08/2026. O fornecedor ja existia no cadastro.
--
-- Duas coisas que eu nao sei e assumi, e ficam registradas: a data do
-- lancamento e a competencia. O maiscontrole mostra o vencimento (12/08/2026)
-- mas nao a data do documento nessa tela, entao usei o proprio vencimento como
-- data de compra e agosto/2026 como competencia. Se a nota disser outra coisa, e
-- editar o lancamento.
--
-- Depois disto, agosto/2026 bate ao centavo nos tres numeros: pago
-- R$ 1.473.685,73, em aberto R$ 1.453.231,98, total R$ 2.926.917,71.
--
-- Passa por fn_salvar_lancamento, e nao por insert direto, para o lancamento
-- nascer com parcela, rateio e status pela mesma regra de qualquer outro. Exige
-- auth.uid(), dai o `set local role`.
-- =============================================================

do $$
declare v_id uuid;
begin
  -- Idempotente: replay nao duplica.
  if exists (
    select 1 from public.lancamentos
    where valor = 34494.36 and data_vencimento = date '2026-08-12'
      and descricao = 'REFERENTE ABASTECIMENTO NA EXTREMA'
  ) then
    raise notice 'Lancamento do Auto Posto Progresso ja existe. Nada feito.';
    return;
  end if;

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}';

  v_id := public.fn_salvar_lancamento(
    null,
    jsonb_build_object(
      'tipo', 'a_pagar',
      'fornecedor_id', (select id from public.fornecedores
                        where public.fn_chave_nome(razao_social) = public.fn_chave_nome('AUTO POSTO PROGRESSO EIRELI') limit 1),
      'categoria_id', (select id from public.categorias_financeiras
                       where public.fn_chave_nome(nome) = public.fn_chave_nome('Combustível') limit 1),
      'forma_pagamento_id', null,
      'condicao_pagamento_id', null,
      'descricao', 'REFERENTE ABASTECIMENTO NA EXTREMA',
      'valor', 34494.36,
      'data_compra', '2026-08-12',
      'mes_competencia', '2026-08-01',
      'data_vencimento', '2026-08-12',
      'observacoes', 'Documento: 19947 E 4672' || chr(10) ||
                     'Lancado direto no ERP-EMT: entrou no maiscontrole depois do export de 11/08/2026.'
    ),
    jsonb_build_array(jsonb_build_object('valor', 34494.36, 'data_vencimento', '2026-08-12')),
    jsonb_build_array(jsonb_build_object(
      'centro_custo_id', (select id from public.centros_custo
        where public.fn_chave_nome(nome) = public.fn_chave_nome('009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10') limit 1),
      'valor', 34494.36))
  );
  raise notice 'Lancamento criado: %', v_id;
end $$;
