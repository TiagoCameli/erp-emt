-- Prova do odômetro/horímetro no abastecimento e dos trechos de consumo.
-- Migration 20261127120000_combustivel_odometro_consumo.
-- NÃO GRAVA: termina em raise exception com as medições (o bloco inteiro desfaz).
-- Datas de jan/2025, antes de qualquer abastecimento real, para não cruzar com a frota de verdade.
-- Números esperados calculados à mão na spec (vault: projects/erp-emt/spec-odometro-consumo).

do $prova$
declare
  v_tiago constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_zero constant uuid := 'f155865b-1d4b-4b25-bf3d-54d8de9176b0';     -- usuário sem permissão
  v_s10 constant uuid := '0d37c4aa-b2e4-417a-9e70-decd327d2631';
  v_emt constant uuid := 'c52b7dd3-1e61-46e7-b7f5-05c402474aea';      -- EMT TRANSPORTES
  v_areacre constant uuid := '783c2db2-c6bc-40a5-8a7a-eea9e2f17e84';  -- transportadora de terceiro
  v_cs005 constant uuid := '0084906e-2ecf-43f3-9518-0d8fbab4626c';    -- cavalo SQU9D14
  v_aloc jsonb := jsonb_build_array(jsonb_build_object('centro_custo_id', 'a39e45c0-aea5-4d98-aebd-814616b8551c', 'percentual', 100));
  v_tanque uuid; v_carro uuid; v_maq uuid; v_maqkm uuid; v_forn uuid;
  v_s uuid; v_c1 uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid; v_c5 uuid; v_c6 uuid; v_m2 uuid; v_cv uuid;
  v_lanc0 bigint; v_txt text; v_n bigint; v_a numeric; v_b numeric; r jsonb := '{}'::jsonb;

