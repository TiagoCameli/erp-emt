-- Prova do lote de 13o (Bloco 8c, migration 20260912120000).
--
-- A prova CHAMA a RPC. Nao basta o apply_migration voltar `success`: plpgsql
-- so valida as queries do corpo na PRIMEIRA EXECUCAO. A prova da rescisao
-- estourou exatamente assim, com folha_parametros vazia, depois de a migration
-- ter voltado success e o advisor estar limpo.
--
-- Cobaias criadas aqui dentro (e desfeitas no fim, como tudo):
--   ZE PROVA UM    salario 3.000,00  admitido 10/01/2026
--   ZE PROVA DOIS  salario 2.400,00  admitido 20/08/2026
--   ZE PROVA TRES  salario 1.800,00  SEM data de admissao
--
-- AVOS, conferidos contra fn_rescisao_avos_13 antes de escrever esta prova:
--   Um:   jan a dez, e janeiro tem 22 dias trabalhados (>= 15)  = 12 avos
--   Dois: agosto comeca dia 20 -> 12 dias (< 15), NAO conta.
--         set, out, nov, dez                                    =  4 avos
--   Tres: sem admissao -> 0 avos, e por isso nem entra no lote.
--
-- CONTA A MAO, 1a parcela a 50%, SEM desconto:
--   Um:   total = round(3000/12,2) x 12 = 250,00 x 12 = 3.000,00
--         bruto = 3.000,00 x 0,5                      = 1.500,00
--         ja pago = 0  ->  LIQUIDO                    = 1.500,00
--   Dois: total = round(2400/12,2) x  4 = 200,00 x  4 =   800,00
--         bruto =   800,00 x 0,5                      =   400,00
--         ja pago = 0  ->  LIQUIDO                    =   400,00
--
-- CONTA A MAO, 2a parcela a 100%, SEM desconto:
--   Um:   bruto = 3.000,00 x 1,0 = 3.000,00 menos 1.500,00 ja pago = 1.500,00
--   Dois: bruto =   800,00 x 1,0 =   800,00 menos   400,00 ja pago =   400,00
--
-- O total do LOTE nao e conferido contra numero fixo de proposito: o lote pega
-- todo CLT ativo com admissao, entao o total anda quando o cadastro anda.
-- O que se confere e a identidade (total gravado = soma dos itens), que vale
-- em qualquer cadastro.

do $prova$
declare
  v_tiago   uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';  -- Admin
  v_semperm uuid := '7d0194c2-fd7e-41d1-b6c4-f05c0a652229';  -- Compras, sem 13o

  v_cc uuid;
  v_um uuid; v_dois uuid; v_tres uuid;
  v_lote1 uuid; v_lote2 uuid;

  a_um numeric; a_dois numeric; a_avos_dois smallint; a_tres int;
  a_gravado numeric; a_soma numeric;
  b_um numeric; b_dois numeric; b_japago numeric;
  c_erro text := '(NAO RECUSOU)';
  d_erro text := '(NAO RECUSOU)';
  e_controle text := '(NAO ESTOUROU)';
