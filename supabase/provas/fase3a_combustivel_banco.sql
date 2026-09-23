-- Prova da Fase 3 (banco do Combustível). Migrations 20260924100000 e 20260924120000 (igual à origem).
-- NÃO GRAVA: termina em raise exception com as medições.
-- Números esperados calculados à mão, a partir do banco vivo e das telas da origem.

do $prova$
declare
  v_tiago constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_zero constant uuid := 'f155865b-1d4b-4b25-bf3d-54d8de9176b0';
  v_s10 constant uuid := '0d37c4aa-b2e4-417a-9e70-decd327d2631';
  v_s500 constant uuid := '63e45165-9d8f-42ac-b9b1-4913e898bd07';
  v_equip constant uuid := '0084906e-2ecf-43f3-9518-0d8fbab4626c';   -- CS-005, horímetro, com etapa
  v_etapa constant uuid := '728cb732-113c-4f39-a5db-a287abae20fe';
  v_obra constant uuid := 'a39e45c0-aea5-4d98-aebd-814616b8551c';
  v_aloc jsonb := jsonb_build_array(jsonb_build_object('centro_custo_id', 'a39e45c0-aea5-4d98-aebd-814616b8551c', 'percentual', 100));
  v_transp uuid; v_dono uuid; v_forn uuid;
  v_a uuid; v_b uuid; v_x uuid; v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid; v_s5 uuid; v_t uuid;
  v_lanc0 bigint; v_n bigint; v_txt text; r jsonb := '{}'::jsonb;
