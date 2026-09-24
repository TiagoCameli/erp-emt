-- Prova do congelamento do Combustível e do Frete no GESTÃO OBRAS, rodar pelo execute_sql na
-- origem logo depois de origem_congelar_combustivel_frete.sql. NÃO GRAVA: termina em raise, e
-- um segundo bloco aborta sempre.
--
-- Esperado: frete, pagamento, saída, entrada e movimento recusados com a mensagem do ERP;
-- LINHA DE CONTROLE: a medição de equipamento (fica aberta) continua passando.

do $prova$
declare r jsonb := '{}'::jsonb; v_txt text; v_equip text; v_frete text; v_saida text; v_dep text; v_ins text; v_forn text;
begin
  select id into v_equip from public.equipamentos limit 1;
  select id into v_frete from public.fretes where deleted_at is null limit 1;
  select id into v_saida from public.saidas_combustivel where deleted_at is null limit 1;
  select id into v_dep from public.depositos where not coalesce(eh_externo, false) limit 1;
  select id into v_ins from public.insumos limit 1;
  select id into v_forn from public.fornecedores where eh_transportadora limit 1;

  begin
    update public.fretes set observacoes = observacoes where id = v_frete;
    v_txt := 'GRAVOU (errado)';
  exception when others then v_txt := case when sqlerrm like '%ERP-EMT%' then 'recusou pelo congelamento' else 'RECUSOU POR OUTRO MOTIVO (a prova não vale): ' || left(sqlerrm, 60) end; end;
  r := r || jsonb_build_object('1_editar_frete', v_txt);

  begin
    insert into public.pagamentos_frete (id, data, transportadora, mes_referencia, valor, transportadora_id)
    values ('prova-congelamento', to_char(now(), 'YYYY-MM-DD'), 'prova', to_char(now(), 'YYYY-MM'), 1, v_forn);
    v_txt := 'GRAVOU (errado)';
  exception when others then v_txt := case when sqlerrm like '%ERP-EMT%' then 'recusou pelo congelamento' else 'RECUSOU POR OUTRO MOTIVO (a prova não vale): ' || left(sqlerrm, 60) end; end;
  r := r || jsonb_build_object('2_pagamento_novo', v_txt);

  begin
    update public.saidas_combustivel set observacoes = observacoes where id = v_saida;
    v_txt := 'GRAVOU (errado)';
  exception when others then v_txt := case when sqlerrm like '%ERP-EMT%' then 'recusou pelo congelamento' else 'RECUSOU POR OUTRO MOTIVO (a prova não vale): ' || left(sqlerrm, 60) end; end;
  r := r || jsonb_build_object('3_editar_abastecimento', v_txt);

  begin
    insert into public.entradas_combustivel (id, deposito_id, tipo_combustivel, quantidade_litros, valor_total, data_hora)
    values ('prova-congelamento', v_dep, v_ins, 1, 1, now()::timestamp);
    v_txt := 'GRAVOU (errado)';
  exception when others then v_txt := case when sqlerrm like '%ERP-EMT%' then 'recusou pelo congelamento' else 'RECUSOU POR OUTRO MOTIVO (a prova não vale): ' || left(sqlerrm, 60) end; end;
  r := r || jsonb_build_object('4_entrada_nova', v_txt);

  begin
    insert into public.transportadora_movimentos (id, transportadora_id, data, tipo, valor, origem_tabela, origem_id)
    values ('prova-congelamento', v_forn, now(), 'ajuste_manual_credito', 1, 'ajuste_manual', 'prova-congelamento');
    v_txt := 'GRAVOU (errado)';
  exception when others then v_txt := case when sqlerrm like '%ERP-EMT%' then 'recusou pelo congelamento' else 'RECUSOU POR OUTRO MOTIVO (a prova não vale): ' || left(sqlerrm, 60) end; end;
  r := r || jsonb_build_object('5_ajuste_de_saldo', v_txt);

  begin
    insert into public.medicoes_equipamento (id, equipamento_id, data, tipo_medicao, valor, origem)
    values ('prova-congelamento', v_equip, now(), 'horimetro', 1, 'manual');
    v_txt := 'passou (certo: a medição fica aberta)';
  exception when others then v_txt := 'RECUSOU (errado): ' || left(sqlerrm, 60); end;
  r := r || jsonb_build_object('6_CONTROLE_medicao', v_txt);

  raise exception 'PROVA %', r;
end $prova$;
do $aborto$ begin raise exception 'ABORTO GARANTIDO'; end $aborto$;
