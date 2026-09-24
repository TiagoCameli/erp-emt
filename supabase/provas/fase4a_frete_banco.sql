-- Prova da Fase 4a (banco do Frete). Migration 20260925100000_fase4_frete_banco.
-- NÃO GRAVA: termina em raise exception com as medições.
-- Números esperados, calculados à mão:
--   f1 material 30,5 t x 800 km x 0,37 = 9.028,0000; material 30,5 x 106,73 = 3.255,265
--   f2 transferência 20 t x 120 km x 0,37 = 888,0000 (sem obra, sem NF)
--   f3 material 253,0226 t x 710 km x 0,35 = 62.876,1161 (exato, sem arredondar)
--   A: 9.028 + 888 + 62.876,1161 = 72.792,1161; pagamento 5.000 -> 67.792,1161
--   f1 vai para B -> A 58.764,1161, B 9.028; excluir f2 -> A 57.876,1161; restaurar -> 58.764,1161
--   ajuste +100 pendente -> A igual; aprovado -> 58.864,1161; desaprovado -> 58.764,1161

do $prova$
declare
  v_tiago constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_zero constant uuid := 'f155865b-1d4b-4b25-bf3d-54d8de9176b0';
  v_obra constant uuid := 'a39e45c0-aea5-4d98-aebd-814616b8551c';
  v_obra2 uuid; v_insumo uuid; v_a uuid; v_b uuid; v_nao_transp uuid;
  v_la uuid; v_lb uuid; v_f1 uuid; v_f2 uuid; v_f3 uuid; v_p1 uuid; v_aj uuid; v_aj2 uuid; v_ped uuid;
  v_lanc0 bigint; v_n bigint; v_txt text; r jsonb := '{}'::jsonb;