begin
  -- As cobaias entram como postgres, ANTES da troca de role: insert em
  -- colaboradores nao e o que esta sendo provado aqui.
  select id into v_cc from public.centros_custo limit 1;

  insert into public.colaboradores (nome, vinculo, ativo, salario, data_admissao, centro_custo_id)
  values ('ZE PROVA UM', 'clt', true, 3000.00, date '2026-01-10', v_cc) returning id into v_um;
  insert into public.colaboradores (nome, vinculo, ativo, salario, data_admissao, centro_custo_id)
  values ('ZE PROVA DOIS', 'clt', true, 2400.00, date '2026-08-20', v_cc) returning id into v_dois;
  insert into public.colaboradores (nome, vinculo, ativo, salario, data_admissao, centro_custo_id)
  values ('ZE PROVA TRES', 'clt', true, 1800.00, null, v_cc) returning id into v_tres;

  -- ===================================================================
  -- A) 1a parcela a 50%, sem desconto
  -- ===================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  v_lote1 := public.fn_gerar_decimo_terceiro(2026::smallint, 1::smallint, 0.5, false, null);

  select valor_liquido into a_um   from public.rh_decimo_terceiro_itens
   where decimo_terceiro_id = v_lote1 and colaborador_id = v_um;
  select valor_liquido, avos into a_dois, a_avos_dois from public.rh_decimo_terceiro_itens
   where decimo_terceiro_id = v_lote1 and colaborador_id = v_dois;
  select count(*) into a_tres from public.rh_decimo_terceiro_itens
   where decimo_terceiro_id = v_lote1 and colaborador_id = v_tres;

  select valor_liquido into a_gravado from public.rh_decimo_terceiro where id = v_lote1;
  select coalesce(sum(valor_liquido),0) into a_soma from public.rh_decimo_terceiro_itens
   where decimo_terceiro_id = v_lote1;

  if a_um   <> 1500.00 then raise exception 'FALHOU Um na 1a: esperado 1500.00, veio %', a_um; end if;
  if a_dois <>  400.00 then raise exception 'FALHOU Dois na 1a: esperado 400.00, veio %', a_dois; end if;

  -- Prova que os avos foram CONSULTADOS e nao chutados em 12: se a funcao de
  -- avos parasse de ser chamada, Dois viraria 12 avos e 1.200,00.
  if a_avos_dois <> 4 then raise exception 'FALHOU avos de Dois: esperado 4, veio %', a_avos_dois; end if;

  -- TRAVA 2: quem nao tem data de admissao nao pode ter virado item.
  if a_tres <> 0 then raise exception 'FALHOU: colaborador sem data_admissao entrou no lote'; end if;

  -- Identidade: o total gravado tem que ser a soma dos itens.
  if a_gravado <> a_soma then
    raise exception 'FALHOU identidade da 1a: gravado % x soma dos itens %', a_gravado, a_soma;
  end if;

  -- ===================================================================
  -- B) 2a parcela a 100%, abatendo o BRUTO da 1a
  -- ===================================================================
  -- O lote 1 precisa estar aprovado para o abatimento enxergar. As RPCs de
  -- transicao sao da Task 4; aqui a transicao e feita na mao, como postgres.
  reset role;
  update public.rh_decimo_terceiro set status = 'aprovado' where id = v_lote1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  v_lote2 := public.fn_gerar_decimo_terceiro(2026::smallint, 2::smallint, 1.0, false, null);

  select valor_liquido, valor_ja_pago into b_um, b_japago
    from public.rh_decimo_terceiro_itens
   where decimo_terceiro_id = v_lote2 and colaborador_id = v_um;
  select valor_liquido into b_dois from public.rh_decimo_terceiro_itens
   where decimo_terceiro_id = v_lote2 and colaborador_id = v_dois;

  if b_japago <> 1500.00 then raise exception 'FALHOU ja_pago de Um: esperado 1500.00, veio %', b_japago; end if;
  if b_um     <> 1500.00 then raise exception 'FALHOU Um na 2a: esperado 1500.00, veio %', b_um; end if;
  if b_dois   <>  400.00 then raise exception 'FALHOU Dois na 2a: esperado 400.00, veio %', b_dois; end if;

  -- ===================================================================
  -- C) CONTROLE: desconto ligado com faixa de INSS vazia tem que RECUSAR
  -- ===================================================================
  begin
    perform public.fn_gerar_decimo_terceiro(2025::smallint, 1::smallint, 0.5, true, null);
  exception when others then c_erro := sqlerrm;
  end;
  if c_erro = '(NAO RECUSOU)' then
    raise exception 'FALHOU: gerou lote com desconto e faixa de INSS vazia';
  end if;
  reset role;

  -- ===================================================================
  -- D) CONTROLE: usuario sem permissao de 13o
  -- ===================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_semperm, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.fn_gerar_decimo_terceiro(2024::smallint, 1::smallint, 0.5, false, null);
  exception when others then d_erro := sqlerrm;
  end;
  if d_erro = '(NAO RECUSOU)' then
    raise exception 'FALHOU: usuario sem permissao gerou lote de 13o';
  end if;
  reset role;

  -- ===================================================================
  -- E) LINHA DE CONTROLE: um caso que DEVE falhar e falha.
  -- Se isto nao estourar, a prova nao esta olhando para nada.
  -- ===================================================================
  begin
    if a_um = 1499.99 then
      raise exception 'impossivel: 1500.00 nao e 1499.99';
    end if;
    -- Chegar aqui e o esperado. O teste de verdade e o de baixo.
    perform 1 / 0;
  exception when others then e_controle := sqlerrm;
  end;
  if e_controle = '(NAO ESTOUROU)' then
    raise exception 'FALHOU: a linha de controle nao estourou, a prova esta cega';
  end if;

  raise exception E'PROVA 13o - GERACAO (desfeita, nada gravado)\n  A) 1a parcela 50%%: Um=% (1500.00)  Dois=% (400.00)  avos de Dois=% (4)\n     sem admissao virou item? % (0)   identidade: gravado % = soma %\n  B) 2a parcela 100%%: ja_pago de Um=% (1500.00)  Um=% (1500.00)  Dois=% (400.00)\n  C) CONTROLE desconto com faixa vazia -> %\n  D) CONTROLE sem permissao -> %\n  E) CONTROLE linha de controle -> %',
    a_um, a_dois, a_avos_dois, a_tres, a_gravado, a_soma,
    b_japago, b_um, b_dois, c_erro, d_erro, e_controle;
