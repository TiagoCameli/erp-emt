-- Quem pode ver o documento pode ler o NOME do cadastro que ele referencia.
--
-- Veio de um defeito na tela: um usuário abriu uma ordem de compra e viu UUID no
-- lugar de fornecedor, centro de custo e insumo. Não era bug de renderização — as
-- políticas de leitura destas três tabelas exigiam permissão no módulo
-- **Cadastros**, e ele só tem Compras. RLS devolvia zero linhas, o seletor ficava
-- sem nenhuma opção e caía no id.
--
-- As tabelas irmãs já resolviam isso: `condicoes_pagamento` e
-- `categorias_financeiras` aceitam `compras.ordens.ver` OU `compras.cotacoes.ver`
-- além da permissão do próprio cadastro, e `formas_pagamento` é legível por
-- qualquer usuário logado. Estas três ficaram de fora, e é essa inconsistência
-- que a migration conserta.
--
-- ## Por que não é afrouxar permissão
--
-- Sem isto, a única forma de o usuário ler o nome do fornecedor da OC dele é
-- receber `cadastros.fornecedores.ver` — que abre a tela inteira de Fornecedores.
-- O que esta migration dá é MENOS que isso: só a leitura da linha, para o
-- documento que ele já pode ver ficar legível e para o seletor ter o que listar.
-- Editar, criar e excluir cadastro seguem exigindo o módulo Cadastros, porque as
-- políticas de INSERT/UPDATE/DELETE não são tocadas aqui.
--
-- Ele já vê esses nomes de qualquer jeito: o fornecedor aparece em cada linha da
-- listagem de OC, o centro de custo em cada item. Esconder a lista não escondia a
-- informação, só quebrava a tela.
--
-- ## Quem entra em cada uma, e por quê
--
-- Escolhido pelas CHAVES ESTRANGEIRAS que apontam para cada tabela, não por
-- palpite:
--
--   fornecedores  <- ordens_compra, cotacoes, cotacao_fornecedores, lancamentos
--   centros_custo <- oc_itens, lancamentos, lancamento_rateios, folha_itens,
--                    colaboradores
--   insumos       <- oc_itens, cotacao_itens
--
-- Daí os recursos: quem vê a ordem, a cotação, o lançamento, o pagamento, a folha
-- ou o colaborador precisa ler o nome que aquele documento aponta.

-- ---------------------------------------------------------------- fornecedores
drop policy if exists fornecedores_select on public.fornecedores;
create policy fornecedores_select on public.fornecedores
for select using (
  (select public.tem_permissao('cadastros.fornecedores', 'ver'))
  or (select public.tem_permissao('compras.ordens', 'ver'))
  or (select public.tem_permissao('compras.cotacoes', 'ver'))
  or (select public.tem_permissao('financeiro.lancamentos', 'ver'))
  or (select public.tem_permissao('financeiro.pagamentos', 'ver'))
  or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
  or (select public.tem_permissao('financeiro.contas-receber', 'ver'))
);

-- --------------------------------------------------------------- centros_custo
drop policy if exists centros_custo_select on public.centros_custo;
create policy centros_custo_select on public.centros_custo
for select using (
  (select public.tem_permissao('cadastros.centros-custo', 'ver'))
  or (select public.tem_permissao('compras.ordens', 'ver'))
  or (select public.tem_permissao('compras.cotacoes', 'ver'))
  or (select public.tem_permissao('financeiro.lancamentos', 'ver'))
  or (select public.tem_permissao('financeiro.relatorios', 'ver'))
  or (select public.tem_permissao('rh.folha', 'ver'))
  or (select public.tem_permissao('cadastros.colaboradores', 'ver'))
);

-- --------------------------------------------------------------------- insumos
drop policy if exists insumos_select on public.insumos;
create policy insumos_select on public.insumos
for select using (
  (select public.tem_permissao('cadastros.insumos', 'ver'))
  or (select public.tem_permissao('compras.ordens', 'ver'))
  or (select public.tem_permissao('compras.cotacoes', 'ver'))
);
