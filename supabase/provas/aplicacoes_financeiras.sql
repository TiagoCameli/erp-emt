-- =============================================================
-- PROVA: Financeiro > Aplicacoes (25/09/2026)
--
-- Roda como owner (MCP) e termina em RAISE: nada fica gravado. As partes que
-- dependem de permissao trocam para `set local role authenticated` com o
-- `sub` do usuario no jwt (so set_config nao vale, o MCP entra como owner).
--
-- Se a abertura ainda nao foi carregada, a prova cria a mesma abertura que
-- 20260926120000_abertura_das_aplicacoes.sql cria, dentro da transacao.
--
-- (a) depois da abertura a subconta fecha em 6.017.484,75 e cada aplicacao
--     no seu valor. CONTROLE: antes dela, 5.913.186,79.
-- (b) regravar a posicao nao duplica o rendimento (1 lancamento por posicao).
-- (c) excluir a posicao estorna o rendimento dela (saldo volta).
-- (d) o ajuste de abertura NAO entra no DRE nem no fluxo de caixa; um
--     rendimento de teste de 1.000,00 entra nos dois. O valor discrimina: um
--     DRE que ignorasse a origem mostraria +104.297,96 na abertura.
-- (e) usuario sem permissao nao ve valor: Andreia com a aba mas SEM saldo da
--     Caixa recebe 0 linhas (e nao zero); Dora com a aba e COM saldo recebe as
--     linhas (controle de que a trava nao barra quem pode); sem a aba, recusa.
-- (f) transferencias intactas: contagem e soma iguais antes e depois.
-- Mais: trigger de transferencia recalcula; estorno do lancamento gerado e
-- recusado; rendimento negativo vai na categoria propria.
--
-- RESULTADO OBSERVADO: ver o comentario no fim do arquivo.
-- =============================================================
do $prova$
declare
  c_sub constant uuid := '37ca9c33-859d-42d7-8c14-78a6119d0258';
  c_caixa constant uuid := '3e8dd187-0684-40f0-8757-55608b9204ec';
  c_etapa_cdb constant uuid := 'aacc7055-2fcb-48f9-bbcd-0e2ef4125fbb';
  c_etapa_fundo constant uuid := '29378afd-5b44-4935-b0d6-7e99979e955a';
  c_abertura constant uuid := '9feb495d-3d71-48b6-b509-2c798cb45e19';
  c_juros constant uuid := 'ad676dc2-eb07-49ec-9005-ed85f98f9dbe';
  c_negativo constant uuid := 'd0157304-467a-4def-81fd-09660a0e02af';
  v_tiago uuid := (select id from public.usuarios where email = 'tiago@emtconstrutora.com');
  v_dora uuid := (select id from public.usuarios where email = 'dora@emtconstrutora.com');
  v_andreia uuid := (select id from public.usuarios where email = 'andreia@emtconstrutora.com');
  v_cdb uuid; v_fundo uuid;
  v_log text := '';
  v_ok int := 0; v_falha int := 0;
  v_n0 bigint; v_s0 numeric; v_n1 bigint; v_s1 numeric;
  v_saldo_antes numeric; v_saldo numeric;
  v_dre0 numeric; v_dre numeric; v_flx0 numeric; v_flx numeric;
  v_x numeric; v_y numeric; v_i bigint; v_txt text;
  v_pos_teste uuid; v_pos_fundo uuid; v_trf uuid; v_parcela uuid;