end $prova$;

-- Resultado em 12/09/2026 (banco vivo, transacao desfeita):
--
--   A) 1a parcela 50%: Um=1500.00 (1500.00)  Dois=400.00 (400.00)  avos de Dois=4 (4)
--      sem admissao virou item? 0 (0)   identidade: gravado 11458.20 = soma 11458.20
--   B) 2a parcela 100%: ja_pago de Um=1500.00 (1500.00)  Um=1500.00 (1500.00)  Dois=400.00 (400.00)
--   C) CONTROLE desconto com faixa vazia -> Nao ha faixas de INSS cadastradas.
--      Cadastre em /rh/parametros-folha antes de gerar uma parcela com desconto.
--   D) CONTROLE sem permissao -> Sem permissao para gerar o 13o
--   E) CONTROLE linha de controle -> division by zero
--
-- Os 11.458,20 da identidade sao os 11 CLT reais com admissao mais as duas
-- cobaias. O numero anda quando o cadastro anda; o que nao anda e a igualdade.
--
-- Depois: 0 lotes, 0 itens, 0 cobaias, 0 lancamentos. Nada ficou.

-- =====================================================================
-- Parte 2: o ciclo de vida (migrations 20260912130000 e 20260912150000)
-- =====================================================================
--
-- Bloco proprio, nao aninhado no primeiro: cada um desfaz sozinho.
--
-- CONTA A MAO: ZE CICLO, salario 3.000,00, admitido 10/01/2026 = 12 avos.
--   1a parcela a 50% -> 1.500,00. Editando para 1.000,00 o total do lote
--   tem que cair exatamente 500,00.
--
-- O que esta parte existe para provar, alem da edicao: que DEVOLVER nao e um
-- beco sem saida. A primeira versao gravava status 'rejeitado', e
-- fn_enviar_decimo_terceiro_aprovacao so aceita 'rascunho': o lote devolvido
-- ficava preso, sem caminho de volta pela tela, enquanto o texto da propria
-- tela prometia "volta para rascunho". Por isso o item D reenvia.

do $prova2$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_cc uuid; v_um uuid; v_lote uuid; v_item uuid;
  a_antes numeric; a_depois numeric; a_delta numeric;
  b_erro text := '(NAO RECUSOU)';
  c_status text; c_motivo text;
  d_status text;
  e_erro text := '(NAO RECUSOU)';
  f_marcado boolean;
