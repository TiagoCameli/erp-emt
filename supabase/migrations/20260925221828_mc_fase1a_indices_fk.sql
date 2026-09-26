-- Medição de Contratos, Fase 1a (correção): índices de cobertura para FK sem índice.
-- Os advisors (unindexed_foreign_keys) apontaram estas FKs das tabelas mc_ sem índice de
-- cobertura completa. Cada índice aqui cobre exatamente as colunas da FK, na mesma ordem.

create index mc_aditivos_created_by_ix on public.mc_aditivos (created_by);
create index mc_aditivos_excluido_por_ix on public.mc_aditivos (excluido_por);

create index mc_ajustes_created_by_ix on public.mc_ajustes (created_by);
create index mc_ajustes_item_contrato_ix on public.mc_ajustes (item_id, contrato_id);
create index mc_ajustes_medicao_contrato_ix on public.mc_ajustes (medicao_id, contrato_id);
create index mc_ajustes_revisao_medicao_ix on public.mc_ajustes (revisao_id, medicao_id);

create index mc_aprovacoes_item_created_by_ix on public.mc_aprovacoes_item (created_by);
create index mc_aprovacoes_item_item_contrato_ix on public.mc_aprovacoes_item (item_id, contrato_id);

create index mc_contrato_usuarios_created_by_ix on public.mc_contrato_usuarios (created_by);

create index mc_contratos_created_by_ix on public.mc_contratos (created_by);
create index mc_contratos_excluido_por_ix on public.mc_contratos (excluido_por);

create index mc_indice_valores_created_by_ix on public.mc_indice_valores (created_by);

create index mc_indices_created_by_ix on public.mc_indices (created_by);
create index mc_indices_excluido_por_ix on public.mc_indices (excluido_por);

create index mc_item_indices_created_by_ix on public.mc_item_indices (created_by);
create index mc_item_indices_indice_ix on public.mc_item_indices (indice_id);
create index mc_item_indices_item_contrato_ix on public.mc_item_indices (item_id, contrato_id);

create index mc_itens_contrato_ix on public.mc_itens (contrato_id);

create index mc_lancamentos_created_by_ix on public.mc_lancamentos (created_by);
create index mc_lancamentos_excluido_por_ix on public.mc_lancamentos (excluido_por);
create index mc_lancamentos_item_contrato_ix on public.mc_lancamentos (item_id, contrato_id);
create index mc_lancamentos_medicao_contrato_ix on public.mc_lancamentos (medicao_id, contrato_id);

create index mc_medicao_eventos_medicao_contrato_ix on public.mc_medicao_eventos (medicao_id, contrato_id);
create index mc_medicao_eventos_usuario_ix on public.mc_medicao_eventos (usuario_id);

create index mc_medicao_revisoes_created_by_ix on public.mc_medicao_revisoes (created_by);
create index mc_medicao_revisoes_medicao_contrato_ix on public.mc_medicao_revisoes (medicao_id, contrato_id);

create index mc_medicoes_aprovada_por_ix on public.mc_medicoes (aprovada_por);
create index mc_medicoes_created_by_ix on public.mc_medicoes (created_by);
create index mc_medicoes_versao_contrato_ix on public.mc_medicoes (versao_id, contrato_id);

create index mc_planilha_itens_item_contrato_ix on public.mc_planilha_itens (item_id, contrato_id);
create index mc_planilha_itens_pai_versao_ix on public.mc_planilha_itens (pai_id, versao_id);
create index mc_planilha_itens_versao_contrato_ix on public.mc_planilha_itens (versao_id, contrato_id);

create index mc_planilha_versoes_aditivo_contrato_ix on public.mc_planilha_versoes (aditivo_id, contrato_id);
create index mc_planilha_versoes_aprovada_por_ix on public.mc_planilha_versoes (aprovada_por);
create index mc_planilha_versoes_created_by_ix on public.mc_planilha_versoes (created_by);
create index mc_planilha_versoes_excluido_por_ix on public.mc_planilha_versoes (excluido_por);

create index mc_reajuste_aplicado_indice_ix on public.mc_reajuste_aplicado (indice_id);
create index mc_reajuste_aplicado_medicao_contrato_ix on public.mc_reajuste_aplicado (medicao_id, contrato_id);
create index mc_reajuste_aplicado_revisao_medicao_ix on public.mc_reajuste_aplicado (revisao_id, medicao_id);

create index mc_reajuste_aplicado_itens_indice_ix on public.mc_reajuste_aplicado_itens (indice_id);
create index mc_reajuste_aplicado_itens_item_contrato_ix on public.mc_reajuste_aplicado_itens (item_id, contrato_id);

create index mc_reajuste_config_indice_padrao_ix on public.mc_reajuste_config (indice_padrao_id);

create index mc_revisao_itens_item_contrato_ix on public.mc_revisao_itens (item_id, contrato_id);
