-- Advisors de seguranca (13/10/2026): tira o EXECUTE das funcoes SECURITY
-- DEFINER que so o proprio banco chama.
--
-- O Security Advisor acusa toda funcao definer executavel por `authenticated`
-- (lint 0029). As RPCs que o app chama continuam assim de proposito: cada uma
-- checa a permissao por dentro. Estas 21, nao: nenhum .rpc() do app as chama.
-- Sao helpers e travas usados por outras funcoes definer (que rodam como dono
-- e nao dependem deste grant) ou funcoes que ficaram sem uso. Abertas, elas
-- so serviam de atalho pela API, como aprovar folha de 13o ou recibo de ferias
-- sem passar a conta e a data (o app usa os *_com_pagamento desde o #363).
--
-- Ficaram de fora de proposito, apesar de nao serem chamadas pelo app:
--   fn_ve_* e fn_anexo_entidade_visivel  -> usadas em policies (RLS roda como
--                                           o usuario e precisa do EXECUTE);
--   fn_dre_linhas_do_cronograma          -> chamada pela fn_rel_dre (invoker);
--   fn_mc_acessa_contrato                -> chamada pela fn_mc_boletim (invoker).
--
-- fn_trava_saldo_inicial e o gatilho de contas_bancarias: nunca teve grant
-- explicito, entao herdava o EXECUTE de PUBLIC (lint 0028, anon). Gatilho
-- nao precisa de EXECUTE de ninguem.

revoke execute on function public.fn_trava_saldo_inicial() from public, anon, authenticated;

revoke execute on function public.fn_aprovar_decimo_terceiro(p_lote uuid) from public, anon, authenticated;
revoke execute on function public.fn_aprovar_recibo_ferias(p_ferias uuid) from public, anon, authenticated;
revoke execute on function public.fn_cdi_mensal_manual(p_mes date, p_taxa numeric) from public, anon, authenticated;
revoke execute on function public.fn_centro_custo_dependencias(p_id uuid) from public, anon, authenticated;
revoke execute on function public.fn_competencia_fechada(p_mes date) from public, anon, authenticated;
revoke execute on function public.fn_conciliacao_exigir_data_aberta(p_conta_id uuid, p_data date) from public, anon, authenticated;
revoke execute on function public.fn_conciliacao_exigir_mes_aberto(p_conta_id uuid, p_data date) from public, anon, authenticated;
revoke execute on function public.fn_conciliacao_fechar_mes(p_conta_id uuid, p_mes date) from public, anon, authenticated;
revoke execute on function public.fn_conciliacao_saldo_app(p_conta_id uuid, p_data date) from public, anon, authenticated;
revoke execute on function public.fn_conciliacao_saldo_banco(p_conta_id uuid, p_data date) from public, anon, authenticated;
revoke execute on function public.fn_conciliar_transferencia(p_transacao_id uuid, p_transferencia_id uuid) from public, anon, authenticated;
revoke execute on function public.fn_janela_pagamento() from public, anon, authenticated;
revoke execute on function public.fn_mc_exigir(p_recurso text, p_acao text, p_contrato uuid, p_mensagem text) from public, anon, authenticated;
revoke execute on function public.fn_obra_bloqueio(p_id uuid) from public, anon, authenticated;
revoke execute on function public.fn_obra_dependencias(p_id uuid) from public, anon, authenticated;
revoke execute on function public.fn_rateios_da_linha(p_linha jsonb, p_valor numeric, p_centro_padrao uuid) from public, anon, authenticated;
revoke execute on function public.fn_reclassificar_rateios_lote(p_itens jsonb, p_motivo text) from public, anon, authenticated;
revoke execute on function public.fn_salvar_aplicacao(p_id uuid, p_centro_custo_id uuid, p_conta_bancaria_id uuid, p_produto text, p_indexador text, p_taxa_percentual numeric, p_liquidez text, p_liquidez_dias smallint, p_carencia_ate date, p_vencimento date, p_tipo_ir text, p_ativa boolean, p_observacoes text) from public, anon, authenticated;
revoke execute on function public.nomes_usuarios_compras(p_ids uuid[]) from public, anon, authenticated;
revoke execute on function public.salvar_condicao_parcelas(p_condicao_id uuid, p_parcelas jsonb) from public, anon, authenticated;
