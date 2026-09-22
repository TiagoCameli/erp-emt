-- Prova da Fase 1 (cadastros compartilhados). Migration 20260922200000.
-- NÃO GRAVA NADA: o bloco termina em raise exception com as medições, e um segundo bloco
-- aborta sempre. Rodar pelo execute_sql no projeto vsesgvqjgqpapoxhnbqx.
--
-- Casos:
--  1-3  equipamento novo nasce com a etapa no lugar da propriedade
--         propria → raiz de manutenção; colorado → obra 002; alugada → sem etapa
--  4-6  trocar a propriedade sem uso reposiciona: colorado→propria move o pai,
--         propria→alugada apaga a etapa, alugada→colorado cria a etapa
--  7    trocar a propriedade de uma carreta (etapa com rateio) é recusado
--  8    RLS de localidades: quem não tem o recurso (Andreia, Compras) não lê e não
--         grava; o Admin (Tiago) lê e grava. LINHA DE CONTROLE: a mesma Andreia lê
--         fornecedores, então o zero dela em localidades não é o role que falhou.
--  9    excluir localidade vai para a lixeira com o recurso certo; sem o recurso, recusa.
--
-- RESULTADO em 22/09/2026, logo depois de aplicar a migration (todos passaram):
--   1 true, 2 true, 3 true, 4 true, 5 true, 6 true
--   7 "recusou: Nao da para mudar a propriedade..." e a carreta continua em 001 - Carretas EMT
--   8a admin lê 1; 8b Andreia lê 0; 8c CONTROLE Andreia lê 977 fornecedores;
--   8d Andreia grava: "new row violates row-level security policy"
--   9a Andreia exclui: "Sem permissao para excluir em cadastros.localidades"
--   9b admin exclui: 1 linha na lixeira; 9c saiu da tabela
-- Depois do aborto: 107 equipamentos, 0 "PROVA", 0 localidades, 0 na lixeira. Nada ficou.
-- Advisors de segurança e performance: nenhum achado nos objetos desta migration.

do $prova$
declare
  v_tiago constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_andreia constant uuid := '7d0194c2-fd7e-41d1-b6c4-f05c0a652229';
  v_man uuid := public.fn_centro_raiz_da_propriedade('propria');
  v_col uuid := public.fn_centro_raiz_da_propriedade('colorado');
  e_prop uuid; e_col uuid; e_alug uuid; v_carreta uuid; v_loc uuid;
  r jsonb := '{}'::jsonb;
  v_txt text; v_n int;
begin
  -- 1-3
  insert into public.equipamentos (descricao, propriedade) values ('PROVA propria', 'propria') returning id into e_prop;
  insert into public.equipamentos (descricao, propriedade) values ('PROVA colorado', 'colorado') returning id into e_col;
  insert into public.equipamentos (descricao, propriedade) values ('PROVA alugada', 'alugada') returning id into e_alug;
  r := r || jsonb_build_object(
    '1_propria_na_manutencao', (select pai_id = v_man from public.centros_custo where equipamento_id = e_prop),
    '2_colorado_na_002',       (select pai_id = v_col from public.centros_custo where equipamento_id = e_col),
    '3_alugada_sem_etapa',     not exists (select 1 from public.centros_custo where equipamento_id = e_alug));

  -- 4-6
  update public.equipamentos set propriedade = 'propria' where id = e_col;
  r := r || jsonb_build_object('4_colorado_para_propria_move',
    (select pai_id = v_man from public.centros_custo where equipamento_id = e_col));
  update public.equipamentos set propriedade = 'alugada' where id = e_prop;
  r := r || jsonb_build_object('5_propria_para_alugada_apaga',
    not exists (select 1 from public.centros_custo where equipamento_id = e_prop));
  update public.equipamentos set propriedade = 'colorado' where id = e_alug;
  r := r || jsonb_build_object('6_alugada_para_colorado_cria',
    (select pai_id = v_col from public.centros_custo where equipamento_id = e_alug));

  -- 7: uma carreta, etapa com rateio
  select c.equipamento_id into v_carreta
  from public.centros_custo c join public.centros_custo p on p.id = c.pai_id
  where p.nome = '001 - Carretas EMT' and c.equipamento_id is not null
    and exists (select 1 from public.lancamento_rateios lr where lr.centro_custo_id = c.id)
  limit 1;
  begin
    update public.equipamentos set propriedade = 'colorado' where id = v_carreta;
    v_txt := 'PASSOU (errado)';
  exception when others then
    v_txt := 'recusou: ' || left(sqlerrm, 40);
  end;
  r := r || jsonb_build_object('7_carreta_com_rateio', v_txt,
    '7_carreta_continua_em_001', (select p.nome from public.centros_custo c join public.centros_custo p on p.id = c.pai_id where c.equipamento_id = v_carreta));

  -- 8: RLS. Admin grava uma localidade.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.localidades (nome) values ('PROVA Pedreira') returning id into v_loc;
  select count(*) into v_n from public.localidades where id = v_loc;
  r := r || jsonb_build_object('8a_admin_le', v_n);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_andreia, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.localidades;
  r := r || jsonb_build_object('8b_andreia_le_localidades', v_n);
  select count(*) into v_n from public.fornecedores;
  r := r || jsonb_build_object('8c_CONTROLE_andreia_le_fornecedores', v_n);
  begin
    insert into public.localidades (nome) values ('PROVA Andreia');
    v_txt := 'GRAVOU (errado)';
  exception when others then
    v_txt := 'recusou: ' || left(sqlerrm, 45);
  end;
  r := r || jsonb_build_object('8d_andreia_grava', v_txt);

  -- 9: excluir pela lixeira, sem e com o recurso
  begin
    perform public.fn_excluir_cadastro('localidades', v_loc, 'prova');
    v_txt := 'EXCLUIU (errado)';
  exception when others then
    v_txt := 'recusou: ' || left(sqlerrm, 45);
  end;
  r := r || jsonb_build_object('9a_andreia_exclui', v_txt);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.fn_excluir_cadastro('localidades', v_loc, 'prova');
  reset role;
  r := r || jsonb_build_object('9b_admin_exclui_vai_para_lixeira',
    (select count(*) from public.lixeira where tabela = 'localidades' and registro_id = v_loc::text),
    '9c_saiu_da_tabela', not exists (select 1 from public.localidades where id = v_loc));

  raise exception 'PROVA %', r;
end $prova$;
do $aborto$ begin raise exception 'ABORTO GARANTIDO'; end $aborto$;
