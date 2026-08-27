-- Rollback de 20260827100000_perfil_do_usuario.sql
--
-- ATENÇÃO: este rollback APAGA DADO. As colunas guardam o que cada pessoa
-- digitou sobre si (celular, CPF, RG, endereço), e derrubar a coluna leva o
-- conteúdo junto — não há como desfazer o desfazer. Antes de rodar, se houver
-- qualquer linha preenchida, salve:
--
--   select id, nome, celular, data_nascimento, cargo, ramal, cpf, rg,
--          endereco_cep, endereco_logradouro, endereco_numero,
--          endereco_complemento, endereco_bairro, endereco_cidade, endereco_uf
--   from public.usuarios
--   where celular is not null or data_nascimento is not null or cargo is not null
--      or ramal is not null or cpf is not null or rg is not null
--      or endereco_cep is not null or endereco_logradouro is not null;
--
-- A função sai primeiro: com as colunas já removidas, o corpo dela ficaria
-- inválido. `drop column` derruba os CHECKs junto, então eles não aparecem aqui.
--
-- O que a migration NÃO mexeu, e portanto este rollback não precisa restaurar:
-- as policies de `usuarios`, o trigger de auditoria e a tabela `colaboradores`.

drop function if exists public.fn_salvar_meu_perfil(
  text, date, text, text, text, text, text, text, text, text, text, text, text
);

alter table public.usuarios
  drop column if exists celular,
  drop column if exists data_nascimento,
  drop column if exists cargo,
  drop column if exists ramal,
  drop column if exists cpf,
  drop column if exists rg,
  drop column if exists endereco_cep,
  drop column if exists endereco_logradouro,
  drop column if exists endereco_numero,
  drop column if exists endereco_complemento,
  drop column if exists endereco_bairro,
  drop column if exists endereco_cidade,
  drop column if exists endereco_uf;
