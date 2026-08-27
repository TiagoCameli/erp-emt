-- =============================================================
-- A entrada do Cap Giro do BB, e o pagador dos empréstimos corrigido
--
-- PEDIDO DO TIAGO (26/08/2026): "tem que colocar os recebimentos de emprestimos
-- no centro de custo de emprestimos, veja todos as entradas de dinheiro de
-- emprestimo e coloque em sua respectiva etapa no CC de emprestimo."
--
-- ============================================================
-- COMO ACHEI: NAO FOI PROCURANDO "EMPRESTIMO"
-- ============================================================
-- Procurar "EMPRESTIMO", "FINANCIAMENTO" e "CAPITAL DE GIRO" nos extratos do BB
-- achou apenas AMORTIZACAO -- o BB nao usa essas palavras para a entrada. Foi
-- listar TODOS os historicos de credito distintos das duas contas do BB que
-- revelou a linha, e ela se chama "Cap Giro Digit Liberação".
--
-- Isso ja tinha me pegado nesta mesma conta: em 2024 a Caixa abrevia resgate como
-- "RESG AUTOM" e eu procurava por "RESGATE AUTOMAT". Termo escolhido por mim nao
-- e busca: e palpite. O levantamento por tipo distinto e que e busca.
--
-- ============================================================
-- A ENTRADA QUE ENTRA AQUI
-- ============================================================
--   04/12/2024  R$ 1.000.000,00  "Cap Giro Digit Liberação"
--   contrato 23411259, conta BANCO DO BRASIL 30.893-5
--   No mesmo dia o BB cobrou R$ 12.123,00 de amortizacao, R$ 5.000,00 de comissao
--   flat e R$ 5.000,00 de tarifa -- essas tres sao DESPESA e nao entram aqui.
--
-- E a UNICA liberacao de emprestimo em todos os 83 extratos que existem. Nas duas
-- contas do BB e nas da Caixa, e a unica linha com "Libera" no historico.
--
-- ============================================================
-- QUATRO CONTRATOS NO EXTRATO, E SO UM COM A ENTRADA VISIVEL
-- ============================================================
-- O numero do contrato vem na coluna de documento, e e ele que separa um do
-- outro (o nome do produto se repete):
--   23408109  Cap Giro Digital .. 12 amortizacoes em 2024 (R$ 380.947,62)
--             liberacao anterior a 01/2024, fora dos extratos que tenho
--   23411259  Cap Giro Digital .. LIBERADO R$ 1.000.000,00 em 04/12/2024  <- este
--   23411704  FINAME ............ amortizacoes de ~R$ 22 mil/mes em 2026
--   23411750  Cap Giro Digital .. amortizacoes em 08/2026
--
-- As liberacoes de 23411704 e 23411750 nao estao em extrato nenhum que eu tenha:
-- pelas datas das amortizacoes elas cairiam em 2025, e os extratos de 2025 da
-- 30.893-5 sao justamente os que faltam (tenho 2024 e 2026). Nao invento entrada:
-- as etapas desses contratos vao continuar com despesa e sem a entrada, e isso
-- fica dito no relatorio.
--
-- ETAPA PROPRIA, e nao a "Capital de giro BR-364" que ja existe: aquela recebeu o
-- LAN-2026-4722, cujas parcelas de ~R$ 220 mil comecam em 06/2026 e vao a 02/2028.
-- Entre a liberacao (12/2024) e a primeira parcela ha 18 meses, e o extrato mostra
-- que o 23411259 ja amortizava no proprio dia da liberacao. Sao contratos
-- diferentes, e juntar os dois numa etapa faria o saldo devedor de um pagar o
-- outro. O numero do contrato vai no numero do documento, para casar com o
-- extrato.
--
-- ============================================================
-- E UM ERRO MEU, CORRIGIDO DE PASSAGEM
-- ============================================================
-- Os dois emprestimos da Caixa que lancei hoje (SIEMP e CDC Giro Facil) ficaram
-- com pagador DERACRE. Isso veio por inercia: o DERACRE era a escolha dele para
-- as MEDICOES, e eu apliquei aos emprestimos sem pensar. O pagador de um
-- emprestimo tomado e o BANCO que liberou o dinheiro, e os dois clientes existem
-- cadastrados. Os dois passam para CAIXA ECONOMICA FEDERAL, e o novo nasce com
-- BANCO DO BRASIL S/A.
--
-- ============================================================
-- AS GUARDAS
-- ============================================================
-- A que NAO pode mudar: o saldo da 30.893-5. A liberacao e de 04/12/2024, muito
-- anterior ao corte de 21/08/2026, entao ela nao pode somar no saldo -- o saldo
-- daquela data ja a contem. Vale para todas as contas.
-- As que TEM de mudar: a entrada do centro Emprestimos sobe exatamente
-- R$ 1.000.000,00, e os lancamentos de divida a receber vao de 2 para 3.
-- A da correcao: nenhum dos tres emprestimos pode continuar com pagador DERACRE.
-- =============================================================

