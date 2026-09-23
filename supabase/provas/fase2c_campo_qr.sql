-- Prova da Fase 2c (celular do equipamento). Migrations 20260923110000 e 20260923140000.
-- NÃO GRAVA: termina em raise exception com as medições, e um segundo bloco aborta sempre.
-- Rodar pelo execute_sql no projeto vsesgvqjgqpapoxhnbqx.
--
-- Usuário de prova: uma das contas novas da Fase 1, sem NENHUMA permissão. A permissão de
-- Manutenção é dada dentro da transação desfeita; o antes e o depois são a prova (linha de
-- controle por diferença: só a permissão mudou).

do $prova$
declare
  v_tiago constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_zero constant uuid := 'f155865b-1d4b-4b25-bf3d-54d8de9176b0';
  v_antigo text; v_novo uuid; v_inativo uuid; v_n int; v_txt text; v_lanc0 bigint;
  r jsonb := '{}'::jsonb;
begin
  select count(*) into v_lanc0 from public.lancamentos;
  select gestao_obras_id, equipamento_id into v_antigo, v_novo from legado.de_para_equipamentos order by gestao_obras_id limit 1;
  insert into public.equipamento_especificacoes (equipamento_id, capacidade_tanque_l) values (v_novo, 300);
  -- a base não tem equipamento inativo (23/09): inativa um, dentro da transação desfeita
  select id into v_inativo from public.equipamentos where ativo and id <> v_novo
   and controle_por in ('horimetro', 'km') limit 1;
  update public.equipamentos set ativo = false where id = v_inativo;

  -- 1. o id antigo e o código do ERP nunca apontam máquinas diferentes (ordem do resolvedor)
  select count(*) into v_n from legado.de_para_equipamentos d
    join public.equipamentos e on lower(e.codigo) = lower(d.gestao_obras_id) and e.id <> d.equipamento_id;
  r := r || jsonb_build_object('1_id_antigo_igual_codigo_de_outra_maquina', v_n);

  -- 2. Admin resolve o adesivo antigo
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('2a_admin_resolve_adesivo', public.fn_equipamento_do_legado(v_antigo) = v_novo);
  r := r || jsonb_build_object('2b_admin_id_inexistente', coalesce(public.fn_equipamento_do_legado('nao-existe-xyz')::text, 'null'));
  -- 3. leitura em equipamento inativo é recusada pelo banco (a fila do celular herda)
  if v_inativo is null then v_txt := 'sem equipamento inativo para testar';
  else
    begin perform public.fn_registrar_medicao(v_inativo, current_date, 10, 'celular', gen_random_uuid()); v_txt := 'PASSOU (errado)';
    exception when others then v_txt := 'recusou: ' || left(sqlerrm, 40); end;
  end if;
  r := r || jsonb_build_object('3_medicao_em_inativo', v_txt);
  reset role;

  -- 4. ANTES: usuário sem permissão nenhuma
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('4a_sem_permissao_resolve', coalesce(public.fn_equipamento_do_legado(v_antigo)::text, 'null'));
  select count(*) into v_n from public.equipamento_especificacoes where equipamento_id = v_novo;
  r := r || jsonb_build_object('4b_sem_permissao_ve_ficha', v_n);
  reset role;

  -- 5. DEPOIS: só "ver" das Medições da Manutenção (nada de Cadastros)
  insert into public.usuario_permissoes (usuario_id, recurso, acao) values (v_zero, 'manutencao.medicoes', 'ver');
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('5a_manutencao_resolve', public.fn_equipamento_do_legado(v_antigo) = v_novo);
  select count(*) into v_n from public.equipamento_especificacoes where equipamento_id = v_novo;
  r := r || jsonb_build_object('5b_manutencao_ve_ficha', v_n);
  begin update public.equipamento_especificacoes set capacidade_tanque_l = 1 where equipamento_id = v_novo;
    get diagnostics v_n = row_count; v_txt := v_n || ' linhas alteradas';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 40); end;
  r := r || jsonb_build_object('5c_manutencao_edita_ficha', v_txt);
  begin perform public.fn_registrar_medicao(v_novo, current_date, 10, 'celular', gen_random_uuid()); v_txt := 'PASSOU (errado)';
  exception when others then v_txt := 'recusou: ' || left(sqlerrm, 40); end;
  r := r || jsonb_build_object('5d_ver_nao_lanca', v_txt);
  reset role;

  -- 6. PROVA NEGATIVA: nada disso gerou lançamento
  r := r || jsonb_build_object('6_lancamentos_novos', (select count(*) from public.lancamentos) - v_lanc0);

  raise exception 'PROVA %', r;
end $prova$;
do $aborto$ begin raise exception 'ABORTO GARANTIDO'; end $aborto$;