begin
  select count(*) into v_lanc0 from public.lancamentos;
  select id into v_a from public.fornecedores where eh_transportadora order by razao_social limit 1;
  select id into v_b from public.fornecedores where eh_transportadora and id <> v_a order by razao_social limit 1;
  select id into v_nao_transp from public.fornecedores where not eh_transportadora and not eh_dona_de_tanque and ativo limit 1;
  select id into v_insumo from public.insumos where ativo order by codigo limit 1;
  select id into v_obra2 from public.centros_custo where pai_id is null and id <> v_obra and ativo limit 1;
  insert into public.localidades (nome) values ('PROVA Pedreira') returning id into v_la;
  insert into public.localidades (nome) values ('PROVA Usina') returning id into v_lb;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. Frete de material: valor = peso x km x R$/t.km, material = peso x unitário, crédito igual
  v_f1 := public.fn_frete_salvar(null, jsonb_build_object('tipo', 'material', 'data', '2026-09-10', 'centro_custo_id', v_obra,
    'origem_localidade_id', v_la, 'destino_localidade_id', v_lb, 'transportadora_id', v_a, 'motorista', 'Motorista Prova',
    'insumo_id', v_insumo, 'peso_toneladas', 30.5, 'km_rodados', 800, 'valor_tkm', 0.37, 'valor_unitario_material', 106.73,
    'nota_fiscal', '123', 'placa_carreta', 'abc1d34'));
  select jsonb_build_object('valor_total', valor_total, 'valor_material', valor_material, 'placa', placa_carreta) into strict v_txt
    from public.fretes where id = v_f1;
  r := r || jsonb_build_object('1a_frete', v_txt::jsonb);
  select jsonb_build_object('tipo', tipo, 'valor', valor, 'data_utc', to_char(data at time zone 'UTC', 'YYYY-MM-DD HH24:MI'),
    'mes', mes_referencia, 'desc', descricao, 'centro_ok', centro_custo_id = v_obra) into strict v_txt
    from public.transportadora_movimentos where origem_tabela = 'fretes' and origem_id = v_f1;
  r := r || jsonb_build_object('1b_credito', v_txt::jsonb);

  -- 2. Transferência sem obra passa; descrição da origem; sem NF nem material
  v_f2 := public.fn_frete_salvar(null, jsonb_build_object('tipo', 'transferencia', 'data', '2026-09-11',
    'origem_localidade_id', v_lb, 'destino_localidade_id', v_la, 'transportadora_id', v_a, 'motorista', 'Motorista Prova',
    'insumo_id', v_insumo, 'peso_toneladas', 20, 'km_rodados', 120, 'valor_tkm', 0.37, 'valor_unitario_material', 50,
    'nota_fiscal', 'NAO VAI'));
  select jsonb_build_object('valor_total', f.valor_total, 'material', f.valor_material, 'nf', f.nota_fiscal, 'desc', m.descricao)
    into strict v_txt from public.fretes f join public.transportadora_movimentos m on m.origem_id = f.id where f.id = v_f2;
  r := r || jsonb_build_object('2_transferencia', v_txt::jsonb);

  -- 3. Recusas: material sem obra, fornecedor que não é transportadora, placa, peso zero
  begin perform public.fn_frete_salvar(null, jsonb_build_object('tipo', 'material', 'data', '2026-09-10', 'origem_localidade_id', v_la,
    'destino_localidade_id', v_lb, 'transportadora_id', v_a, 'motorista', 'MP', 'insumo_id', v_insumo, 'peso_toneladas', 1,
    'km_rodados', 1, 'valor_tkm', 1)); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3a_material_sem_obra', v_txt);
  begin perform public.fn_frete_salvar(null, jsonb_build_object('tipo', 'transferencia', 'data', '2026-09-10', 'origem_localidade_id', v_la,
    'destino_localidade_id', v_lb, 'transportadora_id', v_nao_transp, 'motorista', 'MP', 'insumo_id', v_insumo, 'peso_toneladas', 1,
    'km_rodados', 1, 'valor_tkm', 1)); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3b_nao_transportadora', v_txt);
  begin perform public.fn_frete_salvar(null, jsonb_build_object('tipo', 'transferencia', 'data', '2026-09-10', 'origem_localidade_id', v_la,
    'destino_localidade_id', v_lb, 'transportadora_id', v_a, 'motorista', 'MP', 'insumo_id', v_insumo, 'peso_toneladas', 1,
    'km_rodados', 1, 'valor_tkm', 1, 'placa_carreta', 'XX12')); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3c_placa', v_txt);
  begin perform public.fn_frete_salvar(null, jsonb_build_object('tipo', 'transferencia', 'data', '2026-09-10', 'origem_localidade_id', v_la,
    'destino_localidade_id', v_lb, 'transportadora_id', v_a, 'motorista', 'MP', 'insumo_id', v_insumo, 'peso_toneladas', 0,
    'km_rodados', 1, 'valor_tkm', 1)); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3d_peso_zero', v_txt);

  -- 4. Valor exato, sem arredondar
  v_f3 := public.fn_frete_salvar(null, jsonb_build_object('tipo', 'material', 'data', '2026-09-12', 'centro_custo_id', v_obra,
    'origem_localidade_id', v_la, 'destino_localidade_id', v_lb, 'transportadora_id', v_a, 'motorista', 'Motorista Prova',
    'insumo_id', v_insumo, 'peso_toneladas', 253.0226, 'km_rodados', 710, 'valor_tkm', 0.35));
  r := r || jsonb_build_object('4_valor_exato', (select valor_total from public.fretes where id = v_f3),
    '4_credito', (select valor from public.transportadora_movimentos where origem_id = v_f3));
  r := r || jsonb_build_object('4_saldo_A', (select saldo from public.transportadora_saldos where transportadora_id = v_a));

  -- 5. Pagamento: débito; sem mês de referência usa o da data; combustível sem litros recusa
  v_p1 := public.fn_frete_pagamento_salvar(null, jsonb_build_object('data', '2026-09-15', 'transportadora_id', v_a, 'valor', 5000,
    'metodo', 'pix', 'responsavel', 'Prova', 'pago_por', 'EMT Construtora'));
  select jsonb_build_object('tipo', tipo, 'valor', valor, 'mes', mes_referencia, 'desc', descricao) into strict v_txt
    from public.transportadora_movimentos where origem_id = v_p1;
  r := r || jsonb_build_object('5a_debito', v_txt::jsonb,
    '5b_saldo_A', (select saldo from public.transportadora_saldos where transportadora_id = v_a));
  begin perform public.fn_frete_pagamento_salvar(null, jsonb_build_object('data', '2026-09-15', 'transportadora_id', v_a, 'valor', 10,
    'metodo', 'combustivel', 'responsavel', 'Prova', 'pago_por', 'EMT Construtora')); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5c_combustivel_sem_litros', v_txt);

  -- 6. Defeitos da origem corrigidos: trocar a transportadora leva o crédito; trocar a obra leva o centro
  perform public.fn_frete_salvar(v_f1, jsonb_build_object('data', '2026-09-10', 'centro_custo_id', v_obra,
    'origem_localidade_id', v_la, 'destino_localidade_id', v_lb, 'transportadora_id', v_b, 'motorista', 'Motorista Prova',
    'insumo_id', v_insumo, 'peso_toneladas', 30.5, 'km_rodados', 800, 'valor_tkm', 0.37, 'valor_unitario_material', 106.73,
    'nota_fiscal', '123'));
  perform public.fn_frete_salvar(v_f3, jsonb_build_object('data', '2026-09-12', 'centro_custo_id', v_obra2,
    'origem_localidade_id', v_la, 'destino_localidade_id', v_lb, 'transportadora_id', v_a, 'motorista', 'Motorista Prova',
    'insumo_id', v_insumo, 'peso_toneladas', 253.0226, 'km_rodados', 710, 'valor_tkm', 0.35));
  r := r || jsonb_build_object('6a_saldo_A', (select saldo from public.transportadora_saldos where transportadora_id = v_a),
    '6b_saldo_B', (select saldo from public.transportadora_saldos where transportadora_id = v_b),
    '6c_movimentos_f1', (select count(*) from public.transportadora_movimentos where origem_id = v_f1),
    '6d_centro_acompanhou', (select centro_custo_id = v_obra2 from public.transportadora_movimentos where origem_id = v_f3));

  -- 7. Excluir com motivo tira do saldo; restaurar devolve
  perform public.fn_frete_excluir('fretes', v_f2, 'PROVA');
  r := r || jsonb_build_object('7a_saldo_A_excluido', (select saldo from public.transportadora_saldos where transportadora_id = v_a));
  perform public.fn_frete_restaurar('fretes', v_f2);
  r := r || jsonb_build_object('7b_saldo_A_restaurado', (select saldo from public.transportadora_saldos where transportadora_id = v_a));
  begin perform public.fn_frete_excluir('fretes', v_f2, ' '); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('7c_sem_motivo', v_txt);

  -- 8. Pedido de material: itens com 6 casas; sem item recusa
  v_ped := public.fn_pedido_material_salvar(null, jsonb_build_object('data', '2026-09-11', 'fornecedor_id', v_nao_transp,
    'itens', jsonb_build_array(jsonb_build_object('insumo_id', v_insumo, 'quantidade', 261.072849, 'valor_unitario', 106.73))));
  r := r || jsonb_build_object('8a_item', (select quantidade from public.pedido_material_itens where pedido_id = v_ped));
  begin perform public.fn_pedido_material_salvar(null, jsonb_build_object('data', '2026-09-11', 'fornecedor_id', v_nao_transp,
    'itens', '[]'::jsonb)); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('8b_sem_itens', v_txt);
  reset role;

  -- 9. CONTROLE (b) do plano 4.4: quem só tem frete.ajustes/criar cria o ajuste e o saldo NÃO muda
  insert into public.usuario_permissoes (usuario_id, recurso, acao) values (v_zero, 'frete.ajustes', 'criar'), (v_zero, 'frete.ajustes', 'ver');
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_aj := public.fn_frete_ajuste_salvar(null, jsonb_build_object('transportadora_id', v_a, 'sinal', 'credito', 'valor', 100,
    'data', '2026-09-16 10:00-05', 'descricao', 'PROVA ajuste'));
  begin perform public.fn_frete_ajuste_aprovar(v_aj); v_txt := 'APROVOU (errado)';
  exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('9a_criador_aprova', v_txt);
  reset role;
  r := r || jsonb_build_object('9b_saldo_A_pendente', (select saldo from public.transportadora_saldos where transportadora_id = v_a));

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.fn_frete_ajuste_aprovar(v_aj);
  r := r || jsonb_build_object('9c_saldo_A_aprovado', (select saldo from public.transportadora_saldos where transportadora_id = v_a));
  begin perform public.fn_frete_ajuste_salvar(v_aj, jsonb_build_object('transportadora_id', v_a, 'sinal', 'credito', 'valor', 999,
    'data', '2026-09-16 10:00-05', 'descricao', 'PROVA')); v_txt := 'EDITOU (errado)';
  exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('9d_editar_aprovado', v_txt);
  perform public.fn_frete_ajuste_desaprovar(v_aj, 'PROVA');
  r := r || jsonb_build_object('9e_saldo_A_desaprovado', (select saldo from public.transportadora_saldos where transportadora_id = v_a),
    '9f_status', (select status from public.frete_ajustes where id = v_aj));
  v_aj2 := public.fn_frete_ajuste_salvar(null, jsonb_build_object('transportadora_id', v_a, 'sinal', 'debito', 'valor', 50,
    'data', '2026-09-16 10:00-05', 'descricao', 'PROVA rejeitar'));
  perform public.fn_frete_ajuste_desaprovar(v_aj2, 'PROVA');
  r := r || jsonb_build_object('9g_rejeitado', (select status from public.frete_ajustes where id = v_aj2),
    '9h_movimentos_rejeitado', (select count(*) from public.transportadora_movimentos where origem_id = v_aj2));
  reset role;

  -- 10. RLS: sem o Frete não vê frete, saldo nem extrato e não lança; CONTROLE: o Admin vê
  delete from public.usuario_permissoes where usuario_id = v_zero and recurso like 'frete.%';
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('10a_sem_permissao_fretes', (select count(*) from public.fretes),
    '10b_sem_permissao_movimentos', (select count(*) from public.transportadora_movimentos_detalhe),
    '10c_sem_permissao_saldo_A', (select count(*) from public.transportadora_saldos where saldo <> 0));
  begin perform public.fn_frete_pagamento_salvar(null, jsonb_build_object('data', '2026-09-15', 'transportadora_id', v_a, 'valor', 1,
    'metodo', 'pix', 'responsavel', 'x', 'pago_por', 'x')); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('10d_sem_permissao_paga', v_txt);
  begin insert into public.fretes (data, origem_localidade_id, destino_localidade_id, transportadora_id, motorista, insumo_id,
    peso_toneladas, km_rodados, valor_tkm, valor_total, tipo) values ('2026-09-10', v_la, v_lb, v_a, 'x', v_insumo, 1, 1, 1, 1, 'transferencia');
    v_txt := 'GRAVOU (errado)';
  exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('10e_insert_direto', v_txt);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('10f_CONTROLE_admin_fretes', (select count(*) from public.fretes),
    '10g_CONTROLE_admin_movimentos', (select count(*) from public.transportadora_movimentos_detalhe));
  reset role;

  r := r || jsonb_build_object('11_lancamentos_novos', (select count(*) from public.lancamentos) - v_lanc0);
  raise exception 'PROVA %', r;
end $prova$;
