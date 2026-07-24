-- Task 1 RH (QA #1/#2/#8): expõe dados bancários no cadastro de colaborador.
-- `salario` e `valor_diaria` já existem em `colaboradores` e já são usados
-- por `fn_gerar_folha` (coalesce(salario,0)); esta migration só acrescenta
-- as colunas de dados bancários que faltavam para o form de cadastro.
--
-- Rollback:
--   alter table public.colaboradores drop constraint if exists colaboradores_tipo_conta_check;
--   alter table public.colaboradores
--     drop column if exists banco,
--     drop column if exists agencia,
--     drop column if exists conta,
--     drop column if exists tipo_conta,
--     drop column if exists chave_pix;

alter table public.colaboradores
  add column if not exists banco text,
  add column if not exists agencia text,
  add column if not exists conta text,
  add column if not exists tipo_conta text,
  add column if not exists chave_pix text;

alter table public.colaboradores
  add constraint colaboradores_tipo_conta_check
  check (tipo_conta is null or tipo_conta in ('corrente', 'poupanca'));
