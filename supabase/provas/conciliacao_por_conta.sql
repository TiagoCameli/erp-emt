-- Prova de aceite: conciliacao por conta (fn_conciliacao_*), 02/10/2026.
--
-- Roda em transacao e termina em ROLLBACK. Fabrica um extrato proprio na conta
-- BB 102.124-9 com datas de 01/10/2026 (fora do extrato real de setembro) e
-- passa por todos os caminhos da tela nova:
--   lancar o que falta no app, casar automatico, casar com ajuste de centavo,
--   casar parcela paga em outra conta, dar baixa em parcela aberta, lancar
--   transferencia, trocar conta e excluir o que esta no app e fora do banco.
-- No fim forca as constraints adiadas (rateio = valor, centro obrigatorio),
-- que num rollback nunca seriam checadas.
--
-- Linhas de controle: o automatico que tenta casar com ajuste ou outra conta
-- (tem que recusar), o casar sem ajustar com centavo de diferenca (recusa), e
-- a usuaria so com Conciliacao tentando lancar (recusa) e lendo o painel (le).

begin;

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_brenda uuid := 'a7324fb8-8311-4986-b975-8a8141ec7efc';  -- so Conciliacao
  v_bb uuid := '40fb6875-ad20-45ed-9346-d1b59e7d9723';
  v_caixa uuid := '3e8dd187-0684-40f0-8757-55608b9204ec';
  v_dia date := date '2026-10-01';
  v_centro uuid;
  v_extrato uuid;
  t_lancar uuid; t_auto uuid; t_centavo uuid; t_outra uuid; t_aberta uuid; t_trf uuid;
  v_lanc uuid; v_lanc2 uuid; v_parc uuid; v_parc2 uuid; v_trf uuid;
  v_aberta_lanc uuid; v_aberta_parc uuid;
  v_painel jsonb; v_lote jsonb; v_erro text; v_status text; v_conta uuid; v_juros numeric;
  v_conc boolean; v_auto boolean; v_qtd int;
