-- Complemento da 20261013214158: mais 4 funcoes definer internas que nenhum
-- .rpc() do app chama. A primeira varredura contava nome citado em comentario
-- (entre crases) como uso; refeita so com nome entre aspas, sobraram estas.
--   fn_aplicar_regra_pagamento -> chamada por fn_salvar_lancamento e cia;
--   fn_centro_custo_bloqueio   -> chamada por fn_centros_custo_bloqueios e
--                                 fn_excluir_centro_custo;
--   fn_total_da_oc             -> chamada por fn_criar_ordem_compra e
--                                 fn_recalcular_total_oc;
--   fn_editar_diaria           -> sem uso no app (a tela edita pela
--                                 fn_salvar_diaria desde o #411).

revoke execute on function public.fn_aplicar_regra_pagamento(p_lanc_id uuid) from public, anon, authenticated;
revoke execute on function public.fn_centro_custo_bloqueio(p_id uuid) from public, anon, authenticated;
revoke execute on function public.fn_total_da_oc(p_oc uuid, p_frete numeric, p_outras numeric, p_impostos numeric, p_desconto numeric) from public, anon, authenticated;
revoke execute on function public.fn_editar_diaria(p_id uuid, p_colaborador uuid, p_obra uuid, p_data date, p_valor numeric, p_observacao text) from public, anon, authenticated;
