-- =============================================================
-- Eptus: o fornecedor que so o export em nivel de parcela trouxe
--
-- A validacao do banco recusou a carga por causa de uma linha (R$ 728,37,
-- sistema de manifesto de carga, pago em 09/07/2026). E a fase 1 fazendo o
-- trabalho dela: um fornecedor faltando derruba a carga inteira antes de
-- gravar qualquer coisa, em vez de deixar a linha de fora em silencio.
--
-- Nao apareceu na conferencia anterior porque aquela usou a lista de
-- fornecedores da planilha ANTIGA (em nivel de lancamento). O export em nivel
-- de parcela tem 386 nomes sem documento contra 385 da outra: este e o de
-- diferenca.
--
-- Sem documento porque o maiscontrole nao tem o CNPJ dele. Nao inventei um.
-- =============================================================

insert into public.fornecedores (tipo, razao_social, cnpj_cpf, ativo)
select 'pj', 'Eptus Automacao Comercial Ltda Me', null, true
where not exists (
  select 1 from public.fornecedores
  where public.fn_chave_nome(razao_social)
      = public.fn_chave_nome('Eptus Automacao Comercial Ltda Me')
);
