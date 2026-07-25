-- Bloco 3 (tabela de salário por função) — FASE CONTRACT.
-- Remove as colunas antigas de colaboradores agora que o código todo usa
-- funcao_id (a função vem por join de funcoes) e o CBO vem de funcoes.cbo.
--
-- Pré-condições (verificadas antes de aplicar):
--   - grep-guard do código: nenhuma leitura/escrita de colaboradores.funcao/cbo
--     cru (só o alias funcao vindo do join de funcoes(nome)). Confirmado no
--     review da Task 3.
--   - Banco: nenhuma view/função depende de colaboradores.funcao/cbo.
--   - Backfill de funcao_id concluído (Task 1); a função ficou preservada em
--     funcoes; o cbo estava vazio.
--
-- Rollback:
--   alter table public.colaboradores add column funcao text;
--   alter table public.colaboradores add column cbo text;
--   -- (o conteúdo antigo não é restaurável; funcao vive em funcoes via funcao_id.)

alter table public.colaboradores drop column funcao;
alter table public.colaboradores drop column cbo;
