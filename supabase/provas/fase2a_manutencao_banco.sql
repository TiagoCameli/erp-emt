-- Prova da Fase 2a (banco da Manutenção). Migration 20260923100000.
-- NÃO GRAVA: termina em raise exception com as medições, e um segundo bloco aborta sempre.
-- Rodar pelo execute_sql no projeto vsesgvqjgqpapoxhnbqx.

do $prova$
declare
  v_tiago constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_andreia constant uuid := '7d0194c2-fd7e-41d1-b6c4-f05c0a652229';
  v_forn constant uuid := '199e9f13-5e76-4c07-b54e-27fdf857f39c';
  v_obra009 constant uuid := 'fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0';
  v_dep uuid; v_tipo uuid; v_peca uuid; v_oleo uuid; v_equip uuid; v_alug uuid; v_etapa uuid;
  v_os uuid; v_os2 uuid; v_l1 uuid; v_l2 uuid; v_ter uuid; v_ent uuid; v_m1 uuid; v_m2 uuid; v_cli uuid := gen_random_uuid();
  v_lanc0 bigint; v_n int; v_txt text; r jsonb := '{}'::jsonb;
  function_ok boolean;
begin
  select count(*) into v_lanc0 from public.lancamentos;

  -- cenário (como postgres)
  insert into public.almoxarifado_depositos (nome) values ('PROVA Almox') returning id into v_dep;
  insert into public.tipos_oleo (nome, aplicacao) values ('PROVA 15W40', 'motor') returning id into v_tipo;
  select id into v_peca from public.insumos where ativo order by created_at limit 1;
  select id into v_oleo from public.insumos where ativo and id <> v_peca order by created_at limit 1;
  select e.id, c.id into v_equip, v_etapa from public.equipamentos e join public.centros_custo c on c.equipamento_id = e.id
   where e.propriedade = 'propria' and e.ativo and e.status = 'ativa' limit 1;
  select id into v_alug from public.equipamentos where propriedade = 'alugada' and ativo limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. entrada de NF com 2 linhas da mesma peça: custo médio = (50 + 70) / 20 = 6
  perform public.fn_almox_registrar_entrada(v_dep, v_forn, 'NF 1', current_date,
    jsonb_build_array(jsonb_build_object('insumo_id', v_peca, 'quantidade', 10, 'valor_unitario', 5),
                      jsonb_build_object('insumo_id', v_peca, 'quantidade', 10, 'valor_unitario', 7),
                      jsonb_build_object('insumo_id', v_oleo, 'quantidade', 100, 'valor_unitario', 19.9834)));
  select id into v_ent from public.almoxarifado_entradas where deposito_id = v_dep and insumo_id = v_peca and valor_unitario = 5;
  r := r || jsonb_build_object('01_saldo_e_custo_medio',
    (select saldo || ' @ ' || round(custo_medio, 4) from public.almoxarifado_saldos where deposito_id = v_dep and insumo_id = v_peca));

  -- 2. OS aberta no equipamento próprio vai para a etapa dele
  v_os := public.fn_os_salvar(null, v_equip, null, 'corretiva', 'alta', 'PROVA troca de filtro', null, null, null, current_date, 1500);
  r := r || jsonb_build_object('02_os_aberta_na_etapa',
    (select status || ' ' || (centro_custo_id = v_etapa)::text || ' ' || numero from public.ordens_servico where id = v_os));

  -- 3. peça: custo congelado no custo médio
  v_l1 := public.fn_os_adicionar_peca(v_os, v_peca, v_dep, 4);
  r := r || jsonb_build_object('03_peca',
    (select custo_unitario || ' x ' || quantidade || ' = ' || custo_total from public.os_pecas where id = v_l1),
    '03_saldo', (select saldo from public.almoxarifado_saldos where deposito_id = v_dep and insumo_id = v_peca));

  -- 4. mais do que tem: recusa
  begin
    perform public.fn_os_adicionar_peca(v_os, v_peca, v_dep, 17);
    v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 50); end;
  r := r || jsonb_build_object('04_saldo_insuficiente', v_txt);

  -- 5. óleo e terceiro somam no custo
  v_l2 := public.fn_os_adicionar_oleo(v_os, v_tipo, v_oleo, v_dep, 12.5, 'L');
  v_ter := public.fn_os_adicionar_terceiro(v_os, v_forn, 'PROVA torno', 100.5, '123');
  r := r || jsonb_build_object('05_custos', (select custo_pecas || ' + ' || custo_oleos || ' + ' || custo_terceiros || ' = ' || custo_total
    from public.ordens_servico where id = v_os));

  -- 6. iniciar põe o equipamento em manutenção, com histórico
  perform public.fn_os_iniciar(v_os);
  r := r || jsonb_build_object('06_equip_em_execucao', (select status from public.equipamentos where id = v_equip),
    '06_historico', (select count(*) from public.equipamento_status_historico where ordem_servico_id = v_os));

  -- 7. concluir devolve a ativa
  perform public.fn_os_concluir(v_os, current_date, 1510);
  r := r || jsonb_build_object('07_equip_concluida', (select status from public.equipamentos where id = v_equip));

  -- 8. concluída não aceita linha; reabrir exige motivo
  begin perform public.fn_os_adicionar_peca(v_os, v_peca, v_dep, 1); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 40); end;
  r := r || jsonb_build_object('08a_linha_em_concluida', v_txt);
  begin perform public.fn_os_reabrir(v_os, ' '); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 40); end;
  r := r || jsonb_build_object('08b_reabrir_sem_motivo', v_txt);
  perform public.fn_os_reabrir(v_os, 'PROVA faltou peça');
  r := r || jsonb_build_object('08c_reaberta', (select status from public.ordens_servico where id = v_os));

  -- 9. tirar a peça estorna o almoxarifado e o custo
  perform public.fn_os_remover_linha('peca', v_l1);
  r := r || jsonb_build_object('09_saldo_depois_de_remover', (select saldo from public.almoxarifado_saldos where deposito_id = v_dep and insumo_id = v_peca),
    '09_custo_pecas', (select custo_pecas from public.ordens_servico where id = v_os));

  -- 10. excluir entrada que deixaria o saldo negativo: recusa
  v_l1 := public.fn_os_adicionar_peca(v_os, v_peca, v_dep, 15);
  begin perform public.fn_almox_excluir_entrada(v_ent, 'PROVA'); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 50); end;
  r := r || jsonb_build_object('10_excluir_entrada_negativa', v_txt);

  -- 11. cancelar estorna tudo e zera o custo
  perform public.fn_os_cancelar(v_os, 'PROVA cancelada');
  r := r || jsonb_build_object('11_cancelada', (select status || ' custo ' || custo_total from public.ordens_servico where id = v_os),
    '11_saldo_peca', (select saldo from public.almoxarifado_saldos where deposito_id = v_dep and insumo_id = v_peca),
    '11_saldo_oleo', (select saldo from public.almoxarifado_saldos where deposito_id = v_dep and insumo_id = v_oleo),
    '11_saidas_estornadas', (select count(*) from public.almoxarifado_saidas where ordem_servico_id = v_os and estornada_em is not null),
    '11_transicoes', (select string_agg(coalesce(status_de, '-') || '>' || status_para, ' ' order by criado_em) from public.os_transicoes where ordem_servico_id = v_os));

  -- 12. alugado sem etapa exige a obra
  begin perform public.fn_os_salvar(null, v_alug, null, 'corretiva', null, 'PROVA alugado', null, null, null, current_date, null); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 45); end;
  v_os2 := public.fn_os_salvar(null, v_alug, v_obra009, 'corretiva', null, 'PROVA alugado', null, null, null, current_date, null);
  r := r || jsonb_build_object('12a_alugado_sem_obra', v_txt,
    '12b_alugado_na_obra', (select (centro_custo_id = v_obra009)::text from public.ordens_servico where id = v_os2));

  -- 13. OS e horímetro pela fila offline: reenviar não duplica
  v_os2 := public.fn_os_salvar(null, v_equip, null, 'corretiva', null, 'PROVA celular', null, null, null, current_date, null, 'celular', v_cli);
  r := r || jsonb_build_object('13a_os_reenviada_mesmo_id',
    public.fn_os_salvar(null, v_equip, null, 'corretiva', null, 'PROVA celular', null, null, null, current_date, null, 'celular', v_cli) = v_os2);
  v_m1 := public.fn_registrar_medicao(v_equip, current_date, 1520, 'celular', v_cli);
  v_m2 := public.fn_registrar_medicao(v_equip, current_date, 1520, 'celular', v_cli);
  r := r || jsonb_build_object('13b_medicao_reenviada', (v_m1 = v_m2)::text || ' linhas ' ||
    (select count(*) from public.equipamento_medicoes where id_cliente = v_cli));
  reset role;

  -- 14. RLS: Andreia (sem Manutenção) não vê OS nem abre. CONTROLE: ela vê fornecedores.
  perform set_config('request.jwt.claims', json_build_object('sub', v_andreia, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.ordens_servico;
  r := r || jsonb_build_object('14a_andreia_ve_os', v_n);
  select count(*) into v_n from public.almoxarifado_saldos;
  r := r || jsonb_build_object('14b_andreia_ve_saldos', v_n);
  select count(*) into v_n from public.fornecedores;
  r := r || jsonb_build_object('14c_CONTROLE_andreia_ve_fornecedores', v_n);
  begin perform public.fn_os_salvar(null, v_equip, null, 'corretiva', null, 'PROVA Andreia', null, null, null, current_date, null); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 45); end;
  r := r || jsonb_build_object('14d_andreia_abre_os', v_txt);
  begin insert into public.ordens_servico (numero, equipamento_id, centro_custo_id, tipo, descricao, data_abertura)
        values ('X', v_equip, v_etapa, 'corretiva', 'direto', current_date); v_txt := 'GRAVOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 45); end;
  r := r || jsonb_build_object('14e_andreia_insert_direto', v_txt);
  reset role;

  -- 15. PROVA NEGATIVA: nada disso gerou lançamento
  r := r || jsonb_build_object('15_lancamentos_novos', (select count(*) from public.lancamentos) - v_lanc0);

  raise exception 'PROVA %', r;
end $prova$;
do $aborto$ begin raise exception 'ABORTO GARANTIDO'; end $aborto$;
