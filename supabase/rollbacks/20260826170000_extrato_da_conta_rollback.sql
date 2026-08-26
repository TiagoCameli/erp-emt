-- Rollback de 20260826170000_extrato_da_conta.sql
--
-- A migration só CRIA uma função nova (`fn_extrato_conta`); não altera nem
-- substitui nada existente, então derrubar a função devolve o banco ao estado
-- anterior por completo. `fn_rel_posicao_bancaria`, `fn_saldo_conta` e o saldo
-- da listagem de contas não são tocados por ela e continuam iguais.
--
-- Cuidado óbvio, mas registrado: a tela /financeiro/contas-bancarias/[id] passa
-- a dar erro depois disto. Rodar junto com o revert do código.

drop function if exists public.fn_extrato_conta(uuid, boolean);