begin
  select id into v_cc from public.centros_custo limit 1;
  insert into public.colaboradores (nome, vinculo, ativo, salario, data_admissao, centro_custo_id)
  values ('ZE CICLO', 'clt', true, 3000.00, date '2026-01-10', v_cc) returning id into v_um;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  v_lote := public.fn_gerar_decimo_terceiro(2026::smallint, 1::smallint, 0.5, false, null);

  select id into v_item from public.rh_decimo_terceiro_itens
   where decimo_terceiro_id = v_lote and colaborador_id = v_um;
  select valor_liquido into a_antes from public.rh_decimo_terceiro where id = v_lote;

  -- A) editar o item move o total do lote na medida exata
  perform public.fn_editar_item_decimo_terceiro(v_item, 1000.00);
  select valor_liquido into a_depois from public.rh_decimo_terceiro where id = v_lote;
  select editado_manualmente into f_marcado from public.rh_decimo_terceiro_itens where id = v_item;
  a_delta := a_antes - a_depois;

  if a_delta <> 500.00 then raise exception 'FALHOU o recalculo: esperava cair 500.00, caiu %', a_delta; end if;
  if not f_marcado then raise exception 'FALHOU: item editado nao ficou marcado'; end if;

  -- B) enviar e tentar editar: tem que recusar
  perform public.fn_enviar_decimo_terceiro_aprovacao(v_lote);
  begin
    perform public.fn_editar_item_decimo_terceiro(v_item, 1.00);
  exception when others then b_erro := sqlerrm;
  end;
  if b_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: editou item de lote pendente'; end if;

  -- C) devolver para ajuste: volta para RASCUNHO guardando o motivo aparado
  perform public.fn_rejeitar_decimo_terceiro(v_lote, '  salario do Joao esta errado  ');
  select status, motivo_rejeicao into c_status, c_motivo
    from public.rh_decimo_terceiro where id = v_lote;
  if c_status <> 'rascunho' then
    raise exception 'FALHOU: devolver deixou o status em %, e de la nao se reenvia', c_status;
  end if;
  if c_motivo <> 'salario do Joao esta errado' then
    raise exception 'FALHOU: motivo gravado sem trim: "%"', c_motivo;
  end if;

  -- D) e do rascunho da para REENVIAR: o ciclo fecha, sem beco sem saida
  perform public.fn_enviar_decimo_terceiro_aprovacao(v_lote);
  select status into d_status from public.rh_decimo_terceiro where id = v_lote;
  if d_status <> 'pendente_aprovacao' then
    raise exception 'FALHOU: nao deu para reenviar depois de devolver, status %', d_status;
  end if;

  -- E) CONTROLE: excluir sem motivo tem que recusar. O motivo aqui e so tab,
  -- espaco e quebra de linha: btrim(x) sem argumento corta SO espaco.
  begin
    perform public.fn_excluir_decimo_terceiro(v_lote, E'\t  \n');
  exception when others then e_erro := sqlerrm;
  end;
  if e_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: excluiu sem motivo'; end if;

  reset role;
  raise exception E'PROVA 13o - CICLO (desfeita, nada gravado)\n  A) editar item: total caiu % (500.00)  marcado? %\n  B) CONTROLE editar apos enviar -> %\n  C) devolveu: status=% (rascunho)  motivo="%" (com trim)\n  D) reenviou: status=% (pendente_aprovacao)  o ciclo fecha\n  E) CONTROLE excluir com motivo so de espaco/tab -> %',
    a_delta, f_marcado, b_erro, c_status, c_motivo, d_status, e_erro;
end $prova2$;

-- Resultado em 12/09/2026:
--
--   A) editar item: total caiu 500.00 (500.00)  marcado? t
--   B) CONTROLE editar apos enviar -> O lote esta em "pendente_aprovacao":
--      so da para editar em rascunho.
--   C) devolveu: status=rascunho (rascunho)  motivo="salario do Joao esta errado"
--   D) reenviou: status=pendente_aprovacao (pendente_aprovacao)  o ciclo fecha
--   E) CONTROLE excluir com motivo so de espaco/tab -> Informe o motivo da exclusao

-- =====================================================================
-- Parte 3: o dinheiro (migration 20260912140000)
-- =====================================================================
--
-- CONTA A MAO: ZE DINHEIRO, 3.000,00, admitido 10/01/2026 = 12 avos.
--   1a parcela a 50% -> 1.500,00, que tem que virar conta a pagar de
--   1.500,00 com rateio de 1.500,00 no centro de custo dele.
--
-- A soma dos lancamentos NAO e conferida contra numero fixo (o lote pega
-- todo CLT), e sim contra o liquido do proprio lote. Essa igualdade vale em
-- qualquer cadastro, e e ela que diz que o dinheiro que sai e o dinheiro
-- que a tela mostra.

do $prova3$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_cc uuid; v_um uuid; v_lote uuid;
  a_liq numeric; a_soma numeric; a_qtd int; a_rateio numeric; a_cc uuid;
  b_qtd int; b_status text; b_lancitem int;
  c_erro text := '(NAO RECUSOU)';
  d_erro text := '(NAO RECUSOU)';
