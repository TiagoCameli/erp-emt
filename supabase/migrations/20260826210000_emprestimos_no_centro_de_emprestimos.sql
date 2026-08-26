-- =============================================================
-- Empréstimo de dinheiro vai para o centro Empréstimos, um contrato por etapa
--
-- PEDIDO DO TIAGO (26/08/2026): "tem que trazer todas as despesas e receitas de
-- emprestimos para o centro de custo de emprestimos e sua respectiva etapa pois
-- deve ser um contrato de emprestimo por etapa."
--
-- ============================================================
-- O QUE ELE DECIDIU QUE NAO ENTRA
-- ============================================================
-- Levantei tudo que e emprestimo no sistema e apareceram DUAS familias, nao uma.
-- A segunda mudava o sentido da pergunta, entao perguntei antes de mover:
--
--   emprestimo de DINHEIRO ... capital de giro, contrato de credito. Entra.
--   financiamento de BEM ..... 10 contratos de equipamento, R$ 8.621.217,55, todos
--                              marcados com e_divida: 3 consorcios Randon de
--                              trator, 3 do Banco Paccar, DAF, Guerra, Komatsu e
--                              Noroeste. NAO entra, por decisao dele: o
--                              equipamento gera custo no centro dele, e mover o
--                              financiamento tiraria R$ 5,76 mi de "001 -
--                              Carretas EMT" e R$ 2,06 mi de "Aquisicao de
--                              Equipamentos".
--
-- Essa distincao e a razao de a migration ser pequena: move R$ 2,84 milhoes e nao
-- R$ 11,46 milhoes. A guarda de "001 - Carretas EMT" existe justamente para
-- provar que os financiamentos de bem ficaram onde estavam.
--
-- ============================================================
-- OS TRES QUE ENTRAM, CADA UM NA SUA ETAPA
-- ============================================================
--   LAN-2026-0777  R$   753.193,90  Caixa Economica, contrato 28102020
--                  10 parcelas, hoje no Escritorio Central
--                  -> etapa "Caixa Economica - Contrato 28102020", que ja existia
--                     e nunca havia sido usada. E o contrato da prestacao fixa de
--                     R$ 75.319,39 que aparece 21 vezes no extrato da Caixa entre
--                     29/01/2024 e 28/10/2025.
--
--   LAN-2026-4722  R$ 2.052.271,00  Banco do Brasil, capital de giro BR-364
--                  21 parcelas, hoje no centro 009 (a propria obra)
--                  -> etapa "Banco do Brasil - Capital de giro BR-364", que ja
--                     existia e nunca havia sido usada
--
--   LAN-2026-1816  R$    38.500,00  Banco da Amazonia (BASA)
--                  1 parcela, hoje no Escritorio Central
--                  -> etapa NOVA, porque nao havia nenhuma do BASA
--
-- As duas RECEITAS de emprestimo (SIEMP R$ 963.910,46 e CDC Giro Facil
-- R$ 2.298.000,00) ja entraram nas etapas certas na migration anterior.
--
-- ============================================================
-- DOIS QUE FICAM DE FORA, TAMBEM POR DECISAO DELE
-- ============================================================
--   LAN-2026-5678  R$ 25.917,69  esta em "Pagamento de Emprestimo" mas a
--     descricao diz "Referente pagamento da Escritura e o Inventario da Fazenda".
--     Nao e emprestimo: a categoria estava errada. Ele mandou corrigir agora,
--     entao ela passa para "Outras despesas" e o rateio FICA no Escritorio
--     Central. E a unica mudanca de categoria nesta migration.
--
--   LAN-2026-3680  R$ 37.300,00  diz so "TRANSFERENCIA PARA PAGAMENTO DE
--     EMPRESTIMO", sem dizer qual contrato. Ele preferiu deixar onde esta ate
--     confirmar. Fica no Escritorio Central, na categoria de emprestimo -- e por
--     isso o Escritorio Central continua com uma linha de emprestimo, de
--     proposito.
--
-- ============================================================
-- A GUARDA MESTRA: NENHUM CENTAVO NASCE OU MORRE
-- ============================================================
-- Reclassificar rateio nao cria nem apaga dinheiro: e a mesma despesa contada em
-- outro centro. Entao a soma de TODO o rateio a_pagar do sistema tem de ficar
-- identica -- R$ 54.197.955,96. Essa e a guarda que pega o erro que mais
-- assusta aqui: um update que muda valor junto com o centro, ou que duplica
-- linha de rateio. As guardas por centro (que sobem e descem) provam que a
-- reclassificacao aconteceu; esta prova que ela foi so uma mudanca de lugar.
--
-- Saldo de conta tambem nao pode mudar: centro de custo nao e dinheiro. Se mudar,
-- algo tocou parcela em vez de rateio.
-- =============================================================

