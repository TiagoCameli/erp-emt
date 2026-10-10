-- Prova da Fase 1a da Execução de Obras. Migrations 20261012100000 a 20261012160000.
-- NÃO GRAVA: termina em raise exception com as medições, e o bloco de aborto garante o rollback.
-- Rodar inteira pelo MCP execute_sql. Cada caso vira uma chave em r; "recusou: ..." é o esperado
-- nos casos de trava; "PASSOU (errado)" é falha. Os números esperados estão ao lado de cada caso.
begin;
do $prova$
declare
  v_tiago constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_zero constant uuid := 'f155865b-1d4b-4b25-bf3d-54d8de9176b0';
  v_obra uuid; v_obra2 uuid; v_cron uuid; v_cal uuid; v_n bigint; v_txt text; v_j jsonb; r jsonb := '{}'::jsonb;
  v_lista bigint; v_admins bigint;
  v_ids jsonb; v_11 uuid; v_12 uuid; v_r1 uuid;
  v_obras0 bigint; v_cc0 bigint; v_colab0 bigint;
begin
  select count(*) into v_obras0 from public.obras;
  select count(*) into v_cc0 from public.centros_custo;
  select count(*) into v_colab0 from public.colaboradores;

  -- 1. Estrutura: as tabelas existem com RLS ligada, sem grant de escrita, auditadas
  --    Esperado: 1a = 12, 1b = 0, 1c = 11
  --    (1c = 11: ex_atividade_datas é cache derivado do CPM e não é auditado; as entradas dele são)
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'ex\_%' and c.relrowsecurity;
  r := r || jsonb_build_object('1a_tabelas_com_rls', v_n);
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name like 'ex\_%' and grantee in ('authenticated', 'anon')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  r := r || jsonb_build_object('1b_grants_de_escrita', v_n);
  select count(*) into v_n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname like 'ex\_%' and t.tgname like 'trg_audit_%';
  r := r || jsonb_build_object('1c_tabelas_auditadas', v_n);

  -- 2. Calendário. Padrão EMT: seg a sex 9 h, sáb 5 h, dom 0; feriados nacionais e do AC.
  --    2a Páscoa 2026 a 2030: 2026-04-05, 2027-03-28, 2028-04-16, 2029-04-01, 2030-04-21
  --    2b dias úteis de 01/04/2026 a 07/04/2026: 04-01, 04-02, 04-04 (sáb), 04-06, 04-07
  --       (03/04 é Sexta-feira Santa, 05/04 é domingo)
  --    2c somar(03/04, 0) = 04-04; somar(02/04, 1) = 04-04; somar(06/04, -1) = 04-04
  --    2d calendário filho: paralisação no PAI em 06/04 some do filho; extra no FILHO em 05/04 entra
  --       Esperado 2d: 04-01, 04-02, 04-04, 04-05, 04-07
  select id into v_cal from public.ex_calendarios where padrao_empresa and excluido_em is null;
  r := r || jsonb_build_object('2a_pascoa', (select jsonb_agg(public.fn_ex_pascoa(a) order by a) from generate_series(2026, 2030) a));
  r := r || jsonb_build_object('2b_dias_uteis', (select jsonb_agg(data order by data) from public.fn_ex_dias_uteis(v_cal, '2026-04-01', '2026-04-07')));
  r := r || jsonb_build_object('2c_somar', jsonb_build_array(
    public.fn_ex_somar_dias_uteis(v_cal, '2026-04-03', 0), public.fn_ex_somar_dias_uteis(v_cal, '2026-04-02', 1),
    public.fn_ex_somar_dias_uteis(v_cal, '2026-04-06', -1)));
  declare v_filho uuid; v_pai uuid;
  begin
    insert into public.ex_calendarios (nome, modelo, horas_seg, horas_ter, horas_qua, horas_qui, horas_sex, horas_sab)
    values ('Prova pai', true, 9, 9, 9, 9, 9, 5) returning id into v_pai;
    insert into public.ex_calendarios (nome, pai_id, horas_seg, horas_ter, horas_qua, horas_qui, horas_sex, horas_sab)
    values ('Prova filho', v_pai, 9, 9, 9, 9, 9, 5) returning id into v_filho;
    insert into public.ex_calendario_excecoes (calendario_id, data, horas, tipo, descricao)
    values (v_pai, '2026-04-06', 0, 'paralisacao', 'Prova'), (v_filho, '2026-04-05', 8, 'extra', 'Prova');
    r := r || jsonb_build_object('2d_heranca', (select jsonb_agg(data order by data) from public.fn_ex_dias_uteis(v_filho, '2026-04-01', '2026-04-07')));
  end;

  -- 3. Acesso por obra. As permissões do backfill (Task 7) ainda não estão aplicadas: a prova dá ao
  --    Tiago as 9 da fase dentro da transação.
  insert into public.usuario_permissoes (usuario_id, recurso, acao)
  select v_tiago, x.recurso, x.acao from (values ('execucao.obras', 'ver'),
    ('execucao.cronogramas', 'ver'), ('execucao.cronogramas', 'criar'), ('execucao.cronogramas', 'editar'), ('execucao.cronogramas', 'excluir'),
    ('execucao.modelos', 'ver'), ('execucao.modelos', 'criar'), ('execucao.modelos', 'editar'), ('execucao.modelos', 'excluir')) x(recurso, acao)
  on conflict do nothing;
  select count(*) into v_admins from public.usuarios u join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
   where u.ativo and u.excluido_em is null;
  select o.id into v_obra2 from public.obras o where o.ativo and not exists (select 1 from public.ex_obras e where e.obra_id = o.id)
   order by o.nome desc limit 1;

  -- 3a. Tiago cria o primeiro cronograma da obra 2: a pasta nasce e a lista recebe Tiago + Admins. Esperado: lista = admins
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_cron := public.fn_ex_cronograma_salvar(jsonb_build_object('obra_id', v_obra2, 'tipo_obra', 'edificacao',
    'codigo', 'FUND', 'nome', 'Fundação', 'data_inicio', '2026-03-02'));
  reset role;
  select count(*) into v_lista from public.ex_obra_usuarios where obra_id = v_obra2;
  r := r || jsonb_build_object('3a_pasta_e_lista', jsonb_build_object('lista', v_lista, 'admins', v_admins,
    'calendario_herdado', (select c.pai_id = (select id from public.ex_calendarios where padrao_empresa)
                           from public.ex_cronogramas k join public.ex_calendarios c on c.id = k.calendario_id where k.id = v_cron)));

  -- 3b. Usuário zero sem permissão nenhuma não vê nada. Esperado: 0
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('3b_zero_sem_permissao', (select count(*) from public.ex_cronogramas));
  reset role;

  -- 3c. Zero com execucao.cronogramas/ver mas fora da lista: continua sem ver. Esperado: 0
  insert into public.usuario_permissoes (usuario_id, recurso, acao) values (v_zero, 'execucao.cronogramas', 'ver');
  set local role authenticated;
  r := r || jsonb_build_object('3c_zero_fora_da_lista', (select count(*) from public.ex_cronogramas));
  reset role;

  -- 3d. Tiago põe o zero na lista: zero vê 1.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.fn_ex_acesso_definir(v_obra2, v_zero, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('3d_zero_na_lista', (select count(*) from public.ex_cronogramas));
  reset role;

  -- 3e. Zero desativado: deixa de ver na hora, e a RPC recusa. Esperado: 0 e "recusou: ..."
  update public.usuarios set ativo = false where id = v_zero;
  insert into public.usuario_permissoes (usuario_id, recurso, acao) values (v_zero, 'execucao.cronogramas', 'editar');
  set local role authenticated;
  r := r || jsonb_build_object('3e_desativado_ve', (select count(*) from public.ex_cronogramas));
  begin perform public.fn_ex_cronograma_salvar(jsonb_build_object('codigo', 'FUND', 'nome', 'Mudou', 'data_inicio', '2026-03-02'), v_cron);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3e_desativado_edita', v_txt);
  reset role;
  update public.usuarios set ativo = true where id = v_zero;
  delete from public.usuario_permissoes where usuario_id = v_zero and recurso like 'execucao.%';

  -- 3f. Tirar o último da lista é recusado. Esperado: "recusou: A obra não pode ficar sem ninguém na lista"
  delete from public.ex_obra_usuarios where obra_id = v_obra2 and usuario_id <> v_tiago;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.fn_ex_acesso_definir(v_obra2, v_tiago, false);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3f_ultimo_da_lista', v_txt);

  -- 3g. Código repetido na mesma obra. Esperado: "recusou: Já existe outro cronograma com o código FUND nesta obra"
  begin perform public.fn_ex_cronograma_salvar(jsonb_build_object('obra_id', v_obra2, 'codigo', 'fund', 'nome', 'Outra', 'data_inicio', '2026-03-02'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3g_codigo_repetido', v_txt);

  -- 3j. Feriado pelo app: 24/12/2026 (quinta) vira feriado nacional e sai dos dias úteis; excluir devolve.
  --     Esperado: {"antes": true, "feriado": false, "depois": true}
  declare v_fer uuid;
  begin
    r := r || jsonb_build_object('3j_feriado_app', jsonb_build_object(
      'antes', exists (select 1 from public.fn_ex_dias_uteis((select id from public.ex_calendarios where padrao_empresa), '2026-12-24', '2026-12-24'))));
    v_fer := public.fn_ex_feriado_salvar(jsonb_build_object('data', '2026-12-24', 'nome', 'Véspera de Natal', 'abrangencia', 'nacional'));
    r := r || jsonb_build_object('3j_feriado', exists (select 1 from public.fn_ex_dias_uteis((select id from public.ex_calendarios where padrao_empresa), '2026-12-24', '2026-12-24')));
    perform public.fn_ex_feriado_excluir(v_fer);
    r := r || jsonb_build_object('3j_depois', exists (select 1 from public.fn_ex_dias_uteis((select id from public.ex_calendarios where padrao_empresa), '2026-12-24', '2026-12-24')));
  end;

  -- 3k, 3l, 3m. Padrão da empresa e entrada nula. Usa os valores atuais do Padrão EMT, então nada mais muda.
  --     Esperado: 3k true; 3l "recusou: Escolha outro calendário como padrão da empresa antes de tirar este";
  --     3m "recusou: Situação inválida"
  declare v_pad uuid; v_dados jsonb;
  begin
    select id, to_jsonb(c) - 'padrao_empresa' into v_pad, v_dados from public.ex_calendarios c where padrao_empresa and excluido_em is null;
    perform public.fn_ex_calendario_salvar(v_dados, v_pad);
    r := r || jsonb_build_object('3k_edita_padrao_mantem', (select padrao_empresa from public.ex_calendarios where id = v_pad));
    begin perform public.fn_ex_calendario_salvar(v_dados || '{"padrao_empresa": false}'::jsonb, v_pad);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('3l_tirar_padrao', v_txt);
    begin perform public.fn_ex_cronograma_status(v_cron, null);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('3m_status_nulo', v_txt);
  end;

  -- 3h. Local em ciclo: B filho de A, depois A filho de B. Esperado: "recusou: ..."
  declare v_la uuid; v_lb uuid;
  begin
    v_la := public.fn_ex_local_salvar(v_obra2, jsonb_build_object('tipo', 'bloco', 'codigo', 'A', 'nome', 'Bloco A'));
    v_lb := public.fn_ex_local_salvar(v_obra2, jsonb_build_object('tipo', 'pavimento', 'codigo', 'A-T', 'nome', 'Térreo', 'pai_id', v_la));
    begin perform public.fn_ex_local_salvar(v_obra2, jsonb_build_object('tipo', 'bloco', 'codigo', 'A', 'nome', 'Bloco A', 'pai_id', v_lb), v_la);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('3h_local_em_ciclo', v_txt);
  end;
  reset role;

  -- 3i. Zero com criar, fora da lista, tenta criar cronograma numa obra que já tem pasta.
  --     Esperado: "recusou: Esta obra já tem cronogramas e você não está na lista de acesso dela..."
  insert into public.usuario_permissoes (usuario_id, recurso, acao) values (v_zero, 'execucao.cronogramas', 'criar');
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.fn_ex_cronograma_salvar(jsonb_build_object('obra_id', v_obra2, 'codigo', 'OUTRO', 'nome', 'Outro', 'data_inicio', '2026-03-02'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3i_criar_fora_da_lista', v_txt);
  reset role;
  delete from public.usuario_permissoes where usuario_id = v_zero and recurso like 'execucao.%';

  -- 5. Lote de atividades no cronograma FUND da obra 2 (calendário Padrão EMT: sáb 5 h conta, dom não).
  --    Dias úteis desde 02/03/2026: 0=02, 1=03, 2=04, 3=05, 4=06, 5=07 (sáb), 6=09, 7=10, 8=11, 9=12, 10=13.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- 5a. 1.1 por produtividade 100 / 30 = 4 dias (02/03 a 05/03); 1.2 com 5 dias, 1.1 TI+2: 09/03 a 13/03.
  v_ids := public.fn_ex_atividades_salvar_lote(v_cron, jsonb_build_array(
    jsonb_build_object('codigo', '1', 'nome', 'Fundação', 'tipo', 'resumo'),
    jsonb_build_object('codigo', '1.1', 'nome', 'Estacas', 'pai_codigo', '1', 'modo_duracao', 'por_produtividade',
                       'quantidade', 100, 'produtividade', 30),
    jsonb_build_object('codigo', '1.2', 'nome', 'Blocos', 'pai_codigo', '1', 'duracao_dias', 5,
                       'predecessoras', jsonb_build_array(jsonb_build_object('codigo', '1.1', 'tipo', 'TI', 'atraso', 2)))));
  v_r1 := (v_ids -> 'ids' ->> '1')::uuid; v_11 := (v_ids -> 'ids' ->> '1.1')::uuid; v_12 := (v_ids -> 'ids' ->> '1.2')::uuid;
  r := r || jsonb_build_object('5a_lote', (select jsonb_object_agg(a.codigo, jsonb_build_array(d.inicio_cedo, d.fim_cedo, a.duracao_dias))
    from public.ex_atividades a join public.ex_atividade_datas d on d.atividade_id = a.id where a.cronograma_id = v_cron));

  -- 5b. Ciclo: 1.1 passa a depender de 1.2. Recusa e nada muda (continua 1 vínculo).
  begin perform public.fn_ex_atividades_salvar_lote(v_cron, jsonb_build_array(jsonb_build_object('id', v_11,
      'predecessoras', jsonb_build_array(jsonb_build_object('codigo', '1.2')))));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5b_ciclo', v_txt, '5b_vinculos', (select count(*) from public.ex_dependencias where cronograma_id = v_cron));

  -- 5c. Código repetido no mesmo lote.
  begin perform public.fn_ex_atividades_salvar_lote(v_cron, jsonb_build_array(
      jsonb_build_object('codigo', 'X', 'nome', 'Um'), jsonb_build_object('codigo', 'X', 'nome', 'Dois')));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5c_codigo_repetido', v_txt);

  -- 5d. Linha com filhas deixando de ser resumo.
  begin perform public.fn_ex_atividades_salvar_lote(v_cron, jsonb_build_array(jsonb_build_object('id', v_r1, 'tipo', 'atividade')));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5d_filhas_sem_resumo', v_txt);

  -- 5e. Linha só com código e nome: duração 1.
  perform public.fn_ex_atividades_salvar_lote(v_cron, jsonb_build_array(jsonb_build_object('codigo', '2', 'nome', 'Limpeza')));
  r := r || jsonb_build_object('5e_duracao_padrao', (select duracao_dias from public.ex_atividades where cronograma_id = v_cron and codigo = '2' and excluido_em is null));

  -- 5f. Versão desatualizada (outra aba gravou antes).
  begin perform public.fn_ex_atividades_salvar_lote(v_cron, jsonb_build_array(jsonb_build_object('id', v_12,
      'versao', '2000-01-01T00:00:00Z', 'nome', 'Outro nome')));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5f_versao', v_txt);

  -- 5g. Mudança parcial: só o nome. Duração, pai e vínculo ficam.
  perform public.fn_ex_atividades_salvar_lote(v_cron, jsonb_build_array(jsonb_build_object('id', v_12, 'nome', 'Blocos de coroamento')));
  r := r || jsonb_build_object('5g_parcial', (select jsonb_build_object('nome', a.nome, 'duracao', a.duracao_dias, 'pai', p.codigo,
      'vinculos', (select count(*) from public.ex_dependencias where sucessora_id = a.id))
    from public.ex_atividades a join public.ex_atividades p on p.id = a.pai_id where a.id = v_12));

  -- 5h. Excluir o resumo leva as filhas e os vínculos; o cache fica só com a linha 2.
  v_n := public.fn_ex_atividades_excluir(v_cron, array[v_r1], 'Prova');  -- em comando próprio: o snapshot do comando não enxerga o que a função grava
  r := r || jsonb_build_object('5h_excluidas', v_n,
    '5h_vivas', (select jsonb_agg(codigo order by codigo) from public.ex_atividades where cronograma_id = v_cron and excluido_em is null),
    '5h_datas', (select count(*) from public.ex_atividade_datas where cronograma_id = v_cron),
    '5h_vinculos', (select count(*) from public.ex_dependencias where cronograma_id = v_cron));

  -- 5i. Linha nova "X" com ordem 0 e renumerar: X vira 1, Limpeza continua 2.
  perform public.fn_ex_atividades_salvar_lote(v_cron, jsonb_build_array(jsonb_build_object('codigo', 'X', 'nome', 'Nova', 'ordem', 0)));
  perform public.fn_ex_eap_renumerar(v_cron);
  r := r || jsonb_build_object('5i_renumerar', (select jsonb_agg(jsonb_build_array(codigo, nome) order by ordem)
    from public.ex_atividades where cronograma_id = v_cron and excluido_em is null));
  reset role;

  -- 5j. Zero sem permissão nenhuma.
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.fn_ex_atividades_salvar_lote(v_cron, jsonb_build_array(jsonb_build_object('codigo', 'Z', 'nome', 'Z')));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5j_sem_permissao', v_txt);
  reset role;

  -- 6. Views. Esperado: 6a true; 6b {"linhas": 2, "com_versao": 2}; 6c false; 6d true
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('6a_pasta_existe', exists (select 1 from public.ex_v_pastas where obra_id = v_obra2 and n_cronogramas = 1));
  r := r || jsonb_build_object('6b_atividades', (select jsonb_build_object('linhas', count(*), 'com_versao', count(versao))
    from public.ex_v_atividades where cronograma_id = v_cron));
  perform public.fn_ex_cronograma_excluir(v_cron, 'Prova: a pasta some');
  r := r || jsonb_build_object('6c_pasta_some', exists (select 1 from public.ex_v_pastas where obra_id = v_obra2));
  reset role;
  insert into public.usuario_permissoes (usuario_id, recurso, acao) values (v_zero, 'execucao.cronogramas', 'ver');
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('6d_unidades_visiveis', (select count(*) > 0 from public.unidades_medida));
  reset role;
  delete from public.usuario_permissoes where usuario_id = v_zero and recurso like 'execucao.%';

  -- 4. CPM (tabela feita à mão no plano, Task 3)
  declare v_c4 uuid; v_cal4 uuid; v_a uuid; v_b uuid; v_cc uuid; v_d uuid; v_e uuid; v_f uuid; v_m uuid; v_res uuid; v_t0 timestamptz;
  begin
    select gen_random_uuid() into v_c4;
    insert into public.ex_calendarios (nome, horas_seg, horas_ter, horas_qua, horas_qui, horas_sex, feriados_abrangencia)
    values ('Prova CPM', 8, 8, 8, 8, 8, '{}') returning id into v_cal4;
    select id into v_obra from public.obras where ativo order by nome limit 1;
    insert into public.ex_obras (obra_id, tipo_obra) values (v_obra, 'edificacao') on conflict (obra_id) do nothing;
    insert into public.ex_cronogramas (id, obra_id, codigo, nome, calendario_id, data_inicio)
    values (v_c4, v_obra, 'PROVA4', 'Prova CPM', v_cal4, '2026-03-02');
    insert into public.ex_atividades (cronograma_id, obra_id, tipo, codigo, nome, ordem, duracao_dias)
    values (v_c4, v_obra, 'resumo', '1', 'Resumo', 1, 0) returning id into v_res;
    insert into public.ex_atividades (cronograma_id, obra_id, pai_id, codigo, nome, ordem, duracao_dias) values
      (v_c4, v_obra, v_res, '1.1', 'A', 2, 3) returning id into v_a;
    insert into public.ex_atividades (cronograma_id, obra_id, pai_id, codigo, nome, ordem, duracao_dias) values
      (v_c4, v_obra, v_res, '1.2', 'B', 3, 2) returning id into v_b;
    insert into public.ex_atividades (cronograma_id, obra_id, pai_id, codigo, nome, ordem, duracao_dias) values
      (v_c4, v_obra, v_res, '1.3', 'C', 4, 4) returning id into v_cc;
    insert into public.ex_atividades (cronograma_id, obra_id, codigo, nome, ordem, duracao_dias) values
      (v_c4, v_obra, '2', 'D', 5, 2) returning id into v_d;
    insert into public.ex_atividades (cronograma_id, obra_id, codigo, nome, ordem, duracao_dias) values
      (v_c4, v_obra, '3', 'E', 6, 1) returning id into v_e;
    insert into public.ex_atividades (cronograma_id, obra_id, codigo, nome, ordem, duracao_dias) values
      (v_c4, v_obra, '4', 'F', 7, 2) returning id into v_f;
    insert into public.ex_atividades (cronograma_id, obra_id, tipo, codigo, nome, ordem, duracao_dias) values
      (v_c4, v_obra, 'marco', '5', 'M', 8, 0) returning id into v_m;
    insert into public.ex_dependencias (cronograma_id, obra_id, predecessora_id, sucessora_id, tipo, atraso_dias) values
      (v_c4, v_obra, v_a, v_b, 'TI', 0), (v_c4, v_obra, v_a, v_cc, 'II', 1), (v_c4, v_obra, v_b, v_d, 'TT', 1),
      (v_c4, v_obra, v_cc, v_e, 'IT', 0), (v_c4, v_obra, v_a, v_f, 'TI', -1),
      (v_c4, v_obra, v_d, v_m, 'TI', 0), (v_c4, v_obra, v_cc, v_m, 'TI', 0);
    perform public.fn_ex_cpm_recalcular(v_c4);
    r := r || jsonb_build_object('4a_cpm', (select jsonb_object_agg(a.codigo, jsonb_build_array(
        d.inicio_cedo, d.fim_cedo, d.inicio_tarde, d.fim_tarde, d.folga_total, d.folga_livre, d.critica) order by a.codigo)
      from public.ex_atividade_datas d join public.ex_atividades a on a.id = d.atividade_id where d.cronograma_id = v_c4));

    -- 4b. "E se": B com 4 dias (ES 3, EF 7) empurra D para ES 6, EF 8 (10/03 a 11/03) e o marco para 11/03,
    --     sem gravar: o cache continua com o marco em 09/03.
    r := r || jsonb_build_object('4b_e_se', jsonb_build_object(
      'marco_simulado', (select inicio_cedo from public.fn_ex_cpm_calcular(v_c4, jsonb_build_object('duracoes', jsonb_build_object(v_b::text, 4))) where atividade_id = v_m),
      'marco_gravado', (select inicio_cedo from public.ex_atividade_datas where atividade_id = v_m)));

    -- 4c. Restrição "não antes de" num sábado (07/03): E começa no próximo dia útil, 09/03.
    update public.ex_atividades set restricao_data = 'inicio_nao_antes', restricao_data_em = '2026-03-07' where id = v_e;
    perform public.fn_ex_cpm_recalcular(v_c4);
    r := r || jsonb_build_object('4c_restricao_sabado', (select jsonb_build_array(inicio_cedo, fim_cedo) from public.ex_atividade_datas where atividade_id = v_e));

    -- 4d. Cronograma começando num domingo (01/03): a primeira atividade começa 02/03.
    update public.ex_cronogramas set data_inicio = '2026-03-01' where id = v_c4;
    perform public.fn_ex_cpm_recalcular(v_c4);
    r := r || jsonb_build_object('4d_inicio_domingo', (select inicio_cedo from public.ex_atividade_datas where atividade_id = v_a));

    -- 4e. Real: A começou 03/03 e terminou 05/03: B passa para 06/03 a 09/03; A não é crítica (concluída).
    update public.ex_atividades set inicio_real = '2026-03-03', fim_real = '2026-03-05' where id = v_a;
    perform public.fn_ex_cpm_recalcular(v_c4);
    r := r || jsonb_build_object('4e_real', jsonb_build_object(
      'a', (select jsonb_build_array(inicio_cedo, fim_cedo, critica) from public.ex_atividade_datas where atividade_id = v_a),
      'b', (select jsonb_build_array(inicio_cedo, fim_cedo) from public.ex_atividade_datas where atividade_id = v_b)));

    -- 4h. Marco ancorado em data (cronograma à parte, mesmo calendário seg a sex, início 02/03/2026).
    --     Esperado: não antes de 05/03 (quinta) = ["2026-03-05","2026-03-05"]; não antes de 07/03 (sábado) =
    --     ["2026-03-09","2026-03-09"] (próximo dia útil, nunca a sexta); real 05/03 a 05/03 = ["2026-03-05","2026-03-05"].
    --     Resumo R com R.1 concluída (real 02/03 a 03/03) e R.2 de 1 dia sem vínculo (ES 0, EF 1). O cronograma
    --     termina no marco M2 (EF 6, 09/03; L de 5 dias acaba antes, EF 5), então R.2 tem folga 6 - 1 = 5 e a folga
    --     do resumo é 5 (a concluída, com folga 0 por regra, não conta; pela regra antiga daria 0). Esperado 5.
    declare v_c6 uuid := gen_random_uuid(); v_m1 uuid; v_m2 uuid; v_m3 uuid; v_r uuid;
    begin
      insert into public.ex_cronogramas (id, obra_id, codigo, nome, calendario_id, data_inicio)
      values (v_c6, v_obra, 'PROVA6', 'Prova marcos', v_cal4, '2026-03-02');
      insert into public.ex_atividades (cronograma_id, obra_id, tipo, codigo, nome, ordem, duracao_dias, restricao_data, restricao_data_em)
      values (v_c6, v_obra, 'marco', 'M1', 'Marco quinta', 1, 0, 'inicio_nao_antes', '2026-03-05') returning id into v_m1;
      insert into public.ex_atividades (cronograma_id, obra_id, tipo, codigo, nome, ordem, duracao_dias, restricao_data, restricao_data_em)
      values (v_c6, v_obra, 'marco', 'M2', 'Marco sábado', 2, 0, 'inicio_nao_antes', '2026-03-07') returning id into v_m2;
      insert into public.ex_atividades (cronograma_id, obra_id, tipo, codigo, nome, ordem, duracao_dias, inicio_real, fim_real)
      values (v_c6, v_obra, 'marco', 'M3', 'Marco real', 3, 0, '2026-03-05', '2026-03-05') returning id into v_m3;
      insert into public.ex_atividades (cronograma_id, obra_id, tipo, codigo, nome, ordem, duracao_dias)
      values (v_c6, v_obra, 'resumo', 'R', 'Resumo', 4, 0) returning id into v_r;
      insert into public.ex_atividades (cronograma_id, obra_id, pai_id, codigo, nome, ordem, duracao_dias, inicio_real, fim_real)
      values (v_c6, v_obra, v_r, 'R.1', 'Concluída', 5, 2, '2026-03-02', '2026-03-03');
      insert into public.ex_atividades (cronograma_id, obra_id, pai_id, codigo, nome, ordem, duracao_dias)
      values (v_c6, v_obra, v_r, 'R.2', 'Aberta', 6, 1);
      insert into public.ex_atividades (cronograma_id, obra_id, codigo, nome, ordem, duracao_dias)
      values (v_c6, v_obra, 'L', 'Longa', 7, 5);
      perform public.fn_ex_cpm_recalcular(v_c6);
      r := r || jsonb_build_object('4h_marco_ancorado', jsonb_build_object(
        'nao_antes_quinta', (select jsonb_build_array(inicio_cedo, fim_cedo) from public.ex_atividade_datas where atividade_id = v_m1),
        'nao_antes_sabado', (select jsonb_build_array(inicio_cedo, fim_cedo) from public.ex_atividade_datas where atividade_id = v_m2),
        'real', (select jsonb_build_array(inicio_cedo, fim_cedo) from public.ex_atividade_datas where atividade_id = v_m3),
        'resumo_folga', (select folga_total from public.ex_atividade_datas where atividade_id = v_r)));
    end;

    -- 4f. Ciclo gravado direto (as RPCs nunca deixam): o cálculo recusa e diz as linhas.
    insert into public.ex_dependencias (cronograma_id, obra_id, predecessora_id, sucessora_id) values (v_c4, v_obra, v_m, v_a);
    begin perform public.fn_ex_cpm_recalcular(v_c4); v_txt := 'PASSOU (errado)';
    exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('4f_ciclo', v_txt);

    -- 4g. Desempenho: 3.000 atividades, ~4.500 vínculos. Meta: menos de 1.000 ms.
    declare v_c5 uuid := gen_random_uuid();
    begin
      insert into public.ex_cronogramas (id, obra_id, codigo, nome, calendario_id, data_inicio)
      values (v_c5, v_obra, 'PROVA5', 'Prova desempenho', v_cal4, '2026-03-02');
      insert into public.ex_atividades (cronograma_id, obra_id, codigo, nome, ordem, duracao_dias)
      select v_c5, v_obra, i::text, 'A' || i, i, (i % 5) + 1 from generate_series(1, 3000) i;
      insert into public.ex_dependencias (cronograma_id, obra_id, predecessora_id, sucessora_id, tipo)
      select v_c5, v_obra, p.id, s.id, 'TI' from public.ex_atividades p join public.ex_atividades s
        on s.cronograma_id = v_c5 and s.ordem = p.ordem + 1 where p.cronograma_id = v_c5
      union all
      select v_c5, v_obra, p.id, s.id, 'II' from public.ex_atividades p join public.ex_atividades s
        on s.cronograma_id = v_c5 and s.ordem = p.ordem + 3 where p.cronograma_id = v_c5 and p.ordem % 2 = 0;
      v_t0 := clock_timestamp();
      perform public.fn_ex_cpm_recalcular(v_c5);
      r := r || jsonb_build_object('4g_desempenho_ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000),
        '4g_linhas', (select count(*) from public.ex_atividade_datas where cronograma_id = v_c5));
    end;
  end;

  -- (os casos 2 a 9 entram nas tasks seguintes, sempre antes desta linha)

  -- 9. O módulo não escreveu em outro módulo. Esperado: true
  r := r || jsonb_build_object('9_outros_modulos_intactos',
    (select count(*) from public.obras) = v_obras0 and (select count(*) from public.centros_custo) = v_cc0
    and (select count(*) from public.colaboradores) = v_colab0);

  raise exception 'PROVA %', r;
end $prova$;
do $aborto$ begin raise exception 'ABORTO GARANTIDO'; end $aborto$;
rollback;