begin
  select id into v_cc from public.centros_custo limit 1;
  insert into public.colaboradores (nome, vinculo, ativo, salario, data_admissao, centro_custo_id)
  values ('ZE DINHEIRO', 'clt', true, 3000.00, date '2026-01-10', v_cc) returning id into v_um;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  v_lote := public.fn_gerar_decimo_terceiro(2026::smallint, 1::smallint, 0.5, false, null);

  -- C) CONTROLE: aprovar em rascunho tem que recusar (antes de enviar)
  begin
    perform public.fn_aprovar_decimo_terceiro(v_lote);
  exception when others then c_erro := sqlerrm;
  end;
  if c_erro = '(NAO RECUSOU)' then
    raise exception 'FALHOU: aprovou um lote que estava em rascunho';
  end if;

  perform public.fn_enviar_decimo_terceiro_aprovacao(v_lote);
  perform public.fn_aprovar_decimo_terceiro(v_lote);

  -- A) a soma dos lancamentos TEM que bater com o liquido do lote
  select valor_liquido into a_liq from public.rh_decimo_terceiro where id = v_lote;
  select coalesce(sum(l.valor),0), count(*) into a_soma, a_qtd
    from public.lancamentos l
   where l.origem = 'decimo_terceiro'
     and l.origem_id in (select id from public.rh_decimo_terceiro_itens
                          where decimo_terceiro_id = v_lote);

  -- Nao basta "nao deu erro": se a RPC nao tivesse executado o laco, a soma
  -- seria 0 = 0 e passaria. A contagem e que prova que ela rodou.
  if a_qtd = 0 then
    raise exception 'FALHOU: aprovou e nao gerou lancamento nenhum (a RPC nao executou)';
  end if;
  if a_soma <> a_liq then
    raise exception 'FALHOU: lote liquido % mas lancamentos somam %', a_liq, a_soma;
  end if;

  select r.valor, r.centro_custo_id into a_rateio, a_cc
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
   where l.origem = 'decimo_terceiro'
     and l.origem_id = (select id from public.rh_decimo_terceiro_itens
                         where decimo_terceiro_id = v_lote and colaborador_id = v_um);
  if a_rateio <> 1500.00 then
    raise exception 'FALHOU o rateio: esperado 1500.00, veio %', a_rateio;
  end if;
  if a_cc is distinct from v_cc then
    raise exception 'FALHOU: rateio caiu em centro de custo errado';
  end if;

  -- B) desaprovar devolve TUDO
  perform public.fn_desaprovar_decimo_terceiro(v_lote, 'prova');
  select count(*) into b_qtd from public.lancamentos
   where origem = 'decimo_terceiro'
     and origem_id in (select id from public.rh_decimo_terceiro_itens
                        where decimo_terceiro_id = v_lote);
  select status into b_status from public.rh_decimo_terceiro where id = v_lote;
  select count(*) into b_lancitem from public.rh_decimo_terceiro_itens
   where decimo_terceiro_id = v_lote and lancamento_id is not null;

  if b_qtd <> 0 then raise exception 'FALHOU: desaprovou e sobraram % lancamentos', b_qtd; end if;
  if b_status <> 'rascunho' then raise exception 'FALHOU: apos desaprovar o status ficou %', b_status; end if;
  if b_lancitem <> 0 then raise exception 'FALHOU: % itens ficaram com lancamento_id apontando para lancamento apagado', b_lancitem; end if;

  -- D) CONTROLE: desaprovar sem motivo
  begin
    perform public.fn_desaprovar_decimo_terceiro(v_lote, '   ');
  exception when others then d_erro := sqlerrm;
  end;
  if d_erro = '(NAO RECUSOU)' then
    raise exception 'FALHOU: desaprovou sem motivo';
  end if;

  reset role;
  raise exception E'PROVA 13o - DINHEIRO (desfeita, nada gravado)\n  A) aprovou: % lancamentos somando % = liquido do lote %\n     rateio do Ze=% (1500.00) no centro certo? %\n  B) desaprovou: lancamentos restantes=% (0)  status=% (rascunho)  itens com lancamento_id=% (0)\n  C) CONTROLE aprovar em rascunho -> %\n  D) CONTROLE desaprovar sem motivo -> %',
    a_qtd, a_soma, a_liq, a_rateio, (a_cc = v_cc), b_qtd, b_status, b_lancitem, c_erro, d_erro;
end $prova3$;

-- Resultado em 12/09/2026:
--
--   A) aprovou: 12 lancamentos somando 11058.20 = liquido do lote 11058.20
--      rateio do Ze=1500.00 (1500.00) no centro certo? t
--   B) desaprovou: lancamentos restantes=0 (0)  status=rascunho (rascunho)
--      itens com lancamento_id=0 (0)
--   C) CONTROLE aprovar em rascunho -> O lote esta em "rascunho": so da para
--      aprovar o que esta pendente de aprovacao.
--   D) CONTROLE desaprovar sem motivo -> Informe o motivo da desaprovacao
--
-- Os 12 lancamentos sao os 11 CLT reais com admissao mais a cobaia.
-- Depois: 0 lotes, 0 cobaias, 0 lancamentos de 13o. Nada ficou.