begin
  select c.id into v_centro from public.centros_custo c
  where c.ativo and c.pai_id is null and c.tipo = 'escritorio' limit 1;
  if v_centro is null then raise exception 'FALHA: sem centro de custo de escritorio para a prova'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);

  insert into public.extratos_ofx (conta_bancaria_id, nome_arquivo, periodo_inicio, periodo_fim)
  values (v_bb, 'PROVA-conciliacao-por-conta.ofx', v_dia, v_dia) returning id into v_extrato;

  insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, chave_dedup)
  values (v_extrato, v_bb, v_dia, -123.45, 'debito', 'TARIFA PROVA', 'prova:lancar') returning id into t_lancar;
  insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, chave_dedup)
  values (v_extrato, v_bb, v_dia, -777.77, 'debito', 'PIX PROVA AUTO', 'prova:auto') returning id into t_auto;
  insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, chave_dedup)
  values (v_extrato, v_bb, v_dia, -777.78, 'debito', 'BOLETO PROVA CENTAVO', 'prova:centavo') returning id into t_centavo;
  insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, chave_dedup)
  values (v_extrato, v_bb, v_dia, -555.55, 'debito', 'PIX PROVA OUTRA CONTA', 'prova:outra') returning id into t_outra;
  insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, chave_dedup)
  values (v_extrato, v_bb, v_dia, -444.44, 'debito', 'BOLETO PROVA ABERTA', 'prova:aberta') returning id into t_aberta;
  insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, chave_dedup)
  values (v_extrato, v_bb, v_dia, -999.99, 'debito', 'TED PROVA PARA CAIXA', 'prova:trf') returning id into t_trf;

  -- 1. Lancar o que falta no app: nasce pago, nesta conta, conciliado.
  v_lanc := public.fn_conciliacao_lancar(t_lancar, jsonb_build_object(
    'descricao', 'Tarifa da prova', 'mesCompetencia', '2026-10-01', 'centroCustoId', v_centro));
  select p.id, p.status, p.conta_bancaria_id into v_parc, v_status, v_conta
  from public.lancamento_parcelas p where p.lancamento_id = v_lanc;
  select conciliada into v_conc from public.extrato_transacoes where id = t_lancar;
  if v_status <> 'pago' or v_conta <> v_bb or not v_conc then
    raise exception 'FALHA 1: lancar nao deixou pago/conta/conciliado (%, %, %)', v_status, v_conta, v_conc;
  end if;
  if (select status from public.lancamentos where id = v_lanc) <> 'pago' then
    raise exception 'FALHA 1: lancamento nao ficou pago';
  end if;
  raise notice 'OK 1 lancar: pago, na conta, conciliado';

  -- 2. Automatico: parcela paga nesta conta, valor exato.
  v_lanc2 := public.fn_conciliacao_lancar(t_auto, jsonb_build_object(
    'mesCompetencia', '2026-10-01', 'centroCustoId', v_centro));
  select id into v_parc2 from public.lancamento_parcelas where lancamento_id = v_lanc2;
  perform public.fn_desconciliar_transacao(t_auto);
  v_lote := public.fn_conciliacao_casar_lote(p_automatica => true, p_pares => jsonb_build_array(
    jsonb_build_object('transacao', t_auto, 'especie', 'parcela', 'alvo', v_parc2),
    -- controle: o automatico nao pode casar com diferenca de centavo
    jsonb_build_object('transacao', t_centavo, 'especie', 'parcela', 'alvo', v_parc2)));
  select conciliada, conciliacao_automatica into v_conc, v_auto from public.extrato_transacoes where id = t_auto;
  if (v_lote->>'casadas')::int <> 1 or jsonb_array_length(v_lote->'falhas') <> 1 or not v_conc or not v_auto then
    raise exception 'FALHA 2: lote %, conciliada %, automatica %', v_lote, v_conc, v_auto;
  end if;
  raise notice 'OK 2 automatico: 1 casado, controle recusado (%)', v_lote->'falhas'->0->>'erro';

  -- 3. Centavo: sem ajustar recusa, com ajustar vira juros e grava evento.
  perform public.fn_desconciliar_transacao(t_auto);
  begin
    perform public.fn_conciliacao_casar(t_centavo, 'parcela', v_parc2, false, null::text);
    raise exception 'FALHA 3: casou com centavo de diferenca sem ajustar';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
    v_erro := sqlerrm;
  end;
  perform public.fn_conciliacao_casar(t_centavo, 'parcela', v_parc2, false, 'financeiro'::text);
  select juros into v_juros from public.lancamento_parcelas where id = v_parc2;
  if v_juros <> 0.01 then raise exception 'FALHA 3: juros % (esperado 0,01)', v_juros; end if;
  if not exists (select 1 from public.parcela_eventos where parcela_id = v_parc2 and motivo like 'Conciliacao do extrato: valor ajustado%') then
    raise exception 'FALHA 3: sem evento do ajuste';
  end if;
  raise notice 'OK 3 centavo: recusou sem ajuste (%), com ajuste virou juros 0,01', v_erro;

  -- 4. Paga em outra conta: troca para a conta do extrato e casa.
  perform public.fn_desconciliar_transacao(t_lancar);
  update public.lancamento_parcelas set juros = 0 where id = v_parc2;
  perform public.fn_desconciliar_transacao(t_centavo);
  -- reaproveita a parcela da tarifa (123,45) como "paga na Caixa" de 555,55
  update public.lancamento_parcelas set valor = 555.55 where id = v_parc;
  update public.lancamentos set valor = 555.55 where id = v_lanc;
  update public.lancamento_rateios set valor = 555.55 where lancamento_id = v_lanc;
  perform public.fn_conciliacao_trocar_conta(v_parc, v_caixa, 'prova: pagamento lancado na Caixa');
  if (select conta_bancaria_id from public.lancamento_parcelas where id = v_parc) <> v_caixa then
    raise exception 'FALHA 4: trocar conta nao trocou';
  end if;
  v_lote := public.fn_conciliacao_casar_lote(p_automatica => true, p_pares => jsonb_build_array(
    jsonb_build_object('transacao', t_outra, 'especie', 'parcela', 'alvo', v_parc)));
  if (v_lote->>'casadas')::int <> 0 then raise exception 'FALHA 4: automatico casou parcela de outra conta'; end if;
  perform public.fn_conciliacao_casar(t_outra, 'parcela', v_parc, false, null::text);
  if (select conta_bancaria_id from public.lancamento_parcelas where id = v_parc) <> v_bb then
    raise exception 'FALHA 4: casar nao trouxe a parcela para a conta do extrato';
  end if;
  raise notice 'OK 4 outra conta: automatico recusou, manual trouxe para o BB';

  -- 5. Parcela em aberto: baixa na data do movimento.
  insert into public.lancamentos (tipo, origem, descricao, valor, status, data_compra, mes_competencia, data_vencimento, centro_custo_id)
  values ('a_pagar', 'manual', 'Prova aberta', 444.44, 'aprovado', v_dia, date '2026-10-01', v_dia, v_centro)
  returning id into v_aberta_lanc;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, conta_bancaria_id, data_programada)
  values (v_aberta_lanc, 1, 444.44, v_dia, 'aprovado', v_caixa, v_dia) returning id into v_aberta_parc;
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor) values (v_aberta_lanc, v_centro, 444.44);
  perform public.fn_conciliacao_casar(t_aberta, 'parcela', v_aberta_parc, false, null::text);
  select status, conta_bancaria_id into v_status, v_conta from public.lancamento_parcelas where id = v_aberta_parc;
  if v_status <> 'pago' or v_conta <> v_bb
     or (select data_pagamento from public.lancamento_parcelas where id = v_aberta_parc) <> v_dia
     or (select status from public.lancamentos where id = v_aberta_lanc) <> 'pago' then
    raise exception 'FALHA 5: baixa pela conciliacao (%, %)', v_status, v_conta;
  end if;
  raise notice 'OK 5 aberta: baixa em 01/10 no BB, lancamento pago';

  -- 5b. Controles das travas: a pagar nao aprovada nao baixa; diferenca acima
  -- de R$ 1,00 nao casa nem com ajuste; lancamento de varias parcelas nao se
  -- exclui por aqui.
  perform public.fn_desconciliar_transacao(t_aberta);
  update public.lancamento_parcelas set status = 'pendente', data_pagamento = null, pago_por = null, pago_em = null where id = v_aberta_parc;
  begin
    perform public.fn_conciliacao_casar(t_aberta, 'parcela', v_aberta_parc, false, null::text);
    raise exception 'FALHA 5b: deu baixa em parcela a pagar nao aprovada';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  begin
    perform public.fn_conciliacao_casar(t_aberta, 'parcela', v_parc2, false, 'financeiro'::text);
    raise exception 'FALHA 5b: casou com diferenca acima de R$ 1,00';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, conta_bancaria_id)
  values (v_lanc2, 2, 1, v_dia, 'pendente', v_bb);
  begin
    perform public.fn_conciliacao_excluir_lancamento(v_parc2, 'prova');
    raise exception 'FALHA 5b: excluiu lancamento de duas parcelas';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  delete from public.lancamento_parcelas where lancamento_id = v_lanc2 and numero_parcela = 2;
  update public.lancamento_parcelas set status = 'aprovado', data_programada = v_dia where id = v_aberta_parc;
  perform public.fn_conciliacao_casar(t_aberta, 'parcela', v_aberta_parc, false, null::text);
  raise notice 'OK 5b travas: nao aprovada, diferenca grande e varias parcelas recusadas';

  -- 6. Transferencia: debito do BB para a Caixa.
  v_trf := public.fn_conciliacao_lancar_transferencia(t_trf, v_caixa, null, null);
  if not exists (select 1 from public.transferencias_contas where id = v_trf and conta_origem_id = v_bb and conta_destino_id = v_caixa and valor = 999.99)
     or not (select conciliada from public.extrato_transacoes where id = t_trf) then
    raise exception 'FALHA 6: transferencia';
  end if;
  raise notice 'OK 6 transferencia: BB -> Caixa, conciliada';

  -- 7. Painel enxerga tudo, e enxerga a parcela livre como "pagas na conta".
  perform public.fn_desconciliar_transacao(t_auto);
  v_painel := public.fn_conciliacao_painel(v_bb, v_dia, v_dia);
  select count(*) into v_qtd from jsonb_array_elements(v_painel->'transacoes') x where x->>'memo' like '%PROVA%';
  if v_qtd <> 6 then raise exception 'FALHA 7: painel viu % movimentos da prova', v_qtd; end if;
  if not exists (select 1 from jsonb_array_elements(v_painel->'pagasNaConta') x where (x->>'id')::uuid = v_parc2) then
    raise exception 'FALHA 7: parcela livre nao apareceu em pagasNaConta';
  end if;
  raise notice 'OK 7 painel: 6 movimentos, parcela livre listada';

  -- 8. Excluir o que esta no app e fora do banco (v_lanc2, desconciliado).
  begin
    perform public.fn_conciliacao_excluir_lancamento(v_parc2, '');
    raise exception 'FALHA 8: excluiu sem motivo';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  perform public.fn_conciliacao_excluir_lancamento(v_parc2, 'prova: nao saiu do banco');
  if exists (select 1 from public.lancamentos where id = v_lanc2)
     or not exists (select 1 from arquivo_morto.lancamentos_excluidos_conciliacao where lancamento_id = v_lanc2) then
    raise exception 'FALHA 8: exclusao/arquivo morto';
  end if;
  raise notice 'OK 8 excluir: sem motivo recusa, com motivo apaga e arquiva';

  -- 9. Controle de permissao: so Conciliacao le o painel e nao lanca.
  delete from public.usuario_permissoes where usuario_id = v_brenda and recurso <> 'financeiro.conciliacao';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_brenda, 'role', 'authenticated')::text, true);
  v_painel := public.fn_conciliacao_painel(v_bb, v_dia, v_dia);
  begin
    perform public.fn_conciliacao_lancar(t_auto, jsonb_build_object('mesCompetencia', '2026-10-01', 'centroCustoId', v_centro));
    raise exception 'FALHA 9: lancou sem permissao de lancamentos';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
    v_erro := sqlerrm;
  end;
  begin
    perform public.fn_conciliacao_excluir_lancamento(v_parc, 'x');
    raise exception 'FALHA 9: excluiu sem permissao';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  begin
    perform public.fn_conciliacao_trocar_conta(v_parc, v_caixa, 'prova');
    raise exception 'FALHA 9: so com Conciliacao trocou a conta de pagamento';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  raise notice 'OK 9 permissao: painel le, lancar e trocar conta recusam (%)', v_erro;
end;
$prova$;

-- As constraints adiadas (soma do rateio, centro obrigatorio) so disparam no
-- commit; forcar aqui prova que os lancamentos criados sao validos.
set constraints all immediate;

select 'PROVA OK' as resultado;

rollback;
