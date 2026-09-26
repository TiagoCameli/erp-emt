-- Medição de Contratos, Fase 1a (correção): remove índices de coluna única que ficaram
-- redundantes depois que a migration mc_fase1a_indices_fk criou os índices compostos que
-- cobrem a mesma FK com a coluna única como prefixo (verificado em pg_indexes antes do drop).
-- mc_lancamentos_medicao_ix não entra aqui: é parcial (where excluido_em is null), serve a um
-- padrão de consulta próprio e não é coberto pelo índice composto.

drop index if exists public.mc_ajustes_item_ix;
drop index if exists public.mc_ajustes_medicao_ix;
drop index if exists public.mc_ajustes_revisao_ix;
drop index if exists public.mc_lancamentos_item_ix;
drop index if exists public.mc_medicao_eventos_medicao_ix;
drop index if exists public.mc_medicoes_versao_ix;
drop index if exists public.mc_planilha_itens_item_ix;
drop index if exists public.mc_planilha_itens_pai_ix;
