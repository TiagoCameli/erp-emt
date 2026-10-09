-- Execução de Obras, Fase 1a: o cache do CPM não é auditado (decisão do controlador, Task 3).
-- ex_atividade_datas é derivado e refeito inteiro por fn_ex_cpm_recalcular a cada edição; auditar gravava
-- 2 linhas no audit_log por atividade em todo recálculo e custava de 200 a 900 ms em 3.000 atividades.
-- As entradas do cálculo (ex_cronogramas, ex_atividades, ex_dependencias, calendários) continuam auditadas.
drop trigger if exists trg_audit_ex_atividade_datas on public.ex_atividade_datas;

comment on table public.ex_atividade_datas is
  'Cache derivado do CPM: datas cedo/tarde, folgas e caminho crítico. Gravado só por fn_ex_cpm_recalcular, que o refaz inteiro a cada recálculo. Não é auditado: as entradas (ex_cronogramas, ex_atividades, ex_dependencias) são.';
