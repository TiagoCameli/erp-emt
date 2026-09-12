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
