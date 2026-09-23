-- Prova da Fase 3a (banco do Combustível). Migration 20260924100000.
-- NÃO GRAVA: termina em raise exception com as medições.
-- Números esperados calculados à mão, a partir do algoritmo do banco da origem.

do $prova$
declare
  v_tiago constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_zero constant uuid := 'f155865b-1d4b-4b25-bf3d-54d8de9176b0';
  v_s10 constant uuid := '0d37c4aa-b2e4-417a-9e70-decd327d2631';
  v_s500 constant uuid := '63e45165-9d8f-42ac-b9b1-4913e898bd07';
  v_equip constant uuid := '0084906e-2ecf-43f3-9518-0d8fbab4626c';   -- CS-005, horímetro, com etapa
  v_etapa constant uuid := '728cb732-113c-4f39-a5db-a287abae20fe';
  v_transp uuid; v_dono uuid;
  v_a uuid; v_b uuid; v_x uuid; v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid; v_t uuid;
  v_lanc0 bigint; v_n bigint; v_v numeric; v_txt text; r jsonb := '{}'::jsonb;
begin
  select count(*) into v_lanc0 from public.lancamentos;
  select id into v_transp from public.fornecedores where ativo order by razao_social limit 1;
  select id into v_dono from public.fornecedores where ativo and id <> v_transp order by razao_social limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.tanques (nome, capacidade_litros) values ('PROVA Tanque A', 3000) returning id into v_a;
  insert into public.tanques (nome, capacidade_litros) values ('PROVA Tanque B', 5000) returning id into v_b;
  insert into public.tanques (nome, eh_externo, proprietario_id) values ('PROVA Externo', true, v_dono) returning id into v_x;

  -- 1. PEPS: 1000 L a R$ 6 e 1000 L a R$ 7; saída de 1500 L = (6000 + 3500) / 1500 = 6,3333, total 9.500
  perform public.fn_comb_salvar_entrada(null, v_a, v_s10, 1000, 6000, null, 'NF1', '2026-09-01 08:00-05', null);
  perform public.fn_comb_salvar_entrada(null, v_a, v_s10, 1000, 7000, null, 'NF2', '2026-09-02 08:00-05', null);
  v_s1 := public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
    'tanque_id', v_a, 'equipamento_id', v_equip, 'litros', 1500, 'data', '2026-09-03 08:00-05', 'medicao', 1234.5));
  select jsonb_build_object('preco', preco_unitario, 'valor', valor_total, 'camadas', (select count(*) from public.combustivel_camadas where saida_id = v_s1),
         'centro_e_a_etapa', centro_custo_id = v_etapa) into v_txt from public.combustivel_saidas where id = v_s1;
  r := r || jsonb_build_object('1_peps_1500L', v_txt::jsonb);
  r := r || jsonb_build_object('1b_nivel_tanque_a', (select nivel_atual_litros from public.tanques where id = v_a));
  r := r || jsonb_build_object('1c_horimetro_virou_medicao',
    (select valor from public.equipamento_medicoes where combustivel_saida_id = v_s1 and origem = 'abastecimento' and excluido_em is null));

  -- 2. Carreta em tanque da EMT sem preço: 200 L da camada de R$ 7 + 0,30 de taxa = 1.460; débito EMT igual
  v_s2 := public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'carreta_transportadora',
    'tanque_id', v_a, 'transportadora_id', v_transp, 'placa', 'PRV1A23', 'litros', 200, 'taxa_litro', 0.30, 'data', '2026-09-04 08:00-05'));
  select jsonb_build_object('preco', preco_combustivel, 'valor', valor_total) into v_txt from public.combustivel_saidas where id = v_s2;
  r := r || jsonb_build_object('2_carreta_emt', v_txt::jsonb);
  r := r || jsonb_build_object('2b_movimentos', (select jsonb_agg(jsonb_build_object('tipo', tipo, 'valor', valor, 'e_da_transportadora', transportadora_id = v_transp))
    from public.transportadora_movimentos where origem_id = v_s2));

  -- 3. Tanque externo: 100 L, R$ 6,10 da transportadora, R$ 5,80 do dono, 0,30 de taxa
  --    débito = 100 x (6,10 + 0,30) = 640; crédito do dono = 100 x (5,80 + 0,30) = 610
  v_s3 := public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'carreta_transportadora',
    'tanque_id', v_x, 'transportadora_id', v_transp, 'insumo_id', v_s10, 'litros', 100, 'preco_combustivel', 6.10,
    'preco_proprietario', 5.80, 'taxa_litro', 0.30, 'data', '2026-09-04 09:00-05'));
  r := r || jsonb_build_object('3_externo', (select jsonb_agg(jsonb_build_object('tipo', tipo, 'valor', valor,
    'quem', case when transportadora_id = v_dono then 'dono' when transportadora_id = v_transp then 'transportadora' end) order by tipo)
    from public.transportadora_movimentos where origem_id = v_s3));
  r := r || jsonb_build_object('3b_externo_sem_camada', (select count(*) from public.combustivel_camadas where saida_id = v_s3));

  -- 4. Travas
  begin perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
      'tanque_id', v_a, 'equipamento_id', v_equip, 'litros', 400, 'data', '2026-09-05 08:00-05')); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 50); end;
  r := r || jsonb_build_object('4a_saida_maior_que_o_saldo', v_txt);
  -- 350 L cabem no dia 3 às 12h (sobram 500), mas deixam o dia 4 negativo (500 - 350 - 200 = -50)
  begin perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
      'tanque_id', v_a, 'equipamento_id', v_equip, 'litros', 350, 'data', '2026-09-03 12:00-05')); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 50); end;
  r := r || jsonb_build_object('4b_saldo_negativo_no_passado', v_txt);
  begin perform public.fn_comb_salvar_entrada(null, v_a, v_s500, 100, 600, null, null, '2026-09-05 08:00-05', null); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 50); end;
  r := r || jsonb_build_object('4c_mistura_de_combustivel', v_txt);
  begin perform public.fn_comb_salvar_entrada(null, v_x, v_s10, 100, 600, null, null, '2026-09-05 08:00-05', null); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 50); end;
  r := r || jsonb_build_object('4d_entrada_em_externo', v_txt);
  begin perform public.fn_comb_salvar_entrada(null, v_a, v_s10, 2800, 16800, null, null, '2026-09-05 08:00-05', null); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 50); end;
  r := r || jsonb_build_object('4e_passa_da_capacidade', v_txt);
  begin perform public.fn_comb_salvar_entrada(null, v_a, v_s10, 10, 60, null, null, now() + interval '3 days', null); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 50); end;
  r := r || jsonb_build_object('4f_data_no_futuro', v_txt);

  -- 5. Transferência de saída NÃO consome camada (igual à origem): A manda 100 L para B, e a
  --    próxima saída de A ainda paga R$ 7 (a camada 2 tinha 300 L e continua com 300).
  v_t := public.fn_comb_salvar_transferencia(null, v_a, v_b, 100, '2026-09-05 08:00-05', null);
  r := r || jsonb_build_object('5a_transferencia_valor', (select valor_total from public.combustivel_transferencias where id = v_t));
  v_s4 := public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
    'tanque_id', v_a, 'equipamento_id', v_equip, 'litros', 150, 'data', '2026-09-06 08:00-05'));
  r := r || jsonb_build_object('5b_saida_depois_da_transferencia_preco', (select preco_unitario from public.combustivel_saidas where id = v_s4));
  r := r || jsonb_build_object('5c_nivel_a_e_b', jsonb_build_array((select nivel_atual_litros from public.tanques where id = v_a),
    (select nivel_atual_litros from public.tanques where id = v_b)));

  -- 6. Ciclo fechado: esvaziar A (50 L que sobram) e reabastecer; a saída do dia 3 tranca
  perform public.fn_comb_registrar_esvaziamento(v_a, 50, 'PROVA', '2026-09-07 08:00-05');
  perform public.fn_comb_salvar_entrada(null, v_a, v_s500, 500, 3000, null, null, '2026-09-08 08:00-05', null);
  r := r || jsonb_build_object('6a_tanque_trocou_de_combustivel', (select combustivel_atual_id = v_s500 from public.tanques where id = v_a));
  begin perform public.fn_comb_excluir('combustivel_saidas', v_s1, 'PROVA'); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 50); end;
  r := r || jsonb_build_object('6b_excluir_em_ciclo_fechado', v_txt);

  -- 7. Excluir a carreta do externo (ciclo não tranca externo): os movimentos somem
  perform public.fn_comb_excluir('combustivel_saidas', v_s3, 'PROVA');
  r := r || jsonb_build_object('7_movimentos_depois_de_excluir', (select count(*) from public.transportadora_movimentos where origem_id = v_s3));
  reset role;

  -- 8. RLS: a conta sem permissão não vê tanque nem lança; CONTROLE: o Admin vê os 3
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.tanques where nome like 'PROVA%';
  r := r || jsonb_build_object('8a_sem_permissao_ve_tanques', v_n);
  begin perform public.fn_comb_salvar_entrada(null, v_b, v_s10, 10, 60, null, null, '2026-09-09 08:00-05', null); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 40); end;
  r := r || jsonb_build_object('8b_sem_permissao_lanca', v_txt);
  begin insert into public.combustivel_entradas (tanque_id, insumo_id, quantidade, litros, valor_total, data_hora)
        values (v_b, v_s10, 1, 1, 1, now()); v_txt := 'GRAVOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 40); end;
  r := r || jsonb_build_object('8c_insert_direto', v_txt);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.tanques where nome like 'PROVA%';
  r := r || jsonb_build_object('8d_CONTROLE_admin_ve_tanques', v_n);
  reset role;

  -- 9. PROVA NEGATIVA: nada disso gerou lançamento
  r := r || jsonb_build_object('9_lancamentos_novos', (select count(*) from public.lancamentos) - v_lanc0);
  raise exception 'PROVA %', r;
end $prova$;
