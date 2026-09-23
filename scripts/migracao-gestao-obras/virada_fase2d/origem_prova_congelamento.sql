-- Prova do congelamento da Manutenção no GESTÃO OBRAS, rodar pelo execute_sql na origem logo
-- depois de origem_congelar_manutencao.sql. NÃO GRAVA: termina em raise, e um segundo bloco
-- aborta sempre.
--
-- Esperado: OS, peça e entrada do almoxarifado de peças recusadas com a mensagem do ERP;
-- LINHA DE CONTROLE: a medição (que o abastecimento do Combustível grava) continua passando.

do $prova$
declare r jsonb := '{}'::jsonb; v_txt text; v_equip text; v_os text; v_ins text; v_dep text;
begin
  select id into v_equip from public.equipamentos limit 1;
  select id into v_os from public.ordens_servico where deleted_at is null limit 1;
  select id into v_ins from public.insumos limit 1;
  select id into v_dep from public.depositos_material where eh_almoxarifado_pecas limit 1;

  begin
    insert into public.ordens_servico (id, numero, equipamento_id, tipo, prioridade, status, origem)
    values ('prova-congelamento', 'OS-PROVA', v_equip, 'corretiva', 'media', 'aberta', 'manual');
    v_txt := 'GRAVOU (errado)';
  exception when others then v_txt := case when sqlerrm like '%ERP-EMT%' then 'recusou pelo congelamento' else 'RECUSOU POR OUTRO MOTIVO (a prova não vale): ' || left(sqlerrm, 60) end; end;
  r := r || jsonb_build_object('1_os_nova', v_txt);

  begin
    update public.ordens_servico set observacoes = observacoes where id = v_os;
    v_txt := 'GRAVOU (errado)';
  exception when others then v_txt := case when sqlerrm like '%ERP-EMT%' then 'recusou pelo congelamento' else 'RECUSOU POR OUTRO MOTIVO (a prova não vale): ' || left(sqlerrm, 60) end; end;
  r := r || jsonb_build_object('2_editar_os', v_txt);

  begin
    insert into public.entradas_material (id, data_hora, deposito_material_id, insumo_id, quantidade, valor_total)
    values ('prova-congelamento', now()::text, v_dep, v_ins, 1, 1);
    v_txt := 'GRAVOU (errado)';
  exception when others then v_txt := case when sqlerrm like '%ERP-EMT%' then 'recusou pelo congelamento' else 'RECUSOU POR OUTRO MOTIVO (a prova não vale): ' || left(sqlerrm, 60) end; end;
  r := r || jsonb_build_object('3_entrada_almox_pecas', v_txt);

  begin
    insert into public.medicoes_equipamento (id, equipamento_id, data, tipo_medicao, valor, origem)
    values ('prova-congelamento', v_equip, now(), 'horimetro', 1, 'abastecimento');
    v_txt := 'passou (certo: o Combustível segue gravando)';
  exception when others then v_txt := 'RECUSOU (errado): ' || left(sqlerrm, 60); end;
  r := r || jsonb_build_object('4_CONTROLE_medicao_do_abastecimento', v_txt);

  raise exception 'PROVA %', r;
end $prova$;
do $aborto$ begin raise exception 'ABORTO GARANTIDO'; end $aborto$;
