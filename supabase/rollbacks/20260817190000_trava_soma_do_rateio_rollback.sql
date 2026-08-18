-- Rollback da trava da soma do rateio.
--
-- Atenção: sem a trava, `fn_aprovar_ordem_compra` volta a poder gravar rateio que
-- não soma o valor do lançamento (era o caso de seis das 17 ordens de 17/08/2026).
-- Só reverta junto com a migration 20260817190300, que consertou o rateio.

drop trigger if exists trg_valida_soma_do_rateio on public.lancamento_rateios;
drop function if exists public.fn_valida_soma_do_rateio();
