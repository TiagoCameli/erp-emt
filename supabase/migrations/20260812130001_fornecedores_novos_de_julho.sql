-- =============================================================
-- Os quatro fornecedores que faltavam para a correcao de julho
--
-- O export de julho de 12/08/2026 traz 24 fornecedores nas 37 parcelas que
-- faltavam no ERP. Dezoito casam por nome. Dois casam por CNPJ, com razao
-- social diferente no cadastro, e por isso NAO sao criados aqui:
--
--   BRITAS DA AMAZONIA MINERACAO E COMERCIO - BRITAM  14.666.956/0001-31
--     ja existe como BRITAS DA AMAZONIA MINERACAO E COMERCIO LTDA
--   NORTE - AUTO PECAS                               34.538.850/0007-55
--     ja existe como NORTE COM. PECAS E ACESS. P/ VEIC. LTDA
--
-- Sobraram estes quatro. Procurei por "mangueira", "disk", "victor fernandes",
-- "lorenzo" e "bagnolo" no cadastro antes de inserir, e pelos dois CNPJs, para
-- nao criar duplicata. Documento so em digitos, igual ao resto da tabela.
-- =============================================================

insert into public.fornecedores (tipo, razao_social, cnpj_cpf, ativo)
select 'pj', 'CASA DAS MANGUEIRAS', '27643363000100', true
where not exists (
  select 1 from public.fornecedores
  where regexp_replace(coalesce(cnpj_cpf,''), '\D', '', 'g') = '27643363000100'
     or public.fn_chave_nome(razao_social) = public.fn_chave_nome('CASA DAS MANGUEIRAS')
);

insert into public.fornecedores (tipo, razao_social, cnpj_cpf, ativo)
select 'pj', 'DISK RAPIDO AGUA E GAS', '53595202000190', true
where not exists (
  select 1 from public.fornecedores
  where regexp_replace(coalesce(cnpj_cpf,''), '\D', '', 'g') = '53595202000190'
     or public.fn_chave_nome(razao_social) = public.fn_chave_nome('DISK RAPIDO AGUA E GAS')
);

insert into public.fornecedores (tipo, razao_social, cnpj_cpf, ativo)
select 'pf', 'JOAO VICTOR FERNANDES OLIVEIRA', null, true
where not exists (
  select 1 from public.fornecedores
  where public.fn_chave_nome(razao_social) = public.fn_chave_nome('JOAO VICTOR FERNANDES OLIVEIRA')
);

insert into public.fornecedores (tipo, razao_social, cnpj_cpf, ativo)
select 'pf', 'LORENZO DELFOR BAGNOLO', null, true
where not exists (
  select 1 from public.fornecedores
  where public.fn_chave_nome(razao_social) = public.fn_chave_nome('LORENZO DELFOR BAGNOLO')
);