do $reclass$
declare
  v_uid uuid; v_emprestimos uuid;
  v_etapa_caixa uuid; v_etapa_bb uuid; v_etapa_basa uuid;
  v_outras_despesas uuid;
  v_tocadas int;
  v_emp_a numeric; v_emp_d numeric;
  v_escr_a numeric; v_escr_d numeric;
  v_009_a numeric; v_009_d numeric;
  v_carretas_a numeric; v_carretas_d numeric;
  v_todo_a numeric; v_todo_d numeric;
  v_saldos_a jsonb; v_saldos_d jsonb;
begin
  select id into v_uid from public.usuarios where email = 'tiago@emtconstrutora.com';
  select id into v_emprestimos from public.centros_custo
   where nome = 'Empréstimos' and nivel = 1;
  select id into v_etapa_caixa from public.centros_custo
   where nome = 'Caixa Econômica - Contrato 28102020' and pai_id = v_emprestimos;
  select id into v_etapa_bb from public.centros_custo
   where nome = 'Banco do Brasil - Capital de giro BR-364' and pai_id = v_emprestimos;
  select id into v_outras_despesas from public.categorias_financeiras
   where nome = 'Outras despesas' and tipo = 'despesa';

  if v_uid is null or v_emprestimos is null or v_etapa_caixa is null
     or v_etapa_bb is null or v_outras_despesas is null then
    raise exception 'Cadastro faltando: uid=% empr=% caixa=% bb=% outras=%',
      v_uid, v_emprestimos, v_etapa_caixa, v_etapa_bb, v_outras_despesas;
  end if;

  -- ---------- o antes ----------
  select coalesce(sum(r.valor),0) into v_emp_a
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    join public.centros_custo cc on cc.id = r.centro_custo_id
   where (cc.id = v_emprestimos or cc.pai_id = v_emprestimos)
     and l.tipo = 'a_pagar' and l.status <> 'cancelado';
  select coalesce(sum(r.valor),0) into v_escr_a
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    join public.centros_custo cc on cc.id = r.centro_custo_id
   where cc.nome = 'Escritório Central' and l.tipo='a_pagar' and l.status <> 'cancelado';
  select coalesce(sum(r.valor),0) into v_009_a
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    join public.centros_custo cc on cc.id = r.centro_custo_id
   where cc.nome like '009%' and l.tipo='a_pagar' and l.status <> 'cancelado';
  select coalesce(sum(r.valor),0) into v_carretas_a
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    join public.centros_custo cc on cc.id = r.centro_custo_id
   where cc.nome = '001 - Carretas EMT' and l.tipo='a_pagar' and l.status <> 'cancelado';
  select coalesce(sum(r.valor),0) into v_todo_a
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
   where l.tipo='a_pagar' and l.status <> 'cancelado';
  select jsonb_object_agg(nome, public.fn_saldo_conta(id)) into v_saldos_a
    from public.contas_bancarias;

  -- ---------------------------------------------------------------
  -- 1. A etapa do BASA, que nao existia
  -- ---------------------------------------------------------------
  -- Procura antes de inserir: centros_custo nao tem unique alem da PK, entao
  -- `on conflict` nunca dispararia e rodar duas vezes duplicaria a etapa.
  select id into v_etapa_basa from public.centros_custo
   where nome = 'Banco da Amazônia - BASA' and pai_id = v_emprestimos;
  if v_etapa_basa is null then
    insert into public.centros_custo (nome, nivel, pai_id, created_by)
    values ('Banco da Amazônia - BASA', 2, v_emprestimos, v_uid)
    returning id into v_etapa_basa;
  end if;

  -- ---------------------------------------------------------------
  -- 2. Os tres rateios mudam de centro
  -- ---------------------------------------------------------------
  -- Um UPDATE por lancamento, com o valor no WHERE: se o lancamento nao estiver
  -- exatamente como eu li, o update nao pega e a contagem acusa. Um UPDATE unico
  -- com IN() nao saberia dizer qual dos tres falhou.
  update public.lancamento_rateios r
     set centro_custo_id = v_etapa_caixa
   where r.lancamento_id = '20999fc1-1a0c-42e1-8618-3f14b49f072f'
     and r.valor = 753193.90;
  get diagnostics v_tocadas = row_count;
  if v_tocadas <> 1 then
    raise exception 'O rateio do LAN-2026-0777 (Caixa 28102020) nao estava como eu li: % linhas.', v_tocadas;
  end if;

  update public.lancamento_rateios r
     set centro_custo_id = v_etapa_bb
   where r.lancamento_id = 'cfc06aa1-70c0-40cb-b3f5-0781dbe9211d'
     and r.valor = 2052271.00;
  get diagnostics v_tocadas = row_count;
  if v_tocadas <> 1 then
    raise exception 'O rateio do LAN-2026-4722 (BB capital de giro) nao estava como eu li: % linhas.', v_tocadas;
  end if;

  update public.lancamento_rateios r
     set centro_custo_id = v_etapa_basa
   where r.lancamento_id = '50eb81bc-7e3e-4212-9682-0a6204229b3b'
     and r.valor = 38500.00;
  get diagnostics v_tocadas = row_count;
  if v_tocadas <> 1 then
    raise exception 'O rateio do LAN-2026-1816 (BASA) nao estava como eu li: % linhas.', v_tocadas;
  end if;

  -- rastro nos tres, para quem abrir o documento saber por que o centro mudou
  update public.lancamentos
     set observacoes = concat_ws(E'\n', observacoes,
           'Centro de custo reclassificado em 26/08/2026 para o centro '
           || 'Empréstimos, na etapa do contrato. Antes estava no centro '
           || 'operacional que pagou a parcela; empréstimo de dinheiro passou a '
           || 'ter centro próprio, um contrato por etapa.')
   where id in ('20999fc1-1a0c-42e1-8618-3f14b49f072f',
                'cfc06aa1-70c0-40cb-b3f5-0781dbe9211d',
                '50eb81bc-7e3e-4212-9682-0a6204229b3b');
  get diagnostics v_tocadas = row_count;
  if v_tocadas <> 3 then
    raise exception 'Esperava anotar 3 lancamentos e anotei %.', v_tocadas;
  end if;

  -- ---------------------------------------------------------------
  -- 3. A escritura da fazenda sai da categoria de emprestimo
  -- ---------------------------------------------------------------
  -- O rateio NAO muda: continua no Escritorio Central. So a categoria estava
  -- errada, e e a unica mudanca de categoria aqui.
  update public.lancamentos
     set categoria_id = v_outras_despesas,
         observacoes = concat_ws(E'\n', observacoes,
           'Categoria corrigida em 26/08/2026: estava em "Pagamento de '
           || 'Empréstimo" e a descrição é escritura e inventário de fazenda, '
           || 'que não é empréstimo. Passou para "Outras despesas" por decisão '
           || 'do Tiago. O centro de custo não mudou.')
   where id = 'fae9655c-b31e-443d-8c50-ed7239770a56'
     and valor = 25917.69;
  get diagnostics v_tocadas = row_count;
  if v_tocadas <> 1 then
    raise exception 'O LAN-2026-5678 (escritura da fazenda) nao estava como eu li.';
  end if;

  -- A invariante do centro de custo, uma vez, no fim.
  execute 'set constraints all immediate';

  -- ---------- o depois ----------
  select coalesce(sum(r.valor),0) into v_emp_d
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    join public.centros_custo cc on cc.id = r.centro_custo_id
   where (cc.id = v_emprestimos or cc.pai_id = v_emprestimos)
     and l.tipo = 'a_pagar' and l.status <> 'cancelado';
  select coalesce(sum(r.valor),0) into v_escr_d
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    join public.centros_custo cc on cc.id = r.centro_custo_id
   where cc.nome = 'Escritório Central' and l.tipo='a_pagar' and l.status <> 'cancelado';
  select coalesce(sum(r.valor),0) into v_009_d
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    join public.centros_custo cc on cc.id = r.centro_custo_id
   where cc.nome like '009%' and l.tipo='a_pagar' and l.status <> 'cancelado';
  select coalesce(sum(r.valor),0) into v_carretas_d
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    join public.centros_custo cc on cc.id = r.centro_custo_id
   where cc.nome = '001 - Carretas EMT' and l.tipo='a_pagar' and l.status <> 'cancelado';
  select coalesce(sum(r.valor),0) into v_todo_d
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
   where l.tipo='a_pagar' and l.status <> 'cancelado';
  select jsonb_object_agg(nome, public.fn_saldo_conta(id)) into v_saldos_d
    from public.contas_bancarias;

  -- ---------- as guardas ----------
  -- A MESTRA: reclassificar nao cria nem apaga dinheiro.
  if v_todo_d <> v_todo_a then
    raise exception
      'A soma de TODO o rateio a_pagar mudou de R$ % para R$ %. Isto era uma mudanca de lugar, nao de valor: algum update mexeu em valor ou duplicou linha.',
      to_char(v_todo_a,'FM999999999990.00'), to_char(v_todo_d,'FM999999999990.00');
  end if;

  -- AS QUE TEM DE MUDAR: o dinheiro sai de um centro e chega no outro, exato.
  if v_emp_d - v_emp_a <> 2843964.90 then
    raise exception
      'O centro Emprestimos foi de R$ % para R$ % (delta %, esperado 2843964.90).',
      to_char(v_emp_a,'FM999999999990.00'), to_char(v_emp_d,'FM999999999990.00'),
      to_char(v_emp_d - v_emp_a,'FM999999999990.00');
  end if;

  if v_escr_a - v_escr_d <> 791693.90 then
    raise exception
      'O Escritorio Central foi de R$ % para R$ % (saiu %, esperado 791693.90 = 753193.90 + 38500.00).',
      to_char(v_escr_a,'FM999999999990.00'), to_char(v_escr_d,'FM999999999990.00'),
      to_char(v_escr_a - v_escr_d,'FM999999999990.00');
  end if;

  if v_009_a - v_009_d <> 2052271.00 then
    raise exception
      'O centro 009 (BR-364) foi de R$ % para R$ % (saiu %, esperado 2052271.00).',
      to_char(v_009_a,'FM999999999990.00'), to_char(v_009_d,'FM999999999990.00'),
      to_char(v_009_a - v_009_d,'FM999999999990.00');
  end if;

  -- A QUE PROVA A DECISAO DELE: financiamento de BEM ficou onde estava. Sem esta,
  -- eu nao teria como mostrar que os R$ 8,6 mi de equipamento nao se mexeram.
  if v_carretas_d <> v_carretas_a then
    raise exception
      'O centro "001 - Carretas EMT" mudou de R$ % para R$ %. Os financiamentos de equipamento tinham de ficar onde estavam.',
      to_char(v_carretas_a,'FM999999999990.00'), to_char(v_carretas_d,'FM999999999990.00');
  end if;

  -- Centro de custo nao e dinheiro: nenhum saldo pode se mexer.
  if v_saldos_d <> v_saldos_a then
    raise exception 'Algum saldo de conta mudou. Antes: %. Depois: %.',
      v_saldos_a::text, v_saldos_d::text;
  end if;

  raise notice 'Emprestimos: R$ % reclassificados em 3 contratos (Caixa 28102020, BB capital de giro, BASA). Escritorio Central -%, centro 009 -%. Carretas EMT e os 10 financiamentos de equipamento intactos, todos os saldos intactos.',
    to_char(v_emp_d,'FM999999999990.00'),
    to_char(v_escr_a - v_escr_d,'FM999999999990.00'),
    to_char(v_009_a - v_009_d,'FM999999999990.00');
end $reclass$;
