-- Prova do módulo Estoque (migration 20261013164803_estoque_modulo, aplicada pelo CLI linkado: o MCP deu
-- "Invalid or expired requestState" por causa do delete na função PEPS). Resultado em 13/10/2026, banco vivo: todos
-- os casos como o esperado; 8b restante null (o item da OC esgotou e saiu da lista); 7_posicao_origens
-- {"estoque": 1, "combustivel": 8, "pecas": 27}. NÃO GRAVA: termina em raise exception com o resultado.
-- Cada caso vira uma chave em r. "recusou: ..." é o esperado nas travas; "PASSOU (errado)" é falha.
-- Esperado:
--   1 estrutura: 3 tabelas com RLS, 0 grant de escrita, 2 auditadas
--   2 PEPS: E1 10 x 5,00 em 01/10, E2 10 x 7,00 em 05/10; S1 15 em 06/10 = 85,0000 (5,6667)
--   3 saída retroativa S2 3 em 02/10: S2 = 15,0000 (5,0000); S1 vira 91,0000 (6,0667)
--   4 saída de 5 em 06/10 (só restam 2): recusou Saldo insuficiente
--   5 saída antes da primeira entrada: recusou
--   6 excluir E2 (S1 depende dela): recusou
--   7 posição do depósito: quantidade 2, valor 14
--   8 OC: entrada acima do saldo do item recusou; dentro do saldo usa insumo e preço da OC
--   9 sem permissão: salvar recusou, select vê 0, posição recusou
--  10 excluir S1 libera E2, restaurar S1 volta o custo 91,0000
do $prova$
declare
  v_admin constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_zero constant uuid := gen_random_uuid();
  v_insumo constant uuid := '273145e1-80dc-451f-8a81-d25af1b81350';
  v_cc constant uuid := '026a70b7-640c-459d-9c10-f11ccba5d4c1';
  v_oc_item constant uuid := '713416f4-ad0b-4c2b-966c-a85b973ed355';
  v_dep uuid; v_e1 uuid; v_e2 uuid; v_s1 uuid; v_s2 uuid; v_eoc uuid;
  v_n bigint; v_txt text; v_j jsonb; r jsonb := '{}'::jsonb;
