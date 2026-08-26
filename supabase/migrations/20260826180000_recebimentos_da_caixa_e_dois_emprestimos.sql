-- =============================================================
-- Os recebimentos que faltavam na Caixa, e os dois emprestimos de 2026
--
-- PEDIDO DO TIAGO (26/08/2026): "pode lancar os recebimentos e marcalos como
-- recebido e abater do saldo inicial dessa conta", e depois, sobre os
-- emprestimos: "entra em recebimento como divida e no centro de custo de
-- emprestimo e com uma etapa especifica para cada emprestimo diferente".
--
-- ============================================================
-- NAO HA O QUE ABATER DO SALDO INICIAL -- E ISSO E BOM
-- ============================================================
-- A Caixa tem data de corte em 26/08/2026 desde a migration anterior: o saldo e
-- o valor medido no banco mais o movimento POSTERIOR ao corte. Todo recebimento
-- aqui e de 2025 ou de 27/01/2026, e os dois emprestimos sao de 06/05 e
-- 09/07/2026 -- tudo anterior ao corte, entao nada disso soma no saldo.
--
-- Abater do saldo inicial faria o saldo cair abaixo dos R$ 4.599.100,34 que o
-- print do banco mostra. A guarda no fim exige que o saldo continue exatamente
-- igual: e o teste de que o lancamento entrou como historico e nao como dinheiro
-- novo.
--
-- O que esses lancamentos consertam e o DRE e o custo por obra, nao o caixa: a
-- AC 405 aparecia pagando R$ 13,6 milhoes e recebendo R$ 2,76 milhoes.
--
-- ============================================================
-- SO O QUE FOI IDENTIFICADO NO EXTRATO. DECISOES DELE, UMA A UMA
-- ============================================================
-- Extrai os 150 creditos dos 31 extratos e classifiquei. Dos R$ 24,3 milhoes de
-- credito externo, entram aqui R$ 6,95 milhoes:
--
--   R$ 3.686.352,46  8 medicoes da AC 405 (historico do consorcio)
--   R$     3.990,01  o ajuste de setembro/2025 para bater com o banco
--   R$ 3.261.910,46  os 2 emprestimos de 2026
--
-- FICAM DE FORA, por decisao dele: os 22 creditos "sem identificacao no
-- historico", R$ 14.408.063,28. O extrato so diz "CRED TED", "CRED TEV",
-- "CFPCV TV" -- nao diz de quem veio. Lanca-los como receita generica poria
-- R$ 14,4 milhoes de origem desconhecida no DRE, que e pior que o buraco.
-- Tambem ficam fora os R$ 711.167,75 de "VENC CDB" (vencimento de aplicacao: o
-- mesmo dinheiro voltando) e os R$ 21.984,66 de "DEVOL TED" (estorno de
-- pagamento, cujo par correto e estornar a saida).
--
-- PAGADOR = DERACRE, escolha dele. O extrato mostra que o dinheiro vem do CNPJ
-- 45.927.806/0001-68, o Consorcio Cruzeiro II, que nao esta cadastrado. Ele
-- preferiu manter um pagador so na obra, igual aos 4 lancamentos que ja existiam.
-- O CNPJ de origem fica registrado na observacao de cada lancamento, para quem
-- conferir contra o extrato achar.
--
-- ============================================================
-- O NUMERO DE DOCUMENTO VEM DO EXTRATO
-- A fn_salvar_lancamento exige numero de documento em recebimento, e foi a prova
-- em transacao desfeita que disse isso -- nao havia como saber lendo a funcao de
-- fora. Nao existe nota fiscal para esses creditos, entao uso o proprio numero de
-- documento que a Caixa imprime na linha: 270850, 050843, 041555, 111721, 150924,
-- 131220, 271001, 271053. Ele e rastreavel -- e, pelo padrao, DDHHMM: o 271001 e
-- do dia 27 as 10:01, hora que o extrato confirma na mesma linha. Quem conferir
-- acha a linha no extrato pelo numero.
--
-- SETEMBRO/2025: O BANCO MANDA
-- ============================================================
-- O LAN-2026-6022 vale R$ 855.837,38 em 3 parcelas, todas com pagamento em
-- 17/09. O extrato mostra tres creditos do consorcio: 17/09 R$ 140.000,00,
-- 18/09 R$ 500.000,00 e 18/09 R$ 219.827,39 -- R$ 859.827,39, tres mil e
-- novecentos a mais, e duas delas no dia 18.
--
-- Ele decidiu: "no erp os recebimentos igualam 855.837,38 mas deixe do mesmo
-- jeito que esta no banco". Entao a terceira parcela vai de R$ 215.837,38 para
-- R$ 219.827,39 e as duas ultimas passam para 18/09. O lancamento e o rateio
-- acompanham -- sem isso a soma das parcelas deixa de fechar com o valor do
-- lancamento, que e invariante do sistema.
--
-- ============================================================
-- OS DOIS EMPRESTIMOS
-- ============================================================
--   06/05/2026  R$   963.910,46  CREDITO EMPRESTIMO SIEMP
--   09/07/2026  R$ 2.298.000,00  CRED CDC GIROFACIL
--
-- Entram como a_receber com `e_divida = true` e categoria "Financiamento
-- bancario", que ja existe com natureza 'movimentacao'. Isso os mantem FORA do
-- resultado: dinheiro que entra e tem de ser devolvido nao e receita. A marca
-- `e_divida` e o que os poe no relatorio de Endividamento.
--
-- Etapa propria para cada, como ele pediu. O centro "Emprestimos" (nivel 1, tipo
-- financeiro) ja existia com duas etapas, nenhuma usada:
--   "Banco do Brasil - Capital de giro BR-364"
--   "Caixa Economica - Contrato 28102020"  <- e o emprestimo ANTIGO, o da
--       prestacao fixa de R$ 75.319,39 que aparece 21 vezes no extrato entre
--       29/01/2024 e 28/10/2025. Nao mexo nele aqui.
-- Crio duas novas, uma por contrato novo.
--
-- ============================================================
-- QUANTO JA FOI PAGO DE CADA UM (levantado nos extratos, nao lancado aqui)
-- ============================================================
--   Contrato antigo (prestacao R$ 75.319,39): R$ 1.658.967,59 pagos
--       21 prestacoes de 29/01/2024 a 28/10/2025, mais uma de R$ 77.260,40 em
--       06/11/2024. Parou em outubro/2025: provavelmente quitado.
--       No ERP so estao lancadas as 10 de 2025 (R$ 753.193,90, categoria
--       "Pagamento de Emprestimo"); as 11 de 2024 e a de R$ 77.260,40 nao estao.
--   SIEMP (06/05/2026): R$ 183.817,18 pagos, 2 prestacoes de R$ 91.908,59 em
--       08/06/2026 e 06/07/2026. Nenhuma das duas esta lancada no ERP.
--   CDC Giro Facil (09/07/2026): R$ 0,00. Nenhuma prestacao ainda -- o ultimo
--       extrato que tenho vai ate 30/07/2026.
--
-- As prestacoes NAO sao lancadas nesta migration: sao 13 pagamentos a mais, e
-- pagamento tem centro de custo, categoria e conferencia propria. Fica como o
-- proximo passo, agora que as etapas existem para receber o rateio.
-- =============================================================