begin
  select id into v_cdb from public.aplicacoes where centro_custo_id = c_etapa_cdb;
  select id into v_fundo from public.aplicacoes where centro_custo_id = c_etapa_fundo;

  -- linha de base
  select count(*), sum(valor) into v_n0, v_s0 from public.transferencias_contas
   where c_sub in (conta_origem_id, conta_destino_id);
  select coalesce(sum(total), 0) into v_dre0 from public.fn_rel_dre('2026-09-01', '2026-10-01');
  select coalesce(sum(case when tipo = 'a_receber' then total else -total end), 0) into v_flx0
    from public.fn_rel_fluxo_caixa() where mes = '2026-09' and realizado;

  -- ---------- abertura ----------
  if not exists (select 1 from public.aplicacao_posicoes where e_abertura and excluido_em is null) then
    v_saldo_antes := public.fn_saldo_conta(c_sub);
    insert into public.aplicacao_posicoes (aplicacao_id, data, saldo_liquido, e_abertura, observacoes)
    values (v_cdb, '2026-09-25', 5016513.57, true, 'Abertura: posicao liquida para resgate informada pelo Tiago'),
           (v_fundo, '2026-09-25', 1000971.18, true, 'Abertura: posicao liquida para resgate informada pelo Tiago');
    perform public.fn_aplicacao_recalcular(v_cdb, '2026-09-25');
    perform public.fn_aplicacao_recalcular(v_fundo, '2026-09-25');
    v_log := v_log || format(E'\n[controle] saldo da subconta antes da abertura = %s', v_saldo_antes);
  else
    v_log := v_log || E'\n[info] abertura ja carregada';
    v_saldo_antes := 5913186.79;
  end if;

  -- (a)
  v_saldo := public.fn_saldo_conta(c_sub);
  if v_saldo = 6017484.75 and v_saldo_antes <> v_saldo then v_ok := v_ok + 1; else v_falha := v_falha + 1; end if;
  v_log := v_log || format(E'\n(a) subconta = %s (esperado 6017484.75; antes %s)', v_saldo, v_saldo_antes);

  select string_agg(l.descricao || '=' || l.valor || '/' || l.tipo, '; ' order by l.descricao), count(*)
    into v_txt, v_i
  from public.lancamentos l where l.origem = 'aplicacao';
  if v_i = 2 and v_txt like '%CDB 95=90374.18/a_receber%' and v_txt like '%Fundo=13923.78/a_receber%'
  then v_ok := v_ok + 1; else v_falha := v_falha + 1; end if;
  v_log := v_log || format(E'\n(a) lancamentos da abertura: %s', v_txt);

  -- (d) abertura fora do DRE e do fluxo
  select coalesce(sum(total), 0) into v_dre from public.fn_rel_dre('2026-09-01', '2026-10-01');
  select coalesce(sum(case when tipo = 'a_receber' then total else -total end), 0) into v_flx
    from public.fn_rel_fluxo_caixa() where mes = '2026-09' and realizado;
  if v_dre = v_dre0 and v_flx = v_flx0 then v_ok := v_ok + 1; else v_falha := v_falha + 1; end if;
  v_log := v_log || format(E'\n(d) abertura: DRE set %s -> %s, fluxo set %s -> %s (tem que ficar igual)', v_dre0, v_dre, v_flx0, v_flx);

  -- aba, como Tiago
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select string_agg(format('%s fim=%s ajuste=%s rend=%s', a.produto, f.posicao_final, f.ajuste_abertura, coalesce(f.rendimento::text, 'nulo')), '; ' order by a.produto),
         sum(f.posicao_final)
    into v_txt, v_x
  from public.fn_aba_aplicacoes('2026-09-01', '2026-09-30') f
  join public.aplicacoes a on a.id = f.aplicacao_id;
  execute 'reset role';
  if v_x = 6017484.75 and v_txt like '%cdb fim=5016513.57 ajuste=90374.18 rend=nulo%'
     and v_txt like '%fundo fim=1000971.18 ajuste=13923.78 rend=nulo%'
  then v_ok := v_ok + 1; else v_falha := v_falha + 1; end if;
  v_log := v_log || format(E'\n(a) aba set/26: %s | soma %s', v_txt, v_x);

  -- identidade mes a mes: final = inicial + aplicado - resgatado + rend + ajuste
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_i from public.fn_aba_aplicacoes() f
   where f.posicao_final <> f.posicao_inicial + f.aplicado - f.resgatado
                            + coalesce(f.rendimento, 0) + coalesce(f.ajuste_abertura, 0);
  execute 'reset role';
  if v_i = 0 then v_ok := v_ok + 1; else v_falha := v_falha + 1; end if;
  v_log := v_log || format(E'\n(a) meses que quebram a identidade: %s', v_i);

  -- (b) regravar a abertura do CDB com +100 e de volta: continua 1 lancamento
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.fn_salvar_posicao_aplicacao(v_cdb, '2026-09-25', 5016613.57);
  execute 'reset role';
  select count(*), max(valor) into v_i, v_x from public.lancamentos
   where origem = 'aplicacao' and origem_id in (select id from public.aplicacao_posicoes where aplicacao_id = v_cdb);
  v_saldo := public.fn_saldo_conta(c_sub);
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.fn_salvar_posicao_aplicacao(v_cdb, '2026-09-25', 5016513.57);
  perform public.fn_salvar_posicao_aplicacao(v_cdb, '2026-09-25', 5016513.57);
  execute 'reset role';
  select count(*) into v_n1 from public.lancamentos where origem = 'aplicacao';
  if v_i = 1 and v_x = 90474.18 and v_saldo = 6017584.75 and v_n1 = 2
     and public.fn_saldo_conta(c_sub) = 6017484.75
  then v_ok := v_ok + 1; else v_falha := v_falha + 1; end if;
  v_log := v_log || format(E'\n(b) regravar +100: %s lancamento de %s, subconta %s; de volta (2x): %s lancamentos, subconta %s',
    v_i, v_x, v_saldo, v_n1, public.fn_saldo_conta(c_sub));

  -- rendimento de teste: posicao de amanha (26/09) inserida pelo owner, porque
  -- a funcao recusa data futura de proposito
  insert into public.aplicacao_posicoes (aplicacao_id, data, saldo_liquido)
  values (v_cdb, '2026-09-26', 5017513.57) returning id into v_pos_teste;
  perform public.fn_aplicacao_sincronizar_posicao(v_pos_teste);
  select l.valor || '/' || l.tipo || '/' || (l.categoria_id = c_juros) into v_txt
    from public.lancamentos l where l.origem = 'aplicacao' and l.origem_id = v_pos_teste;
  select coalesce(sum(total), 0) into v_dre from public.fn_rel_dre('2026-09-01', '2026-10-01');
  select coalesce(sum(case when tipo = 'a_receber' then total else -total end), 0) into v_flx
    from public.fn_rel_fluxo_caixa() where mes = '2026-09' and realizado;
  if v_txt = '1000.00/a_receber/true' and v_dre = v_dre0 + 1000 and v_flx = v_flx0 + 1000
     and public.fn_saldo_conta(c_sub) = 6018484.75
  then v_ok := v_ok + 1; else v_falha := v_falha + 1; end if;
  v_log := v_log || format(E'\n(d) rendimento de teste: %s; DRE +%s; fluxo +%s; subconta %s',
    v_txt, v_dre - v_dre0, v_flx - v_flx0, public.fn_saldo_conta(c_sub));

  -- trigger: resgate de 100 no dia 26 com a etapa do CDB muda o rendimento para 1100
  insert into public.transferencias_contas (numero, conta_origem_id, conta_destino_id, data_transferencia, valor, tarifa, descricao, centro_custo_id)
  values ('TRF-PROVA', c_sub, c_caixa, '2026-09-26', 100, 0, 'prova', c_etapa_cdb) returning id into v_trf;
  select l.valor into v_x from public.lancamentos l where l.origem = 'aplicacao' and l.origem_id = v_pos_teste;
  delete from public.transferencias_contas where id = v_trf;
  select l.valor into v_y from public.lancamentos l where l.origem = 'aplicacao' and l.origem_id = v_pos_teste;
  if v_x = 1100 and v_y = 1000 then v_ok := v_ok + 1; else v_falha := v_falha + 1; end if;
  v_log := v_log || format(E'\n[trigger] resgate de 100 no periodo: rendimento %s; apagado: %s', v_x, v_y);

  -- estorno do lancamento gerado e recusado
  select lp.id into v_parcela from public.lancamento_parcelas lp
    join public.lancamentos l on l.id = lp.lancamento_id
   where l.origem = 'aplicacao' and l.origem_id = v_pos_teste;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.fn_estornar_pagamento(v_parcela);
    execute 'reset role';
    v_falha := v_falha + 1; v_log := v_log || E'\n[trava] estorno PASSOU (errado)';
  exception when others then
    execute 'reset role';
    if sqlerrm like '%gerado pela posicao da aplicacao%' then v_ok := v_ok + 1; else v_falha := v_falha + 1; end if;
    v_log := v_log || format(E'\n[trava] estorno recusado: %s', sqlerrm);
  end;

  -- (c) excluir a posicao de teste estorna o rendimento
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.fn_excluir_posicao_aplicacao(v_pos_teste, 'prova');
  execute 'reset role';
  select count(*) into v_i from public.lancamentos where origem = 'aplicacao' and origem_id = v_pos_teste;
  if v_i = 0 and public.fn_saldo_conta(c_sub) = 6017484.75 then v_ok := v_ok + 1; else v_falha := v_falha + 1; end if;
  v_log := v_log || format(E'\n(c) excluir: lancamentos da posicao %s, subconta %s', v_i, public.fn_saldo_conta(c_sub));

  -- rendimento negativo (fundo, -500)
  insert into public.aplicacao_posicoes (aplicacao_id, data, saldo_liquido)
  values (v_fundo, '2026-09-26', 1000471.18) returning id into v_pos_fundo;
  perform public.fn_aplicacao_sincronizar_posicao(v_pos_fundo);
  select l.valor || '/' || l.tipo || '/' || (l.categoria_id = c_negativo) into v_txt
    from public.lancamentos l where l.origem = 'aplicacao' and l.origem_id = v_pos_fundo;
  if v_txt = '500.00/a_pagar/true' and public.fn_saldo_conta(c_sub) = 6016984.75
  then v_ok := v_ok + 1; else v_falha := v_falha + 1; end if;
  v_log := v_log || format(E'\n[negativo] %s; subconta %s', v_txt, public.fn_saldo_conta(c_sub));

  -- (e) permissoes: Dora e Andreia ganham a aba DENTRO da transacao
  insert into public.usuario_permissoes (usuario_id, recurso, acao)
  values (v_dora, 'financeiro.aplicacoes', 'ver'), (v_andreia, 'financeiro.aplicacoes', 'ver');

  perform set_config('request.jwt.claims', json_build_object('sub', v_andreia, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_i from public.fn_aba_aplicacoes();
  select count(*) into v_n1 from public.aplicacao_posicoes;
  execute 'reset role';
  v_log := v_log || format(E'\n(e) Andreia (aba sim, saldo nao): %s linhas da aba, %s posicoes', v_i, v_n1);
  if v_i = 0 and v_n1 = 0 then v_ok := v_ok + 1; else v_falha := v_falha + 1; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_dora, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_i from public.fn_aba_aplicacoes();
  select count(*) into v_n1 from public.aplicacao_posicoes;
  execute 'reset role';
  v_log := v_log || format(E'\n(e) CONTROLE Dora (aba sim, saldo sim): %s linhas da aba, %s posicoes', v_i, v_n1);
  if v_i > 0 and v_n1 > 0 then v_ok := v_ok + 1; else v_falha := v_falha + 1; end if;

  delete from public.usuario_permissoes where usuario_id = v_andreia and recurso = 'financeiro.aplicacoes';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_andreia, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform count(*) from public.fn_aba_aplicacoes();
    execute 'reset role';
    v_falha := v_falha + 1; v_log := v_log || E'\n(e) Andreia sem a aba PASSOU (errado)';
  exception when others then
    execute 'reset role';
    v_ok := v_ok + 1; v_log := v_log || format(E'\n(e) Andreia sem a aba: recusado (%s)', sqlerrm);
  end;

  -- (f) transferencias intactas
  select count(*), sum(valor) into v_n1, v_s1 from public.transferencias_contas
   where c_sub in (conta_origem_id, conta_destino_id);
  if v_n1 = v_n0 and v_s1 = v_s0 and v_n0 = 51 and v_s0 = 26856813.21
  then v_ok := v_ok + 1; else v_falha := v_falha + 1; end if;
  v_log := v_log || format(E'\n(f) transferencias: antes %s / %s, depois %s / %s', v_n0, v_s0, v_n1, v_s1);

  raise exception E'PROVA DESFEITA. % ok, % falha(s).%', v_ok, v_falha, v_log;
end $prova$;

-- RESULTADO OBSERVADO (preencher ao rodar):
-- 25/09/2026, antes da abertura (a prova criou a abertura dentro da transacao):
-- PROVA DESFEITA. 15 ok, 0 falha(s).
-- [controle] saldo da subconta antes da abertura = 5913186.79
-- (a) subconta = 6017484.75 (esperado 6017484.75; antes 5913186.79)
-- (a) lancamentos da abertura: Ajuste de abertura · Caixa Econômica - CDB 95=90374.18/a_receber; Ajuste de abertura · Caixa Econômica - Fundo=13923.78/a_receber
-- (d) abertura: DRE set 1936655.72 -> 1936655.72, fluxo set 5655980.88 -> 5655980.88 (tem que ficar igual)
-- (a) aba set/26: cdb fim=5016513.57 ajuste=90374.18 rend=nulo; fundo fim=1000971.18 ajuste=13923.78 rend=nulo | soma 6017484.75
-- (a) meses que quebram a identidade: 0
-- (b) regravar +100: 1 lancamento de 90474.18, subconta 6017584.75; de volta (2x): 2 lancamentos, subconta 6017484.75
-- (d) rendimento de teste: 1000.00/a_receber/true; DRE +1000.00; fluxo +1000.00; subconta 6018484.75
-- [trigger] resgate de 100 no periodo: rendimento 1100.00; apagado: 1000.00
-- [trava] estorno recusado: Nao da para estornar: este lancamento foi gerado pela posicao da aplicacao. ...
-- (c) excluir: lancamentos da posicao 0, subconta 6017484.75
-- [negativo] 500.00/a_pagar/true; subconta 6016984.75
-- (e) Andreia (aba sim, saldo nao): 0 linhas da aba, 0 posicoes
-- (e) CONTROLE Dora (aba sim, saldo sim): 12 linhas da aba, 4 posicoes
-- (e) Andreia sem a aba: recusado (Sem permissao para ver aplicacoes)
-- (f) transferencias: antes 51 / 26856813.21, depois 51 / 26856813.21
