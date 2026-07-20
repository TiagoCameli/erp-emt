-- Reforma A: dropa o add-on Orcamentos (EAP).
-- App layer ja removida na Task 2. Recon: orcamentos 7 linhas, orcamento_itens 2164 linhas.
-- Nenhuma tabela sobrevivente tem FK apontando para orcamentos/orcamento_itens
-- (verificado via information_schema.table_constraints). Drop autorizado pelo Tiago.

-- 1) Dropar funcoes/triggers de orcamento (cascade remove os triggers dependentes).
--    Funcoes genericas compartilhadas (fn_audit, fn_set_updated_at, fn_set_created_by,
--    tem_permissao) NAO sao dropadas aqui: sao de uso geral do sistema; os triggers que
--    as usam nas tabelas de orcamento somem junto com a propria tabela no passo 2.
drop function if exists public.fn_orcamento_rollup_trg() cascade;
drop function if exists public.fn_orcamento_item_calc() cascade;
drop function if exists public.recalcular_orcamento(uuid) cascade;

-- 2) Dropar tabelas (itens auto-ref parent_id primeiro; FK para orcamentos e obras
--    sai junto com a propria tabela).
drop table if exists public.orcamento_itens;
drop table if exists public.orcamentos;
