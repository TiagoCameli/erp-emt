-- Rollback de 20260822120000: remove as duas funções do relatório de custo x
-- receita.
--
-- As duas nasceram nesta migration e ninguém mais lê: só a aba "Custo x receita"
-- de Financeiro > Relatórios chama. Derrubar sem o revert do código deixa a aba
-- em erro (PostgREST não acha a função), então este rollback acompanha um revert,
-- não roda sozinho.
--
-- Nada de dado foi criado nem alterado pela migration: as duas são só leitura.

drop function if exists public.fn_rel_custo_receita(date[], uuid[], uuid[]);
drop function if exists public.fn_rel_meses_competencia();
