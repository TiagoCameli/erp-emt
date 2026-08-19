-- =============================================================
-- Fornecedor "OUTRAS": o destino de pagamento sem dono conhecido
--
-- Pedido do Tiago: um fornecedor para quando nao se sabe quem foi o
-- fornecedor ou a quem o valor foi pago. Todo custo precisa de um
-- fornecedor no ERP, e sem um destino explicito para o desconhecido
-- a pessoa inventa um cadastro novo a cada duvida, ou pior, escolhe
-- um fornecedor errado que parecido.
--
-- Ja existia "OUTROS", que veio de UMA linha da planilha de
-- pagamentos e servia para a mesma coisa. Dois catch-all com o
-- mesmo significado sujam o seletor e dividem o mesmo custo em
-- dois nomes. Entao "OUTROS" e DESATIVADO (nao excluido: e dado do
-- Tiago, e reativar e um clique).
--
-- Nao tem documento de proposito: nao existe CNPJ do desconhecido.
-- =============================================================

insert into public.fornecedores (tipo, razao_social, observacoes, ativo)
select 'pj', 'OUTRAS',
  'Destino padrao de pagamento sem dono conhecido: use quando nao se sabe quem foi o fornecedor ou a quem o valor foi pago. Descreva na descricao do lancamento o que foi pago.',
  true
where not exists (
  select 1 from public.fornecedores
  where public.fn_chave_nome(razao_social) = public.fn_chave_nome('OUTRAS')
);

-- "OUTROS" sai do seletor, mas continua no cadastro e reativavel.
update public.fornecedores
set ativo = false,
    observacoes = concat_ws(E'\n', observacoes,
      'Substituido por "OUTRAS", o destino padrao de pagamento sem dono conhecido.')
where public.fn_chave_nome(razao_social) = public.fn_chave_nome('OUTROS')
  and ativo;
