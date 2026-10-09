-- Prova de aceite (09/10/2026): desfazer a conciliacao apaga o que a propria
-- conciliacao lancou, e so isso. Roda depois da migration 20261009120000 e
-- termina em ROLLBACK.
--
-- Controles: a transferencia lancada a mao e o lancamento que ja existia
-- continuam depois do desfazer; a transferencia conciliada tambem na outra
-- conta fica enquanto o outro lado a usa.

begin;

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_a uuid; v_b uuid; v_centro uuid; v_cat uuid;
  v_imp jsonb;
  v_m1 uuid; v_m2 uuid; v_m3 uuid; v_m4 uuid; v_m5 uuid; v_m6 uuid;
  v_trf uuid; v_lanc uuid; v_parcela uuid;
  v_marca boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);

  -- 0. Nenhuma orfa lancada pela conciliacao sobrou.
  if exists (select 1 from public.transferencias_contas t
              where t.observacoes = 'Lancada na conciliacao do extrato'
                and not exists (select 1 from public.extrato_transacoes e where e.transferencia_id = t.id)) then
    raise exception 'FALHA 0: ainda ha transferencia orfa da conciliacao';
  end if;

  insert into public.contas_bancarias (nome, banco, tipo, conta, ativo, saldo_inicial, saldo_inicial_data)
  values ('PROVA DESFAZER A', 'outro', 'corrente', '777.771-1', true, 1000, date '2026-09-30') returning id into v_a;
  insert into public.contas_bancarias (nome, banco, tipo, conta, ativo, saldo_inicial, saldo_inicial_data)
  values ('PROVA DESFAZER B', 'outro', 'corrente', '777.772-2', true, 1000, date '2026-09-30') returning id into v_b;
  select c.id into v_centro from public.centros_custo c where c.ativo and c.pai_id is null and c.tipo = 'escritorio' limit 1;
  select c.id into v_cat from public.categorias_financeiras c where c.ativo and c.tipo = 'despesa' order by c.nome limit 1;

  v_imp := public.fn_conciliacao_importar(v_a, 'PROVA-A.ofx', date '2026-10-01', date '2026-10-31', null, null, jsonb_build_array(
    jsonb_build_object('data', '2026-10-02', 'valor', -100, 'memo', 'TRANSFERENCIA ENVIADA 1', 'fitid', 'pd-1'),
    jsonb_build_object('data', '2026-10-03', 'valor', -30, 'memo', 'PAGAMENTO QUALQUER', 'fitid', 'pd-2'),
    jsonb_build_object('data', '2026-10-04', 'valor', -55, 'memo', 'TRANSFERENCIA ENVIADA 2', 'fitid', 'pd-3'),
    jsonb_build_object('data', '2026-10-05', 'valor', -70, 'memo', 'TRANSFERENCIA ENVIADA 3', 'fitid', 'pd-4'),
    jsonb_build_object('data', '2026-10-06', 'valor', -12, 'memo', 'PAGAMENTO ANTIGO', 'fitid', 'pd-5')));
  v_imp := public.fn_conciliacao_importar(v_b, 'PROVA-B.ofx', date '2026-10-01', date '2026-10-31', null, null, jsonb_build_array(
    jsonb_build_object('data', '2026-10-05', 'valor', 70, 'memo', 'TRANSFERENCIA RECEBIDA 3', 'fitid', 'pd-6')));
  select id into v_m1 from public.extrato_transacoes where conta_bancaria_id = v_a and fitid = 'pd-1';
  select id into v_m2 from public.extrato_transacoes where conta_bancaria_id = v_a and fitid = 'pd-2';
  select id into v_m3 from public.extrato_transacoes where conta_bancaria_id = v_a and fitid = 'pd-3';
  select id into v_m4 from public.extrato_transacoes where conta_bancaria_id = v_a and fitid = 'pd-4';
  select id into v_m5 from public.extrato_transacoes where conta_bancaria_id = v_a and fitid = 'pd-5';
  select id into v_m6 from public.extrato_transacoes where conta_bancaria_id = v_b and fitid = 'pd-6';
  if v_m1 is null or v_m6 is null then raise exception 'FALHA: importacao da prova'; end if;

  -- 1. Transferencia lancada pela conciliacao: desfazer a apaga, com copia na lixeira.
  v_trf := public.fn_conciliacao_lancar_transferencia(v_m1, v_b, null, 'prova 1');
  select lancado_na_conciliacao into v_marca from public.extrato_transacoes where id = v_m1;
  if not v_marca then raise exception 'FALHA 1: lancar_transferencia nao marcou'; end if;
  perform public.fn_desconciliar_transacao(v_m1);
  if exists (select 1 from public.transferencias_contas where id = v_trf) then
    raise exception 'FALHA 1: transferencia lancada pela conciliacao ficou depois do desfazer';
  end if;
  if not exists (select 1 from public.lixeira where tabela = 'transferencias_contas' and registro_id = v_trf::text) then
    raise exception 'FALHA 1: transferencia apagada sem copia na lixeira';
  end if;
  if exists (select 1 from public.extrato_transacoes where id = v_m1 and (conciliada or lancado_na_conciliacao)) then
    raise exception 'FALHA 1: movimento nao voltou limpo';
  end if;
  -- Lancar de novo cria uma so (nada duplicado).
  v_trf := public.fn_conciliacao_lancar_transferencia(v_m1, v_b, null, 'prova 1b');
  if (select count(*) from public.transferencias_contas where conta_origem_id = v_a and valor = 100) <> 1 then
    raise exception 'FALHA 1: transferencia duplicada';
  end if;

  -- 2. Lancamento do "Lancar": desfazer o apaga, com copia no arquivo morto.
  v_lanc := public.fn_conciliacao_lancar(v_m2, jsonb_build_object(
    'mesCompetencia', '2026-10-01', 'centroCustoId', v_centro, 'categoriaId', v_cat));
  perform public.fn_desconciliar_transacao(v_m2);
  if exists (select 1 from public.lancamentos where id = v_lanc) then
    raise exception 'FALHA 2: lancamento do Lancar ficou depois do desfazer';
  end if;
  if not exists (select 1 from arquivo_morto.lancamentos_excluidos_conciliacao where lancamento_id = v_lanc) then
    raise exception 'FALHA 2: lancamento apagado sem copia no arquivo morto';
  end if;

  -- 3. Controle: transferencia lancada a mao, so casada, fica.
  v_trf := public.fn_salvar_transferencia(null, v_a, v_b, date '2026-10-04', 55, 0, 'prova 3 manual', null, null);
  perform public.fn_conciliar_transferencia(v_m3, v_trf);
  perform public.fn_desconciliar_transacao(v_m3);
  if not exists (select 1 from public.transferencias_contas where id = v_trf) then
    raise exception 'FALHA 3: desfazer apagou transferencia lancada a mao';
  end if;

  -- 4. Conciliada nas duas contas: desfazer um lado nao apaga a do outro.
  v_trf := public.fn_conciliacao_lancar_transferencia(v_m4, v_b, null, 'prova 4');
  perform public.fn_conciliar_transferencia(v_m6, v_trf);
  perform public.fn_desconciliar_transacao(v_m4);
  if not exists (select 1 from public.transferencias_contas where id = v_trf) then
    raise exception 'FALHA 4: apagou transferencia que o outro lado ainda usa';
  end if;
  if (select transferencia_id from public.extrato_transacoes where id = v_m6) is distinct from v_trf then
    raise exception 'FALHA 4: o outro lado perdeu o vinculo';
  end if;

  -- 5. Controle: lancamento que ja existia, so casado, fica.
  v_lanc := public.fn_conciliacao_lancar(v_m5, jsonb_build_object(
    'mesCompetencia', '2026-10-01', 'centroCustoId', v_centro, 'categoriaId', v_cat));
  select id into v_parcela from public.lancamento_parcelas where lancamento_id = v_lanc;
  -- Simula um caminho que solta o vinculo sem o desfazer (a devolucao total
  -- faz isso), deixando a marca ligada, e um casamento comum depois.
  update public.extrato_transacoes set parcela_id = null, conciliada = false where id = v_m5;
  perform public.fn_conciliar_transacao(v_m5, v_parcela);
  update public.extrato_transacoes set conciliado_em = now() + interval '1 second' where id = v_m5;
  perform public.fn_desconciliar_transacao(v_m5);
  if not exists (select 1 from public.lancamentos where id = v_lanc) then
    raise exception 'FALHA 5: desfazer de casamento comum apagou o lancamento';
  end if;

  raise notice 'PROVA OK: desfazer apaga o que a conciliacao lancou, e so isso';
end
$prova$;

rollback;
