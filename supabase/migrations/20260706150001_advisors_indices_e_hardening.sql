-- Correções apontadas pelos advisors do Supabase (varredura 06/07/2026):
-- 1. Índices cobrindo as 43 foreign keys sem índice (performance de joins e cascades)
-- 2. search_path fixo nas duas trigger functions do módulo Orçamentos
-- 3. revoke de execute do public/anon nas funções que ficaram fora da convenção

-- ---------- 1. Índices de foreign keys ----------

create index if not exists idx_abastecimentos_insumo_id on public.abastecimentos (insumo_id);
create index if not exists idx_abastecimentos_movimento_id on public.abastecimentos (movimento_id);
create index if not exists idx_abastecimentos_operador_id on public.abastecimentos (operador_id);
create index if not exists idx_checklist_execucoes_checklist_id on public.checklist_execucoes (checklist_id);
create index if not exists idx_checklist_execucoes_operador_id on public.checklist_execucoes (operador_id);
create index if not exists idx_checklist_respostas_os_id on public.checklist_respostas (os_id);
create index if not exists idx_checklist_respostas_pergunta_id on public.checklist_respostas (pergunta_id);
create index if not exists idx_cotacao_fornecedores_fornecedor_id on public.cotacao_fornecedores (fornecedor_id);
create index if not exists idx_cotacao_itens_insumo_id on public.cotacao_itens (insumo_id);
create index if not exists idx_cotacoes_vencedor_fornecedor_id on public.cotacoes (vencedor_fornecedor_id);
create index if not exists idx_equipamento_planos_plano_id on public.equipamento_planos (plano_id);
create index if not exists idx_estoque_camadas_deposito_id on public.estoque_camadas (deposito_id);
create index if not exists idx_estoque_camadas_movimento_id on public.estoque_camadas (movimento_id);
create index if not exists idx_estoque_minimos_deposito_id on public.estoque_minimos (deposito_id);
create index if not exists idx_estoque_movimentos_deposito_destino_id on public.estoque_movimentos (deposito_destino_id);
create index if not exists idx_estoque_movimentos_deposito_id on public.estoque_movimentos (deposito_id);
create index if not exists idx_estoque_movimentos_equipamento_id on public.estoque_movimentos (equipamento_id);
create index if not exists idx_extrato_transacoes_conciliado_por on public.extrato_transacoes (conciliado_por);
create index if not exists idx_faturas_cliente_id on public.faturas (cliente_id);
create index if not exists idx_faturas_lancamento_id on public.faturas (lancamento_id);
create index if not exists idx_folha_itens_colaborador_id on public.folha_itens (colaborador_id);
create index if not exists idx_lancamento_parcelas_aprovado_por on public.lancamento_parcelas (aprovado_por);
create index if not exists idx_lancamento_parcelas_conta_bancaria_id on public.lancamento_parcelas (conta_bancaria_id);
create index if not exists idx_lancamento_parcelas_pago_por on public.lancamento_parcelas (pago_por);
create index if not exists idx_lancamentos_categoria_id on public.lancamentos (categoria_id);
create index if not exists idx_lancamentos_centro_custo_id on public.lancamentos (centro_custo_id);
create index if not exists idx_medicoes_planilha_id on public.medicoes (planilha_id);
create index if not exists idx_oc_itens_centro_custo_id on public.oc_itens (centro_custo_id);
create index if not exists idx_oc_itens_deposito_id on public.oc_itens (deposito_id);
create index if not exists idx_ordens_compra_aprovado_por on public.ordens_compra (aprovado_por);
create index if not exists idx_ordens_compra_cotacao_id on public.ordens_compra (cotacao_id);
create index if not exists idx_ordens_compra_pedido_id on public.ordens_compra (pedido_id);
create index if not exists idx_os_pecas_deposito_id on public.os_pecas (deposito_id);
create index if not exists idx_os_pecas_movimento_id on public.os_pecas (movimento_id);
create index if not exists idx_os_terceiros_lancamento_id on public.os_terceiros (lancamento_id);
create index if not exists idx_pedido_itens_centro_custo_id on public.pedido_itens (centro_custo_id);
create index if not exists idx_pedido_itens_deposito_id on public.pedido_itens (deposito_id);
create index if not exists idx_pedidos_aprovado_por on public.pedidos (aprovado_por);
create index if not exists idx_planilha_itens_unidade_id on public.planilha_itens (unidade_id);
create index if not exists idx_rh_adiantamentos_folha_id on public.rh_adiantamentos (folha_id);
create index if not exists idx_rh_diarias_lancamento_id on public.rh_diarias (lancamento_id);
create index if not exists idx_rh_diarias_obra_id on public.rh_diarias (obra_id);
create index if not exists idx_rh_pontos_encarregado_id on public.rh_pontos (encarregado_id);

-- Ordenação padrão da listagem de lançamentos (tela mais usada: pagina por
-- data_emissao desc, created_at desc) e filtro por tipo
create index if not exists idx_lancamentos_data_emissao_created
  on public.lancamentos (data_emissao desc, created_at desc);
create index if not exists idx_lancamentos_tipo on public.lancamentos (tipo);

-- ---------- 2. search_path fixo nas triggers do Orçamentos ----------

alter function public.fn_orcamento_item_calc() set search_path = '';
alter function public.fn_orcamento_rollup_trg() set search_path = '';

-- ---------- 3. Funções fora da convenção revoke public/anon ----------

revoke all on function public.fn_set_medicao_numero() from public, anon;
revoke all on function public.fn_check_medicao_planilha() from public, anon;
revoke all on function public.fn_check_medicao_item_planilha() from public, anon;
revoke all on function public.recalcular_orcamento(uuid) from public, anon;
