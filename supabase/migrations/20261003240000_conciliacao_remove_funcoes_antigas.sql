-- =============================================================
-- Conciliacao: remove as funcoes antigas que os Blocos B, D e E substituiram
--
-- Autorizado pelo Tiago em 03/10/2026 ("pode continuar"), depois do deploy
-- do codigo que deixou de chamar todas elas (licao de 27/08: estreitar so
-- depois do deploy).
--
-- - fn_importar_extrato(uuid, text, date, date, jsonb): substituida por
--   fn_conciliacao_importar (saldo, posicao sem FITID, ignorados, contagens).
-- - fn_conciliacao_casar(..., p_automatica boolean, p_ajustar boolean):
--   repasse para a versao com p_ajuste text (financeiro/custo).
-- - fn_conciliacao_casar_lote(jsonb): substituida por
--   fn_conciliacao_casar_lote(jsonb, boolean), que o automatico chama com
--   true e o lote revisado com false.
-- =============================================================

drop function if exists public.fn_importar_extrato(uuid, text, date, date, jsonb);
drop function if exists public.fn_conciliacao_casar(uuid, text, uuid, boolean, boolean);
drop function if exists public.fn_conciliacao_casar_lote(jsonb);