begin
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'estoque\_%' and c.relrowsecurity;
  r := r || jsonb_build_object('1a_tabelas_com_rls', v_n);
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name like 'estoque\_%' and grantee in ('authenticated', 'anon')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  r := r || jsonb_build_object('1b_grants_de_escrita', v_n);
  select count(*) into v_n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname like 'estoque\_%' and t.tgname like 'trg_audit_%';
  r := r || jsonb_build_object('1c_tabelas_auditadas', v_n);

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.almoxarifado_depositos (nome) values ('Depósito prova estoque') returning id into v_dep;

  -- 2. PEPS
  v_e1 := public.fn_estoque_salvar_entrada(null, v_dep, v_insumo, 10, 5, '2026-10-01');
  v_e2 := public.fn_estoque_salvar_entrada(null, v_dep, v_insumo, 10, 7, '2026-10-05');
  v_s1 := public.fn_estoque_salvar_saida(null, v_dep, v_insumo, 15, '2026-10-06', v_cc);
  select jsonb_build_object('valor', valor_total, 'unit', custo_unitario) into v_j from public.estoque_saidas where id = v_s1;
  r := r || jsonb_build_object('2_s1', v_j);

  -- 3. Retroativa
  v_s2 := public.fn_estoque_salvar_saida(null, v_dep, v_insumo, 3, '2026-10-02', v_cc);
  select jsonb_build_object('s2', (select jsonb_build_object('valor', valor_total, 'unit', custo_unitario) from public.estoque_saidas where id = v_s2),
                            's1', (select jsonb_build_object('valor', valor_total, 'unit', custo_unitario) from public.estoque_saidas where id = v_s1))
    into v_j;
  r := r || jsonb_build_object('3_retroativa', v_j);

  -- 4. Saldo insuficiente
  v_txt := 'PASSOU (errado)';
  begin
    perform public.fn_estoque_salvar_saida(null, v_dep, v_insumo, 5, '2026-10-06', v_cc);
  exception when others then v_txt := 'recusou: ' || sqlerrm;
  end;
  r := r || jsonb_build_object('4_insuficiente', v_txt);

  -- 5. Antes da primeira entrada
  v_txt := 'PASSOU (errado)';
  begin
    perform public.fn_estoque_salvar_saida(null, v_dep, v_insumo, 1, '2026-09-30', v_cc);
  exception when others then v_txt := 'recusou: ' || sqlerrm;
  end;
  r := r || jsonb_build_object('5_antes_da_entrada', v_txt);

  -- 6. Excluir entrada consumida
  v_txt := 'PASSOU (errado)';
  begin
    perform public.fn_estoque_excluir('estoque_entradas', v_e2, 'teste');
  exception when others then v_txt := 'recusou: ' || sqlerrm;
  end;
  r := r || jsonb_build_object('6_excluir_entrada_consumida', v_txt);

  -- 7. Posição
  select jsonb_build_object('q', quantidade, 'v', valor) into v_j from public.fn_estoque_posicao()
   where origem = 'estoque' and local_id = v_dep and insumo_id = v_insumo;
  r := r || jsonb_build_object('7_posicao', v_j);
  select jsonb_object_agg(origem, n) into v_j from (select origem, count(*) n from public.fn_estoque_posicao() group by origem) x;
  r := r || jsonb_build_object('7_posicao_origens', v_j);

  -- 8. OC
  v_txt := 'PASSOU (errado)';
  begin
    perform public.fn_estoque_salvar_entrada(null, v_dep, null, 1000, null, '2026-10-10', v_oc_item);
  exception when others then v_txt := 'recusou: ' || sqlerrm;
  end;
  r := r || jsonb_build_object('8a_oc_acima', v_txt);
  v_eoc := public.fn_estoque_salvar_entrada(null, v_dep, v_insumo, 1, 1, '2026-10-10', v_oc_item);
  select jsonb_build_object('insumo_da_oc', e.insumo_id = i.insumo_id, 'preco_da_oc', e.valor_unitario = i.preco_unitario, 'oc_numero', e.oc_numero,
                            'restante', (select quantidade_restante from public.fn_estoque_oc_itens_disponiveis() where oc_item_id = v_oc_item))
    into v_j from public.estoque_entradas e join public.oc_itens i on i.id = e.oc_item_id where e.id = v_eoc;
  r := r || jsonb_build_object('8b_oc', v_j);

  -- 10. Excluir e restaurar saída
  perform public.fn_estoque_excluir('estoque_saidas', v_s1, 'teste');
  perform public.fn_estoque_excluir('estoque_entradas', v_e2, 'agora pode');
  v_txt := 'PASSOU (errado)';
  begin
    perform public.fn_estoque_restaurar('estoque_saidas', v_s1);
  exception when others then v_txt := 'recusou: ' || sqlerrm;
  end;
  r := r || jsonb_build_object('10a_restaurar_sem_entrada', v_txt);
  perform public.fn_estoque_restaurar('estoque_entradas', v_e2);
  perform public.fn_estoque_restaurar('estoque_saidas', v_s1);
  select jsonb_build_object('valor', valor_total, 'unit', custo_unitario) into v_j from public.estoque_saidas where id = v_s1;
  r := r || jsonb_build_object('10b_restaurada', v_j);
  reset role;

  -- 9. Sem permissão
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_txt := 'PASSOU (errado)';
  begin
    perform public.fn_estoque_salvar_saida(null, v_dep, v_insumo, 1, '2026-10-06', v_cc);
  exception when others then v_txt := 'recusou: ' || sqlerrm;
  end;
  r := r || jsonb_build_object('9a_salvar', v_txt);
  select count(*) into v_n from public.estoque_entradas;
  r := r || jsonb_build_object('9b_select', v_n);
  v_txt := 'PASSOU (errado)';
  begin
    perform * from public.fn_estoque_posicao();
  exception when others then v_txt := 'recusou: ' || sqlerrm;
  end;
  r := r || jsonb_build_object('9c_posicao', v_txt);
  v_txt := 'PASSOU (errado)';
  begin
    insert into public.almoxarifado_depositos (nome) values ('Invasor');
  exception when others then v_txt := 'recusou: ' || sqlerrm;
  end;
  r := r || jsonb_build_object('9d_criar_deposito', v_txt);
  reset role;

  raise exception 'PROVA %', r;
end $prova$;
