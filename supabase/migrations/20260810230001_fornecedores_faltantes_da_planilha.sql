-- =============================================================
-- Os dois fornecedores que faltavam para a carga do historico
--
-- Conferencia exaustiva da planilha contra o cadastro: dos 406
-- documentos distintos, 405 existiam; dos 385 nomes sem documento
-- (o unico conjunto que corre risco, porque a funcao casa por
-- documento primeiro), 384 existiam. Sobraram estes dois, e nenhum
-- tem parecido no cadastro (busquei por "maciel", "votuporanga" e
-- "palace" antes de inserir, para nao criar duplicata).
--
-- Documento so em digitos, igual ao resto da tabela.
-- =============================================================

insert into public.fornecedores (tipo, razao_social, cnpj_cpf, ativo)
select 'pf', 'John Maciel de Oliveira', null, true
where not exists (
  select 1 from public.fornecedores
  where public.fn_chave_nome(razao_social) = public.fn_chave_nome('John Maciel de Oliveira')
);

insert into public.fornecedores (tipo, razao_social, cnpj_cpf, ativo)
select 'pj', 'VOTUPORANGA PALACE HOTEL', '53220695000183', true
where not exists (
  select 1 from public.fornecedores
  where regexp_replace(coalesce(cnpj_cpf,''), '\D', '', 'g') = '53220695000183'
);