begin
  select count(*) into v_lanc0 from public.lancamentos;
  select id into v_forn from public.fornecedores where ativo order by razao_social limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);

  insert into public.equipamentos (descricao, tipo, controle_por, propriedade, classe_consumo)
  values ('PROVA Carro', 'Carro', 'km', 'propria', 'veiculo_leve') returning id into v_carro;
  insert into public.equipamentos (descricao, tipo, controle_por, propriedade, classe_consumo)
  values ('PROVA Escavadeira', 'Escavadeira', 'horimetro', 'propria', 'maquina') returning id into v_maq;
  insert into public.equipamentos (descricao, tipo, controle_por, propriedade, classe_consumo)
  values ('PROVA Basculante km', 'Caminhão Basculante', 'km', 'propria', 'maquina') returning id into v_maqkm;

  set local role authenticated;

  insert into public.tanques (nome, capacidade_litros) values ('PROVA Tanque Odômetro', 20000) returning id into v_tanque;
  perform public.fn_comb_salvar_entrada(null, v_tanque, v_s10, 10000, 6, v_forn, 'NF-PROVA', '2024-12-31 08:00-05', null);

  -- 1. Leitura normal: carro 10.000 -> 10.500 (40 L) -> 11.100 (60 L).
  v_c1 := public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
    'tanque_id', v_tanque, 'equipamento_id', v_carro, 'litros', 50, 'data', '2025-01-01 08:00-05', 'odometro_km', 10000, 'alocacoes', v_aloc));
  v_c2 := public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
    'tanque_id', v_tanque, 'equipamento_id', v_carro, 'litros', 40, 'data', '2025-01-03 08:00-05', 'odometro_km', 10500, 'alocacoes', v_aloc));
  v_c3 := public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
    'tanque_id', v_tanque, 'equipamento_id', v_carro, 'litros', 60, 'data', '2025-01-05 08:00-05', 'odometro_km', 11100, 'alocacoes', v_aloc));
  r := r || jsonb_build_object('1_trechos_normais_km_e_litros', (select jsonb_agg(jsonb_build_array(km_trecho, litros_km) order by data)
    from public.fn_comb_consumo_trechos('2025-01-01', '2025-02-01', 'eq:' || v_carro)));
  r := r || jsonb_build_object('1b_leitura_virou_medicao_do_equipamento',
    (select count(*) from public.equipamento_medicoes where equipamento_id = v_carro and tipo = 'km' and origem = 'abastecimento' and excluido_em is null));
  r := r || jsonb_build_object('1c_medicao_legada_derivada', (select jsonb_build_array(medicao, tipo_medicao) from public.combustivel_saidas where id = v_c3));
  r := r || jsonb_build_object('1d_ultima_leitura_com_data', (select jsonb_agg(jsonb_build_array(tipo, valor, to_char(data at time zone 'America/Rio_Branco', 'DD/MM/YYYY')))
    from public.fn_comb_ultima_leitura(v_carro)));

  -- 2. Leitura menor que a anterior: recusada. Maior que a seguinte (edição retroativa): recusada.
  begin
    perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
      'tanque_id', v_tanque, 'equipamento_id', v_carro, 'litros', 10, 'data', '2025-01-06 08:00-05', 'odometro_km', 11000, 'alocacoes', v_aloc));
    v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 60); end;
  r := r || jsonb_build_object('2a_leitura_menor', v_txt);
  begin
    perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
      'tanque_id', v_tanque, 'equipamento_id', v_carro, 'litros', 10, 'data', '2025-01-04 08:00-05', 'odometro_km', 12000, 'alocacoes', v_aloc));
    v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 60); end;
  r := r || jsonb_build_object('2b_retroativa_maior_que_a_seguinte', v_txt);

  -- 3. Virada: sem motivo recusa; com motivo aceita e o trecho até ela fica fora.
  begin
    perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
      'tanque_id', v_tanque, 'equipamento_id', v_carro, 'litros', 30, 'data', '2025-01-07 08:00-05', 'odometro_km', 50,
      'virada', true, 'alocacoes', v_aloc));
    v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 60); end;
  r := r || jsonb_build_object('3a_virada_sem_motivo', v_txt);
  v_c4 := public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
    'tanque_id', v_tanque, 'equipamento_id', v_carro, 'litros', 30, 'data', '2025-01-07 08:00-05', 'odometro_km', 50,
    'virada', true, 'motivo_virada', 'Troca do painel na oficina', 'alocacoes', v_aloc));
  v_c5 := public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
    'tanque_id', v_tanque, 'equipamento_id', v_carro, 'litros', 40, 'data', '2025-01-09 08:00-05', 'odometro_km', 450, 'alocacoes', v_aloc));
  r := r || jsonb_build_object('3b_trecho_da_virada_e_o_seguinte', (select jsonb_build_array(
      (select km_trecho from public.fn_comb_consumo_trechos('2025-01-01', '2025-02-01', 'eq:' || v_carro) where saida_id = v_c4),
      (select km_trecho from public.fn_comb_consumo_trechos('2025-01-01', '2025-02-01', 'eq:' || v_carro) where saida_id = v_c5))));
  r := r || jsonb_build_object('3c_medicao_marca_reinicio',
    (select reinicia_contagem from public.equipamento_medicoes where combustivel_saida_id = v_c4 and tipo = 'km'));

  -- 4. Salto: 450 -> 2.000 km em 1 dia (> 800 do veículo leve) grava, e o trecho vem marcado.
  v_c6 := public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
    'tanque_id', v_tanque, 'equipamento_id', v_carro, 'litros', 20, 'data', '2025-01-10 08:00-05', 'odometro_km', 2000, 'alocacoes', v_aloc));
  r := r || jsonb_build_object('4_salto_grava_e_marca', (select jsonb_build_array(km_trecho, dias_km, salto_km)
    from public.fn_comb_consumo_trechos('2025-01-01', '2025-02-01', 'eq:' || v_carro) where saida_id = v_c6));

  -- 5. Sem leitura (máquina não trava): vale para estoque/PEPS, fica fora do consumo e quebra o trecho.
  perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
    'tanque_id', v_tanque, 'equipamento_id', v_maq, 'litros', 30, 'data', '2025-01-01 09:00-05', 'horimetro_h', 100, 'alocacoes', v_aloc));
  v_m2 := public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
    'tanque_id', v_tanque, 'equipamento_id', v_maq, 'litros', 20, 'data', '2025-01-02 09:00-05', 'alocacoes', v_aloc));
  perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
    'tanque_id', v_tanque, 'equipamento_id', v_maq, 'litros', 25, 'data', '2025-01-03 09:00-05', 'horimetro_h', 120, 'alocacoes', v_aloc));
  perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
    'tanque_id', v_tanque, 'equipamento_id', v_maq, 'litros', 50, 'data', '2025-01-04 09:00-05', 'horimetro_h', 130, 'alocacoes', v_aloc));
  r := r || jsonb_build_object('5a_sem_leitura_tem_valor_e_camada', (select jsonb_build_array(valor_total,
      (select count(*) from public.combustivel_camadas where saida_id = v_m2)) from public.combustivel_saidas where id = v_m2));
  r := r || jsonb_build_object('5b_maquina_h_e_litros_por_trecho', (select jsonb_agg(jsonb_build_array(h_trecho, litros_h) order by data)
    from public.fn_comb_consumo_trechos('2025-01-01', '2025-02-01', 'eq:' || v_maq)));
  begin
    perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
      'tanque_id', v_tanque, 'equipamento_id', v_carro, 'litros', 10, 'data', '2025-01-11 08:00-05', 'alocacoes', v_aloc));
    v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 60); end;
  r := r || jsonb_build_object('5c_carro_sem_km', v_txt);

  -- 6. Primeiro abastecimento do período só marca o início: janela a partir de 04/01 descarta o 10.500 -> 11.100.
  r := r || jsonb_build_object('6_periodo_descarta_o_primeiro', (select jsonb_build_array(
      (select km_trecho from public.fn_comb_consumo_trechos('2025-01-01', '2025-02-01', 'eq:' || v_carro) where saida_id = v_c3),
      (select km_trecho from public.fn_comb_consumo_trechos('2025-01-04', '2025-02-01', 'eq:' || v_carro) where saida_id = v_c3))));

  -- 7. Carreta de terceiro pela placa e máquina pelo cadastro: mesmos números, mesmo L/km.
  perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'carreta_transportadora',
    'tanque_id', v_tanque, 'transportadora_id', v_areacre, 'placa', 'prv-0a00', 'preco_combustivel', 6, 'litros', 50,
    'data', '2025-01-01 10:00-05', 'odometro_km', 1000, 'alocacoes', v_aloc));
  perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'carreta_transportadora',
    'tanque_id', v_tanque, 'transportadora_id', v_areacre, 'placa', 'PRV0A00', 'preco_combustivel', 6, 'litros', 40,
    'data', '2025-01-02 10:00-05', 'odometro_km', 1400, 'alocacoes', v_aloc));
  perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
    'tanque_id', v_tanque, 'equipamento_id', v_maqkm, 'litros', 50, 'data', '2025-01-01 11:00-05', 'odometro_km', 1000, 'alocacoes', v_aloc));
  perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'equipamento_proprio',
    'tanque_id', v_tanque, 'equipamento_id', v_maqkm, 'litros', 40, 'data', '2025-01-02 11:00-05', 'odometro_km', 1400, 'alocacoes', v_aloc));
  select sum(litros_km) / sum(km_trecho) into v_a from public.fn_comb_consumo_trechos('2025-01-01', '2025-02-01', 'pl:' || v_areacre || ':PRV0A00');
  select sum(litros_km) / sum(km_trecho) into v_b from public.fn_comb_consumo_trechos('2025-01-01', '2025-02-01', 'eq:' || v_maqkm);
  r := r || jsonb_build_object('7_placa_e_cadastro_mesmo_l_km', jsonb_build_array(v_a, v_b, v_a = v_b));

  -- 8. Cavalo da EMT: placa digitada de qualquer jeito acha o CS-005; dinheiro igual ao de antes.
  begin
    perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'carreta_transportadora',
      'tanque_id', v_tanque, 'transportadora_id', v_emt, 'placa', 'squ-9d14', 'preco_combustivel', 6, 'taxa_litro', 0.30,
      'litros', 100, 'data', '2025-01-01 12:00-05', 'alocacoes', v_aloc));
    v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 60); end;
  r := r || jsonb_build_object('8a_cavalo_sem_km', v_txt);
  begin
    perform public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'carreta_transportadora',
      'tanque_id', v_tanque, 'transportadora_id', v_emt, 'placa', 'ABC1234', 'preco_combustivel', 6, 'taxa_litro', 0.30,
      'litros', 100, 'data', '2025-01-01 12:00-05', 'odometro_km', 5000, 'alocacoes', v_aloc));
    v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 60); end;
  r := r || jsonb_build_object('8b_placa_que_nao_e_cavalo', v_txt);
  v_cv := public.fn_comb_salvar_saida(null, jsonb_build_object('origem', 'tanque', 'tipo_consumidor', 'carreta_transportadora',
    'tanque_id', v_tanque, 'transportadora_id', v_emt, 'placa', 'squ-9d14', 'preco_combustivel', 6, 'taxa_litro', 0.30,
    'litros', 100, 'data', '2025-01-01 12:00-05', 'odometro_km', 5000, 'alocacoes', v_aloc));
  r := r || jsonb_build_object('8c_cavalo_placa_equipamento_tipo_centro', (select jsonb_build_array(placa, equipamento_id = v_cs005,
      tipo_consumidor, centro_custo_id) from public.combustivel_saidas where id = v_cv));
  -- 100 L x (6 + 0,30) = 630,00 no valor e no débito da conta corrente da EMT TRANSPORTES (igual à fase3a).
  r := r || jsonb_build_object('8d_valor_e_conta_corrente_630', (select jsonb_build_array(s.valor_total,
      (select sum(valor) from public.transportadora_movimentos where origem_tabela = 'combustivel_saidas' and origem_id = s.id)))
      from public.combustivel_saidas s where s.id = v_cv);
  r := r || jsonb_build_object('8e_cavalo_ganhou_leitura_km',
    (select valor from public.equipamento_medicoes where combustivel_saida_id = v_cv and tipo = 'km' and excluido_em is null));
  r := r || jsonb_build_object('8f_carga_cavalos_ligados', (select count(*) from public.combustivel_saidas
    where transportadora_id = v_emt and equipamento_id is not null and excluido_em is null and data >= '2025-06-01'));
  r := r || jsonb_build_object('8g_terceiro_sem_km_passa', (select count(*) from public.combustivel_saidas where transportadora_id = v_areacre and odometro_km is null) > 0);

  -- 9. Atribuição em lote com leitura por abastecimento (aplica na ordem da data).
  r := r || jsonb_build_object('9_lote_com_leitura', public.fn_comb_atribuir_equipamento(array[v_m2], v_maq,
    jsonb_build_array(jsonb_build_object('saida_id', v_m2, 'horimetro_h', 110))));
  r := r || jsonb_build_object('9b_trecho_agora_inteiro', (select jsonb_agg(h_trecho order by data)
    from public.fn_comb_consumo_trechos('2025-01-01', '2025-02-01', 'eq:' || v_maq)));

  -- 10. RLS: quem não tem permissão não lê trecho nem leitura.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform * from public.fn_comb_consumo_trechos('2025-01-01', '2025-02-01'); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 40); end;
  r := r || jsonb_build_object('10a_trechos_sem_permissao', v_txt);
  begin perform * from public.fn_comb_ultima_leitura(v_carro); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 40); end;
  r := r || jsonb_build_object('10b_ultima_leitura_sem_permissao', v_txt);
  select count(*) into v_n from public.combustivel_saidas;
  r := r || jsonb_build_object('10c_saidas_visiveis_sem_permissao', v_n);
  reset role;

  -- 11. Nenhum lançamento no Financeiro.
  r := r || jsonb_build_object('11_lancamentos_novos', (select count(*) from public.lancamentos) - v_lanc0);

  raise exception 'PROVA %', r;
end $prova$;
