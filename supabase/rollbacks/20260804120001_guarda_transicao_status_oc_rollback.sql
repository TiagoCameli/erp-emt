-- Rollback de 20260804120001_guarda_transicao_status_oc.sql.
--
-- Desfaz a guarda de transicao de status da ordem de compra. ATENCAO: sem ela
-- volta o furo de quem tem compras.ordens:editar devolver uma OC aprovada para
-- 'pendente_aprovacao' por UPDATE direto, pulando fn_desaprovar_ordem_compra e
-- deixando o lancamento financeiro pendurado na ordem.
--
-- Nenhuma funcao existente foi tocada pela migration, entao nao ha nada para
-- restaurar: e so o trigger e a funcao nova que saem.
drop trigger if exists trg_ordens_compra_status on public.ordens_compra;
drop function if exists public.fn_guarda_status_oc();

notify pgrst, 'reload schema';