begin
  select count(*) into v_lanc0 from public.lancamentos;
  select id into v_transp from public.fornecedores where ativo order by razao_social limit 1;
  select id into v_dono from public.fornecedores where ativo and id <> v_transp order by razao_social limit 1;
  v_forn := v_dono;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.tanques (nome, capacidade_litros) values ('PROVA Tanque A', 3000) returning id into v_a;
  insert into public.tanques (nome, capacidade_litros) values ('PROVA Tanque B', 1050) returning id into v_b;
  insert into public.tanques (nome, eh_externo, proprietario_id) values ('PROVA Externo', true, v_dono) returning id into v_x;

  -- 1. Entrada com preço por litro (a tela da origem): 1000 L x R$ 6 e 1000 L x R$ 7,123456789
  --    O total guarda todas as casas (a origem guarda até 12).
  perform public.fn_comb_salvar_entrada(null, v_a, v_s10, 1000, 6, v_forn, 'NF1', '2026-09-01 08:00-05', null);
  perform public.fn_comb_salvar_entrada(null, v_a, v_s10, 1000, 7.123456789, v_forn, 'NF2', '2026-09-02 08:00-05', null);
  r := r || jsonb_build_object('1a_total_da_entrada_sem_arredondar',
    (select valor_total from public.combustivel_entradas where tanque_id = v_a and nota_fiscal = 'NF2'));
  begin perform public.fn_comb_salvar_entrada(null, v_a, v_s10, 10, 6, null, null, '2026-09-01 09:00-05', null); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 40); end;
  r := r || jsonb_build_object('1b_entrada_sem_fornecedor', v_txt);

  -- 2. PEPS do banco: saída de 1500 L = (6000 + 500 x 7,123456789) / 1500 = 6,3744856 -> 6,3745; total 9.561,7284
  v_s1 := public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
    'tanque_id', v_a, 'equipamento_id', v_equip, 'litros', 1500, 'data', '2026-09-03 08:00-05', 'medicao', 1234.5,
    'preco_medio_tanque', 5.5, 'alocacoes', v_aloc));
  select jsonb_build_object('preco', preco_unitario, 'snapshot', preco_medio_tanque, 'valor', valor_total,
         'camadas', (select count(*) from public.combustivel_camadas where saida_id = v_s1), 'centro_e_a_etapa', centro_custo_id = v_etapa)
    into v_txt from public.combustivel_saidas where id = v_s1;
  r := r || jsonb_build_object('2_peps_regrava_o_proprio', v_txt::jsonb);
  r := r || jsonb_build_object('2b_horimetro_virou_medicao',
    (select valor from public.equipamento_medicoes where combustivel_saida_id = v_s1 and origem = 'abastecimento' and excluido_em is null));
  begin perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
      'tanque_id', v_a, 'equipamento_id', v_equip, 'litros', 10, 'data', '2026-09-03 09:00-05')); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 45); end;
  r := r || jsonb_build_object('2c_saida_sem_obra', v_txt);

  -- 3. Carreta em tanque da EMT: o preço é o digitado (a tela sugere o PEPS do TS); sem preço, recusa.
  begin perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'carreta_transportadora',
      'tanque_id', v_a, 'transportadora_id', v_transp, 'litros', 200, 'data', '2026-09-04 08:00-05', 'alocacoes', v_aloc)); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 40); end;
  r := r || jsonb_build_object('3a_carreta_sem_preco', v_txt);
  v_s2 := public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'carreta_transportadora',
    'tanque_id', v_a, 'transportadora_id', v_transp, 'placa', 'PRV1A23', 'litros', 200, 'preco_combustivel', 7.1235, 'taxa_litro', 0.30,
    'preco_medio_tanque', 7.123456789, 'data', '2026-09-04 08:00-05', 'alocacoes', v_aloc));
  select jsonb_build_object('preco', preco_combustivel, 'unitario', preco_unitario, 'valor', valor_total, 'snapshot', preco_medio_tanque)
    into v_txt from public.combustivel_saidas where id = v_s2;
  r := r || jsonb_build_object('3b_carreta_emt', v_txt::jsonb);   -- 200 x (7,1235 + 0,30) = 1.484,70
  r := r || jsonb_build_object('3c_debito_emt', (select jsonb_agg(jsonb_build_object('tipo', tipo, 'valor', valor))
    from public.transportadora_movimentos where origem_id = v_s2));

  -- 4. Tanque externo: débito 100 x (6,10 + 0,30) = 640; crédito do dono 100 x (5,80 + 0,30) = 610
  v_s3 := public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'carreta_transportadora',
    'tanque_id', v_x, 'transportadora_id', v_transp, 'insumo_id', v_s10, 'litros', 100, 'preco_combustivel', 6.10,
    'preco_proprietario', 5.80, 'taxa_litro', 0.30, 'data', '2026-09-04 09:00-05', 'alocacoes', v_aloc));
  r := r || jsonb_build_object('4_externo', (select jsonb_agg(jsonb_build_object('tipo', tipo, 'valor', valor,
    'quem', case when transportadora_id = v_dono then 'dono' when transportadora_id = v_transp then 'transportadora' end) order by tipo)
    from public.transportadora_movimentos where origem_id = v_s3));
  -- Na origem o banco não barra equipamento próprio em tanque externo (quem esconde é a tela).
  begin perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
      'tanque_id', v_x, 'equipamento_id', v_equip, 'insumo_id', v_s10, 'litros', 1, 'preco_medio_tanque', 6, 'data', '2026-09-04 10:00-05',
      'alocacoes', v_aloc)); v_txt := 'aceitou (como a origem)';
  exception when others then v_txt := 'RECUSOU (diferente da origem): ' || left(sqlerrm, 40); end;
  r := r || jsonb_build_object('4b_proprio_em_externo_no_banco', v_txt);

  -- 5. Travas iguais à origem
  begin perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
      'tanque_id', v_a, 'equipamento_id', v_equip, 'litros', 400, 'data', '2026-09-05 08:00-05', 'alocacoes', v_aloc)); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 50); end;
  r := r || jsonb_build_object('5a_saida_maior_que_o_saldo', v_txt);
  begin perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
      'tanque_id', v_a, 'equipamento_id', v_equip, 'litros', 350, 'data', '2026-09-03 12:00-05', 'alocacoes', v_aloc)); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 50); end;
  r := r || jsonb_build_object('5b_saldo_negativo_no_passado', v_txt);
  begin perform public.fn_comb_salvar_entrada(null, v_a, v_s500, 100, 6, v_forn, null, '2026-09-05 08:00-05', null); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 50); end;
  r := r || jsonb_build_object('5c_mistura_de_combustivel', v_txt);
  begin perform public.fn_comb_salvar_entrada(null, v_x, v_s10, 100, 6, v_forn, null, '2026-09-05 08:00-05', null); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 50); end;
  r := r || jsonb_build_object('5d_entrada_em_externo', v_txt);
  begin perform public.fn_comb_salvar_entrada(null, v_a, v_s10, 2800, 6, v_forn, null, '2026-09-05 08:00-05', null); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 50); end;
  r := r || jsonb_build_object('5e_passa_da_capacidade', v_txt);
  begin perform public.fn_comb_salvar_entrada(null, v_a, v_s10, 10, 6, v_forn, null, now() + interval '27 hours', null); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 50); end;
  r := r || jsonb_build_object('5f_data_27h_no_futuro', v_txt);
  begin perform public.fn_comb_salvar_entrada(null, v_b, v_s10, 1, 6, v_forn, null, now() + interval '25 hours', null); v_txt := 'aceitou (como a origem: folga de SP + 24 h)';
  exception when others then v_txt := 'RECUSOU (diferente da origem): ' || left(sqlerrm, 40); end;
  r := r || jsonb_build_object('5g_data_25h_no_futuro', v_txt);

  -- 6. Transferência: litros x preço médio da VIDA do tanque (sem corte de data), 4 casas.
  --    Médio de A = (6000 + 7123,456789) / 2000 = 6,5617283945; 100 L = 656,1728
  v_t := public.fn_comb_salvar_transferencia(null, v_a, v_b, 100, '2026-09-05 08:00-05', null);
  r := r || jsonb_build_object('6a_transferencia_valor', (select valor_total from public.combustivel_transferencias where id = v_t));
  perform public.fn_comb_salvar_transferencia(v_t, v_a, v_b, 100, '2026-09-05 08:00-05', 'editada');
  r := r || jsonb_build_object('6b_edicao_mantem_o_valor', (select valor_total from public.combustivel_transferencias where id = v_t));
  -- B tem 1050 de capacidade e já tem 1 + 100 L: 1000 L não cabem na data
  begin perform public.fn_comb_salvar_transferencia(null, v_a, v_b, 1000, '2026-09-05 09:00-05', null); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 45); end;
  r := r || jsonb_build_object('6c_nao_cabe_no_destino_na_data', v_txt);
  -- Transferência de saída não consome camada: a próxima saída de A ainda paga a camada 2 (R$ 7,123456789)
  v_s4 := public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
    'tanque_id', v_a, 'equipamento_id', v_equip, 'litros', 150, 'data', '2026-09-06 08:00-05', 'alocacoes', v_aloc));
  r := r || jsonb_build_object('6d_saida_depois_da_transferencia_preco', (select preco_unitario from public.combustivel_saidas where id = v_s4));

  -- 7. Esvaziamento: descarta o nível inteiro, agora; sem trava de ciclo (a origem não tem)
  perform public.fn_comb_registrar_esvaziamento(v_a, 'PROVA');
  r := r || jsonb_build_object('7a_esvaziamento_levou_o_nivel', (select litros from public.combustivel_esvaziamentos where tanque_id = v_a));
  r := r || jsonb_build_object('7b_nivel_depois', (select nivel_atual_litros from public.tanques where id = v_a));
  begin perform public.fn_comb_registrar_esvaziamento(v_a, 'PROVA'); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 40); end;
  r := r || jsonb_build_object('7c_esvaziar_vazio', v_txt);

  -- 8. Ciclo fechado depois de reabastecer do vazio: a saída do dia 3 tranca. O reabastecimento vem
  --    DEPOIS do esvaziamento (que é agora): só assim o tanque recomeça do vazio.
  perform public.fn_comb_salvar_entrada(null, v_a, v_s500, 500, 6, v_forn, null, now() + interval '1 minute', null);
  begin perform public.fn_comb_excluir('combustivel_saidas', v_s1, 'PROVA'); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 50); end;
  r := r || jsonb_build_object('8_excluir_em_ciclo_fechado', v_txt);

  -- 9. Excluir e restaurar a carreta do externo: os movimentos somem e voltam
  perform public.fn_comb_excluir('combustivel_saidas', v_s3, 'PROVA');
  r := r || jsonb_build_object('9a_movimentos_depois_de_excluir', (select count(*) from public.transportadora_movimentos where origem_id = v_s3));
  perform public.fn_comb_restaurar('combustivel_saidas', v_s3);
  r := r || jsonb_build_object('9b_movimentos_depois_de_restaurar', (select count(*) from public.transportadora_movimentos where origem_id = v_s3));

  -- 10. Atribuir equipamento em lote: só a saída de equipamento próprio (s1) muda; a carreta (s3) não
  r := r || jsonb_build_object('10_atribuidas', public.fn_comb_atribuir_equipamento(array[v_s1, v_s3], v_equip));
  reset role;

  -- 11. RLS: a conta sem permissão não vê tanque nem lança; CONTROLE: o Admin vê os 3
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.tanques where nome like 'PROVA%';
  r := r || jsonb_build_object('11a_sem_permissao_ve_tanques', v_n);
  begin perform public.fn_comb_salvar_entrada(null, v_b, v_s10, 10, 6, v_forn, null, '2026-09-09 08:00-05', null); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 40); end;
  r := r || jsonb_build_object('11b_sem_permissao_lanca', v_txt);
  begin insert into public.combustivel_entradas (tanque_id, insumo_id, quantidade, litros, valor_total, data_hora)
        values (v_b, v_s10, 1, 1, 1, now()); v_txt := 'GRAVOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 40); end;
  r := r || jsonb_build_object('11c_insert_direto', v_txt);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.tanques where nome like 'PROVA%';
  r := r || jsonb_build_object('11d_CONTROLE_admin_ve_tanques', v_n);
  reset role;

  r := r || jsonb_build_object('12_lancamentos_novos', (select count(*) from public.lancamentos) - v_lanc0);
  raise exception 'PROVA %', r;
end $prova$;
