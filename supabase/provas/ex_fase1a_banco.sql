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
  v_obras0 bigint; v_cc0 bigint; v_colab0 bigint;
begin
  select count(*) into v_obras0 from public.obras;
  select count(*) into v_cc0 from public.centros_custo;
  select count(*) into v_colab0 from public.colaboradores;

  -- 1. Estrutura: as tabelas existem com RLS ligada, sem grant de escrita, auditadas
  --    Esperado: 1a = 12, 1b = 0, 1c = 12
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
