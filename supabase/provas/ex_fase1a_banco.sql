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

  -- (os casos 2 a 9 entram nas tasks seguintes, sempre antes desta linha)

  -- 9. O módulo não escreveu em outro módulo. Esperado: true
  r := r || jsonb_build_object('9_outros_modulos_intactos',
    (select count(*) from public.obras) = v_obras0 and (select count(*) from public.centros_custo) = v_cc0
    and (select count(*) from public.colaboradores) = v_colab0);

  raise exception 'PROVA %', r;
end $prova$;
do $aborto$ begin raise exception 'ABORTO GARANTIDO'; end $aborto$;
rollback;