do $carga$
declare
  v_uid uuid; v_deracre uuid; v_medicoes uuid; v_centro007 uuid;
  v_conta uuid; v_financiamento uuid; v_emprestimos uuid;
  v_etapa_siemp uuid; v_etapa_cdc uuid;
  n record; v_id uuid;
  v_saldo_a numeric; v_saldo_d numeric;
  v_corte_a numeric; v_corte_d numeric;
  v_007_a numeric; v_007_d numeric;
  v_criados int := 0; v_tocadas int;
  v_outras_a jsonb; v_outras_d jsonb;
begin
  select id into v_uid from public.usuarios where email = 'tiago@emtconstrutora.com';
  select id into v_deracre from public.clientes where nome = 'DERACRE' and ativo;
  select id into v_medicoes from public.categorias_financeiras
   where nome = 'Medições de obra' and tipo = 'receita';
  select id into v_financiamento from public.categorias_financeiras
   where nome = 'Financiamento bancário' and tipo = 'receita';
  select id into v_centro007 from public.centros_custo where nome like '007%' and nivel = 1;
  select id into v_emprestimos from public.centros_custo
   where nome = 'Empréstimos' and nivel = 1;
  select id into v_conta from public.contas_bancarias
   where nome = 'CAIXA ECONOMICA 578367973-5';

  if v_uid is null or v_deracre is null or v_medicoes is null or v_financiamento is null
     or v_centro007 is null or v_emprestimos is null or v_conta is null then
    raise exception 'Cadastro faltando: uid=% deracre=% medicoes=% financ=% c007=% empr=% conta=%',
      v_uid, v_deracre, v_medicoes, v_financiamento, v_centro007, v_emprestimos, v_conta;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- ---------- o antes ----------
  v_saldo_a := public.fn_saldo_conta(v_conta);
  select recebido into v_corte_a from public.fn_rel_movimento_antes_do_corte()
   where conta_bancaria_id = v_conta;
  select coalesce(sum(r.valor), 0) into v_007_a
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
   where r.centro_custo_id = v_centro007 and l.tipo = 'a_receber'
     and l.status <> 'cancelado';
  select jsonb_object_agg(nome, public.fn_saldo_conta(id)) into v_outras_a
    from public.contas_bancarias where id <> v_conta;

  -- ---------------------------------------------------------------
  -- 1. As duas etapas novas em Emprestimos
  -- ---------------------------------------------------------------
  -- Etapa e nivel 2 com tipo nulo, como as duas que ja existiam. O centro raiz
  -- nao e criado aqui: raiz de obra nasce por trigger da Obra, e este centro
  -- "Emprestimos" e tipo financeiro e ja existe.
  --
  -- Procura antes de inserir, e nao `on conflict do nothing`: centros_custo nao
  -- tem unique nenhum alem da chave primaria, entao ON CONFLICT nunca dispararia
  -- e rodar esta migration duas vezes criaria etapas duplicadas em silencio.
  select id into v_etapa_siemp from public.centros_custo
   where nome = 'Caixa Econômica - SIEMP 05/2026' and pai_id = v_emprestimos;
  if v_etapa_siemp is null then
    insert into public.centros_custo (nome, nivel, pai_id, created_by)
    values ('Caixa Econômica - SIEMP 05/2026', 2, v_emprestimos, v_uid)
    returning id into v_etapa_siemp;
  end if;

  select id into v_etapa_cdc from public.centros_custo
   where nome = 'Caixa Econômica - CDC Giro Fácil 07/2026' and pai_id = v_emprestimos;
  if v_etapa_cdc is null then
    insert into public.centros_custo (nome, nivel, pai_id, created_by)
    values ('Caixa Econômica - CDC Giro Fácil 07/2026', 2, v_emprestimos, v_uid)
    returning id into v_etapa_cdc;
  end if;

  if v_etapa_siemp is null or v_etapa_cdc is null then
    raise exception 'Nao consegui criar/achar as etapas: siemp=% cdc=%',
      v_etapa_siemp, v_etapa_cdc;
  end if;

  -- ---------------------------------------------------------------
  -- 2. Setembro/2025 passa a ser o que o banco diz
  -- ---------------------------------------------------------------
  update public.lancamento_parcelas
     set valor = 219827.39, data_pagamento = '2025-09-18'
   where id = 'e91daa5c-9ebe-4cfb-8264-fea192b0db28' and valor = 215837.38;
  get diagnostics v_tocadas = row_count;
  if v_tocadas <> 1 then
    raise exception 'A parcela de R$ 215.837,38 de setembro/2025 nao estava como eu li (tocou % linhas).', v_tocadas;
  end if;

  -- a de R$ 500.000,00 tambem caiu no dia 18 no extrato
  update public.lancamento_parcelas
     set data_pagamento = '2025-09-18'
   where id = '732953a9-7dbc-4ddd-a3ad-da81a26ece4e' and valor = 500000.00;
  get diagnostics v_tocadas = row_count;
  if v_tocadas <> 1 then
    raise exception 'A parcela de R$ 500.000,00 de setembro/2025 nao estava como eu li.';
  end if;

  -- lancamento e rateio acompanham: a soma das parcelas tem de fechar com o
  -- valor do lancamento, e o rateio com os dois
  update public.lancamentos
     set valor = 859827.39,
         observacoes = concat_ws(E'\n', observacoes,
           'Ajustado em 26/08/2026 para bater com o extrato da Caixa: os tres '
           || 'creditos do consorcio sao 17/09 R$ 140.000,00, 18/09 R$ 500.000,00 '
           || 'e 18/09 R$ 219.827,39, total R$ 859.827,39. O ERP tinha '
           || 'R$ 855.837,38 com as tres em 17/09.')
   where id = '7aba3ecc-ef8a-4b42-b46b-b17369646fdf' and valor = 855837.38;
  get diagnostics v_tocadas = row_count;
  if v_tocadas <> 1 then
    raise exception 'O LAN-2026-6022 nao estava com R$ 855.837,38.';
  end if;

  update public.lancamento_rateios set valor = 859827.39
   where lancamento_id = '7aba3ecc-ef8a-4b42-b46b-b17369646fdf';

  -- ---------------------------------------------------------------
  -- 3. As 8 medicoes da AC 405 que faltavam
  -- ---------------------------------------------------------------
  for n in
    select * from (values
      ('2025-05-27'::date, 412335.76, 'CREDITO TRANSF CONSORCIO CRUZEIRO', '270850'),
      ('2025-06-05'::date, 489558.14, 'CREDITO TRANSF CONSORCIO CRUZEIRO', '050843'),
      ('2025-07-04'::date, 233852.49, 'CREDITO TRANSF CONSORCIO CRUZEIRO', '041555'),
      ('2025-07-11'::date, 212650.00, 'CREDITO TRANSF CONSORCIO CRUZEIRO', '111721'),
      ('2025-08-15'::date, 161568.30, 'CREDITO TRANSF CONSORCIO CRUZEIRO', '150924'),
      ('2025-10-13'::date, 975787.77, 'CREDITO TRANSF INTERNET CONSORCIO CRUZEIRO II AC 405', '131220'),
      ('2026-01-27'::date, 1000000.00, 'CREDITO TRANSF INTERNET CONSORCIO CRUZEIRO II AC 405', '271001'),
      ('2026-01-27'::date, 200600.00, 'CREDITO TRANSF INTERNET CONSORCIO CRUZEIRO II AC 405', '271053')
    ) as t(dia, valor, historico, doc)
  loop
    -- rodar duas vezes nao pode duplicar
    if exists (
      select 1 from public.lancamento_parcelas p
      join public.lancamentos l on l.id = p.lancamento_id
      where p.conta_bancaria_id = v_conta and l.tipo = 'a_receber'
        and p.data_pagamento = n.dia and p.valor = n.valor
        and l.status <> 'cancelado'
    ) then
      raise notice 'Recebimento de % em % ja existe, pulando.', n.valor, n.dia;
      continue;
    end if;

    v_id := public.fn_salvar_lancamento(
      null,
      jsonb_build_object(
        'tipo', 'a_receber',
        'cliente_id', v_deracre,
        'categoria_id', v_medicoes,
        'conta_bancaria_id', v_conta,
        'descricao', 'Medição AC 405 - Lote 2 (Consórcio Cruzeiro II)',
        'valor', n.valor,
        'data_compra', n.dia,
        'mes_competencia', date_trunc('month', n.dia)::date,
        'data_vencimento', n.dia,
        'numero_documento', n.doc,
        'observacoes', 'Lancado em 26/08/2026 a partir do extrato da CAIXA '
          || '578367973-5. Credito de ' || to_char(n.dia, 'DD/MM/YYYY')
          || ', documento ' || n.doc || ' no extrato, historico "'
          || n.historico || '", pagador CNPJ '
          || '45.927.806/0001-68 (Consorcio Cruzeiro II). Registrado no DERACRE '
          || 'por decisao do Tiago, para a obra ter um pagador so, igual aos '
          || 'quatro lancamentos que ja existiam.'),
      jsonb_build_array(jsonb_build_object('valor', n.valor,
                                           'data_vencimento', n.dia)),
      jsonb_build_array(jsonb_build_object('centro_custo_id', v_centro007,
                                           'valor', n.valor)),
      '[]'::jsonb);

    update public.lancamento_parcelas
       set status = 'pago', data_pagamento = n.dia, conta_bancaria_id = v_conta
     where lancamento_id = v_id;
    update public.lancamentos set status = 'pago' where id = v_id;
    v_criados := v_criados + 1;
  end loop;

  if v_criados <> 8 then
    raise exception 'Esperava criar 8 medicoes e criei %.', v_criados;
  end if;

  -- ---------------------------------------------------------------
  -- 4. Os dois emprestimos
  -- ---------------------------------------------------------------
  for n in
    select * from (values
      ('2026-05-06'::date, 963910.46, 'CREDITO EMPRESTIMO SIEMP',
       'Empréstimo SIEMP - Caixa Econômica', 'siemp', '749893'),
      -- O extrato traz documento 000000 neste, que e o "sem documento" da Caixa
      -- e nao serve de referencia. Uso uma declarada, para o campo obrigatorio
      -- nao receber um zero que nao localiza nada.
      ('2026-07-09'::date, 2298000.00, 'CRED CDC GIROFACIL',
       'Empréstimo CDC Giro Fácil - Caixa Econômica', 'cdc', 'CDC-09072026')
    ) as t(dia, valor, historico, descricao, qual, doc)
  loop
    if exists (
      select 1 from public.lancamento_parcelas p
      join public.lancamentos l on l.id = p.lancamento_id
      where p.conta_bancaria_id = v_conta and l.tipo = 'a_receber'
        and p.data_pagamento = n.dia and p.valor = n.valor
        and l.status <> 'cancelado'
    ) then
      raise notice 'Emprestimo de % em % ja existe, pulando.', n.valor, n.dia;
      continue;
    end if;

    v_id := public.fn_salvar_lancamento(
      null,
      jsonb_build_object(
        'tipo', 'a_receber',
        'cliente_id', v_deracre,
        'categoria_id', v_financiamento,
        'conta_bancaria_id', v_conta,
        'descricao', n.descricao,
        'valor', n.valor,
        'e_divida', true,
        'data_compra', n.dia,
        'mes_competencia', date_trunc('month', n.dia)::date,
        'data_vencimento', n.dia,
        'numero_documento', n.doc,
        'observacoes', 'Emprestimo tomado na Caixa Economica, creditado em '
          || to_char(n.dia, 'DD/MM/YYYY') || ' na conta 578367973-5, historico "'
          || n.historico || '". Marcado como divida: entra dinheiro, mas tem de '
          || 'ser devolvido, e a categoria "Financiamento bancario" tem natureza '
          || 'movimentacao para ficar fora do resultado. '
          || case when n.qual = 'siemp' then
               'Ja pago: R$ 183.817,18 em 2 prestacoes de R$ 91.908,59 '
               || '(08/06/2026 e 06/07/2026), levantadas no extrato e AINDA NAO '
               || 'lancadas no ERP.'
             else
               'Nenhuma prestacao paga ate 30/07/2026, o ultimo extrato '
               || 'disponivel.'
             end),
      jsonb_build_array(jsonb_build_object('valor', n.valor,
                                           'data_vencimento', n.dia)),
      jsonb_build_array(jsonb_build_object(
        'centro_custo_id', case when n.qual = 'siemp' then v_etapa_siemp
                                else v_etapa_cdc end,
        'valor', n.valor)),
      '[]'::jsonb);

    update public.lancamento_parcelas
       set status = 'pago', data_pagamento = n.dia, conta_bancaria_id = v_conta
     where lancamento_id = v_id;
    update public.lancamentos set status = 'pago' where id = v_id;
    v_criados := v_criados + 1;
  end loop;

  if v_criados <> 10 then
    raise exception 'Esperava 8 medicoes + 2 emprestimos = 10, e fiz %.', v_criados;
  end if;

  -- A invariante do centro de custo, uma vez, com todo rateio ja existindo.
  execute 'set constraints all immediate';

  -- ---------- o depois ----------
  v_saldo_d := public.fn_saldo_conta(v_conta);
  select recebido into v_corte_d from public.fn_rel_movimento_antes_do_corte()
   where conta_bancaria_id = v_conta;
  select coalesce(sum(r.valor), 0) into v_007_d
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
   where r.centro_custo_id = v_centro007 and l.tipo = 'a_receber'
     and l.status <> 'cancelado';
  select jsonb_object_agg(nome, public.fn_saldo_conta(id)) into v_outras_d
    from public.contas_bancarias where id <> v_conta;

  -- ---------- as guardas ----------
  -- A QUE NAO PODE MUDAR, e a razao de existir esta migration como ela e: tudo
  -- que entrou aqui e anterior ao corte de 26/08, entao o saldo tem de continuar
  -- sendo o do print do banco. Se mudou, algum lancamento caiu depois do corte.
  if v_saldo_d <> v_saldo_a then
    raise exception
      'O saldo da Caixa mudou de R$ % para R$ %. Nada aqui e posterior ao corte de 26/08: o saldo tinha de ficar no valor do print.',
      to_char(v_saldo_a, 'FM999999999990.00'), to_char(v_saldo_d, 'FM999999999990.00');
  end if;

  -- AS QUE TEM DE MUDAR, senao a de cima passaria igual sem nada ter entrado.
  -- Os 2 emprestimos NAO entram nestas duas contas: a categoria "Financiamento
  -- bancario" tem natureza 'movimentacao', e as duas funcoes filtram isso.
  if v_corte_d - v_corte_a <> 3690342.47 then
    raise exception
      'O recebido antes do corte foi de R$ % para R$ % (delta %, esperado 3690342.47 = 8 medicoes + o ajuste de setembro).',
      to_char(v_corte_a, 'FM999999999990.00'), to_char(v_corte_d, 'FM999999999990.00'),
      to_char(v_corte_d - v_corte_a, 'FM999999999990.00');
  end if;

  if v_007_d - v_007_a <> 3690342.47 then
    raise exception
      'O centro 007 (AC 405) foi de R$ % para R$ % (delta %, esperado 3690342.47).',
      to_char(v_007_a, 'FM999999999990.00'), to_char(v_007_d, 'FM999999999990.00'),
      to_char(v_007_d - v_007_a, 'FM999999999990.00');
  end if;

  if (select count(*) from public.lancamento_rateios r
      where r.centro_custo_id in (v_etapa_siemp, v_etapa_cdc)) <> 2 then
    raise exception 'As duas etapas de emprestimo tinham de ficar com um rateio cada.';
  end if;

  -- Por `tipo = 'a_receber'` E pelos dois numeros de documento: sem isso a
  -- contagem pega os 17 a_pagar que JA estavam marcados como divida nesta conta
  -- (R$ 823.881,35 de "Pagamento de Emprestimo" e "Aquisicao de Equipamento"),
  -- daria 19 e a guarda acusaria erro onde nao ha. Foi o que a prova pegou.
  if (select count(*) from public.lancamentos l
      where l.tipo = 'a_receber' and l.e_divida
        and l.numero_documento in ('749893', 'CDC-09072026')
        and l.status <> 'cancelado') <> 2 then
    raise exception 'Os dois emprestimos tinham de ficar marcados como divida.';
  end if;

  -- E o saldo das outras contas nao pode se mexer.
  if v_outras_d <> v_outras_a then
    raise exception 'O saldo de outra conta mudou. Antes: %. Depois: %.',
      v_outras_a::text, v_outras_d::text;
  end if;

  raise notice 'Caixa: 8 medicoes + 2 emprestimos lancados, setembro/2025 ajustado. Saldo intacto em R$ %, recebido antes do corte R$ %, centro AC 405 R$ %.',
    to_char(v_saldo_d, 'FM999999999990.00'), to_char(v_corte_d, 'FM999999999990.00'),
    to_char(v_007_d, 'FM999999999990.00');
end $carga$;