do $entrada$
declare
  v_uid uuid; v_emprestimos uuid; v_etapa uuid;
  v_bb_cliente uuid; v_caixa_cliente uuid; v_deracre uuid;
  v_financiamento uuid; v_conta uuid;
  v_id uuid; v_tocadas int;
  v_emp_a numeric; v_emp_d numeric;
  v_div_a int; v_div_d int;
  v_saldos_a jsonb; v_saldos_d jsonb;
begin
  select id into v_uid from public.usuarios where email = 'tiago@emtconstrutora.com';
  select id into v_emprestimos from public.centros_custo
   where nome = 'Empréstimos' and nivel = 1;
  select id into v_bb_cliente from public.clientes
   where nome = 'BANCO DO BRASIL S/A' and ativo;
  select id into v_caixa_cliente from public.clientes
   where nome = 'CAIXA ECONÔMICA FEDERAL' and ativo;
  select id into v_deracre from public.clientes where nome = 'DERACRE' and ativo;
  select id into v_financiamento from public.categorias_financeiras
   where nome = 'Financiamento bancário' and tipo = 'receita';
  select id into v_conta from public.contas_bancarias
   where nome = 'BANCO DO BRASIL 30.893-5';

  if v_uid is null or v_emprestimos is null or v_bb_cliente is null
     or v_caixa_cliente is null or v_deracre is null or v_financiamento is null
     or v_conta is null then
    raise exception 'Cadastro faltando: uid=% empr=% bb=% caixa=% deracre=% financ=% conta=%',
      v_uid, v_emprestimos, v_bb_cliente, v_caixa_cliente, v_deracre,
      v_financiamento, v_conta;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- ---------- o antes ----------
  select coalesce(sum(r.valor),0) into v_emp_a
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    join public.centros_custo cc on cc.id = r.centro_custo_id
   where (cc.id = v_emprestimos or cc.pai_id = v_emprestimos)
     and l.tipo = 'a_receber' and l.status <> 'cancelado';
  select count(*) into v_div_a from public.lancamentos
   where tipo = 'a_receber' and e_divida and status <> 'cancelado';
  select jsonb_object_agg(nome, public.fn_saldo_conta(id)) into v_saldos_a
    from public.contas_bancarias;

  -- ---------------------------------------------------------------
  -- 1. A etapa do contrato 23411259
  -- ---------------------------------------------------------------
  select id into v_etapa from public.centros_custo
   where nome = 'Banco do Brasil - Cap Giro Digital 23411259' and pai_id = v_emprestimos;
  if v_etapa is null then
    insert into public.centros_custo (nome, nivel, pai_id, created_by)
    values ('Banco do Brasil - Cap Giro Digital 23411259', 2, v_emprestimos, v_uid)
    returning id into v_etapa;
  end if;

  -- ---------------------------------------------------------------
  -- 2. A liberacao de 04/12/2024
  -- ---------------------------------------------------------------
  if exists (
    select 1 from public.lancamentos l
    join public.lancamento_parcelas p on p.lancamento_id = l.id
    where l.tipo = 'a_receber' and p.valor = 1000000.00
      and p.data_pagamento = '2024-12-04' and l.status <> 'cancelado'
  ) then
    raise notice 'A liberacao de 04/12/2024 ja esta lancada, pulando.';
  else
    v_id := public.fn_salvar_lancamento(
      null,
      jsonb_build_object(
        'tipo', 'a_receber',
        'cliente_id', v_bb_cliente,
        'categoria_id', v_financiamento,
        'conta_bancaria_id', v_conta,
        'descricao', 'Empréstimo Cap Giro Digital 23411259 - Banco do Brasil',
        'valor', 1000000.00,
        'e_divida', true,
        'data_compra', '2024-12-04',
        'mes_competencia', '2024-12-01',
        'data_vencimento', '2024-12-04',
        'numero_documento', '23411259',
        'observacoes', 'Liberacao de emprestimo creditada em 04/12/2024 na conta '
          || 'BANCO DO BRASIL 30.893-5, historico "Cap Giro Digit Liberação", '
          || 'contrato 23411259. Lancada em 26/08/2026 a partir do extrato de '
          || 'dezembro/2024. No mesmo dia o BB cobrou R$ 12.123,00 de amortizacao, '
          || 'R$ 5.000,00 de comissao flat e R$ 5.000,00 de tarifa, que sao '
          || 'despesa e nao estao lancadas. Marcado como divida: entra dinheiro '
          || 'que tem de ser devolvido, e a categoria "Financiamento bancario" tem '
          || 'natureza movimentacao para ficar fora do resultado.'),
      jsonb_build_array(jsonb_build_object('valor', 1000000.00,
                                           'data_vencimento', '2024-12-04')),
      jsonb_build_array(jsonb_build_object('centro_custo_id', v_etapa,
                                           'valor', 1000000.00)),
      '[]'::jsonb);

    update public.lancamento_parcelas
       set status = 'pago', data_pagamento = '2024-12-04', conta_bancaria_id = v_conta
     where lancamento_id = v_id;
    update public.lancamentos set status = 'pago' where id = v_id;
  end if;

  -- ---------------------------------------------------------------
  -- 3. O pagador dos dois emprestimos da Caixa
  -- ---------------------------------------------------------------
  -- Erro meu, de hoje: lancei com DERACRE por inercia das medicoes. Quem libera
  -- emprestimo e o banco.
  update public.lancamentos
     set cliente_id = v_caixa_cliente,
         observacoes = concat_ws(E'\n', observacoes,
           'Pagador corrigido em 26/08/2026 de DERACRE para CAIXA ECONÔMICA '
           || 'FEDERAL: quem libera empréstimo é o banco. O DERACRE havia entrado '
           || 'por inércia das medições da obra, que têm ele como pagador.')
   where tipo = 'a_receber' and e_divida and cliente_id = v_deracre
     and numero_documento in ('749893', 'CDC-09072026')
     and status <> 'cancelado';
  get diagnostics v_tocadas = row_count;
  if v_tocadas <> 2 then
    raise exception 'Esperava corrigir o pagador de 2 emprestimos da Caixa e corrigi %.', v_tocadas;
  end if;

  execute 'set constraints all immediate';

  -- ---------- o depois ----------
  select coalesce(sum(r.valor),0) into v_emp_d
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    join public.centros_custo cc on cc.id = r.centro_custo_id
   where (cc.id = v_emprestimos or cc.pai_id = v_emprestimos)
     and l.tipo = 'a_receber' and l.status <> 'cancelado';
  select count(*) into v_div_d from public.lancamentos
   where tipo = 'a_receber' and e_divida and status <> 'cancelado';
  select jsonb_object_agg(nome, public.fn_saldo_conta(id)) into v_saldos_d
    from public.contas_bancarias;

  -- ---------- as guardas ----------
  -- A liberacao e de 04/12/2024, anterior ao corte de 21/08/2026: nenhum saldo
  -- pode se mexer. Se mexeu, a data entrou errada.
  if v_saldos_d <> v_saldos_a then
    raise exception 'Algum saldo mudou. Antes: %. Depois: %.',
      v_saldos_a::text, v_saldos_d::text;
  end if;

  -- As que TEM de mudar, senao a de cima passaria sem nada ter entrado.
  if v_emp_d - v_emp_a <> 1000000.00 then
    raise exception
      'A entrada do centro Emprestimos foi de R$ % para R$ % (delta %, esperado 1000000.00).',
      to_char(v_emp_a,'FM999999999990.00'), to_char(v_emp_d,'FM999999999990.00'),
      to_char(v_emp_d - v_emp_a,'FM999999999990.00');
  end if;

  if v_div_d <> v_div_a + 1 then
    raise exception 'Os lancamentos de divida a receber foram de % para % (esperado +1).',
      v_div_a, v_div_d;
  end if;

  -- A da correcao: nenhum emprestimo pode continuar com o DERACRE como pagador.
  if exists (select 1 from public.lancamentos
              where tipo = 'a_receber' and e_divida and cliente_id = v_deracre
                and status <> 'cancelado') then
    raise exception 'Sobrou emprestimo com pagador DERACRE.';
  end if;

  raise notice 'Cap Giro 23411259: R$ 1.000.000,00 de 04/12/2024 lancado na etapa nova. Entrada do centro Emprestimos agora R$ %. Pagador dos tres corrigido para o banco. Nenhum saldo se mexeu.',
    to_char(v_emp_d,'FM999999999990.00');
end $entrada$;
