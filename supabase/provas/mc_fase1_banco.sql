-- Prova da Fase 1 da Medição de Contratos. Migrations 20261001100000 a 20261001150000.
-- NÃO GRAVA: termina em raise exception com as medições, e o bloco de aborto garante o rollback.
-- Rodar inteira pelo MCP execute_sql. Cada caso vira uma chave em r; "recusou: ..." é o esperado
-- nos casos de trava; "PASSOU (errado)" é falha.
--
-- Números esperados, feitos à mão (seção 11 da spec):
--   K1 v0: 01 título | 01.01 3 x 0,335 = 1,005 | 01.02 3 x 0,335 = 1,005 | 01.02.01 2 x 10,004 = 20,008
--          02 título | 02.01 1 x 100 = 100 | 02.01 (código repetido) 1 x 1 = 1
--     item_por_medicao / item_por_acumulado: linhas 1,01 1,01 20,01 100 1; 01.02 subárvore 21,02;
--       grupo 01 = 22,03; grupo 02 = 101,00; total 123,03
--     sem_arredondar: 01.02 subárvore round(21,013) = 21,01; grupo 01 round(22,018) = 22,02;
--       grupo 02 = 101,00; total round(123,018) = 123,02   (o centavo do Lote 09 em miniatura)
--   K1 medições (01.01): 1ª lança 1 + 0,5 = 1,5; 2ª lança 1,5
--     item_por_medicao: 1ª 0,50; 2ª 0,50; acumulado 1,00
--     item_por_acumulado: 1ª round(0,5025) = 0,50; 2ª round(1,005) - 0,50 = 0,51; acumulado 1,01
--     sem_arredondar: 1ª 0,5025; 2ª 0,5025; acumulado round(1,005) = 1,01
--   K2 v0: 01 título | 01.01 10 x 0,335 = 3,35. 1ª medição lança 1,5, aprovada 1,2: glosa 0,3,
--     valor round(0,402) = 0,40. Aditivo 1 + v1 (a partir de 01/02): 01.01 12 x 0,4 = 4,80 e
--     01.02 novo 5 x 2 = 10,00, total v1 14,80. 2ª medição (v1) lança 1,5: valor 0,60;
--     acumulado do 01.01: quantidade 2,7, valor 1,00.

do $prova$
declare
  v_tiago constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_zero constant uuid := 'f155865b-1d4b-4b25-bf3d-54d8de9176b0';
  v_k1 uuid; v_k2 uuid; v_k3 uuid; v_n bigint; v_txt text; v_regra text; v_j jsonb; v_acc jsonb; r jsonb := '{}'::jsonb;
  v_obras0 bigint; v_cc0 bigint; v_lanc0 bigint;
begin
  select count(*) into v_obras0 from public.obras;
  select count(*) into v_cc0 from public.centros_custo;
  select count(*) into v_lanc0 from public.lancamentos;

  -- 1. Estrutura: as tabelas existem com RLS ligada e sem grant de escrita
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'mc\_%' and c.relrowsecurity;
  r := r || jsonb_build_object('1a_tabelas_com_rls', v_n);
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name like 'mc\_%' and grantee in ('authenticated', 'anon')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  r := r || jsonb_build_object('1b_grants_de_escrita', v_n);
  select count(*) into v_n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname like 'mc\_%' and t.tgname like 'trg_audit_%';
  r := r || jsonb_build_object('1c_tabelas_auditadas', v_n);

  -- [casos 2 em diante entram nas próximas tasks]

  -- 9. O módulo não escreveu em outro módulo
  r := r || jsonb_build_object('9_outros_modulos_intactos',
    (select count(*) from public.obras) = v_obras0 and (select count(*) from public.centros_custo) = v_cc0
    and (select count(*) from public.lancamentos) = v_lanc0);

  raise exception 'PROVA %', r;
end $prova$;
do $aborto$ begin raise exception 'ABORTO GARANTIDO'; end $aborto$;
