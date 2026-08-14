-- Rollback de 20260814130000_fn_lancamentos_do_recorte.sql
--
-- A função é nova e nada mais depende dela no banco (quem chama é a listagem de
-- Lançamentos, no app), então derrubar basta. Depois do rollback, a URL com
-- `recorte=` volta a não recortar nada: a lista mostra tudo e soma o valor cheio.
drop function if exists public.fn_lancamentos_do_recorte(text, text, text, text, boolean, uuid, date);
