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

  -- (os casos 2 a 9 entram nas tasks seguintes, sempre antes desta linha)

  -- 9. O módulo não escreveu em outro módulo. Esperado: true
  r := r || jsonb_build_object('9_outros_modulos_intactos',
    (select count(*) from public.obras) = v_obras0 and (select count(*) from public.centros_custo) = v_cc0
    and (select count(*) from public.colaboradores) = v_colab0);

  raise exception 'PROVA %', r;
end $prova$;
do $aborto$ begin raise exception 'ABORTO GARANTIDO'; end $aborto$;
rollback;
