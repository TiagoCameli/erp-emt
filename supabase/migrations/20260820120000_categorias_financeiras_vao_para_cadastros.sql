-- A aba "Categorias" do Financeiro passa a ser "Categorias financeiras", em
-- Cadastros (pedido do Tiago, 20/08/2026).
--
-- Plano de contas E cadastro: uma tabela de referência que classifica receita e
-- despesa, do mesmo naipe de Unidades de medida e Condições de pagamento. Só a
-- CHAVE do recurso e a rota mudam; a tabela `categorias_financeiras`, os dados e
-- as telas ficam onde estão.
--
-- Recurso: financeiro.categorias -> cadastros.categorias-financeiras
-- Rota:    /financeiro/categorias -> /cadastros/categorias-financeiras
--
-- Cuidado com o nome: Cadastros ja tem `cadastros.categorias`, que e OUTRA coisa
-- (categoria de INSUMO: Material, Mao de obra, Equipamentos, Outros). Por isso a
-- chave nova leva sobrenome, e nao herda a que ja existe -- as duas abas
-- coexistem, com permissao separada.

-- ---------------------------------------------------------------------------
-- 1. A permissao, que e texto nas duas tabelas
-- ---------------------------------------------------------------------------
-- Sem este update, todo mundo perde a aba de uma vez: quem tinha
-- financeiro.categorias deixaria de casar com a chave nova.

update public.usuario_permissoes
set recurso = 'cadastros.categorias-financeiras'
where recurso = 'financeiro.categorias';

update public.perfil_permissoes
set recurso = 'cadastros.categorias-financeiras'
where recurso = 'financeiro.categorias';

-- ---------------------------------------------------------------------------
-- 2. As policies que citavam a chave antiga
-- ---------------------------------------------------------------------------
-- Recriadas identicas, so com a chave nova. Policy que le uma chave que nao
-- existe mais NAO da erro: ela apenas nunca libera, e a tela fica em branco sem
-- mensagem nenhuma. Foi o mesmo cuidado do rename de Recebimentos (19/08).
--
-- Os outros recursos citados aqui continuam iguais: quem ve ordem de compra,
-- cotacao, lancamento ou recebimento precisa LER a categoria para a tela mostrar
-- o nome dela em vez do uuid.

drop policy if exists categorias_financeiras_select on public.categorias_financeiras;
create policy categorias_financeiras_select on public.categorias_financeiras
  for select to authenticated
  using (
    (select public.tem_permissao('cadastros.categorias-financeiras', 'ver'))
    or (select public.tem_permissao('compras.ordens', 'ver'))
    or (select public.tem_permissao('compras.cotacoes', 'ver'))
    or (select public.tem_permissao('financeiro.lancamentos', 'ver'))
    or (select public.tem_permissao('financeiro.recebimentos', 'ver'))
  );

drop policy if exists categorias_financeiras_insert on public.categorias_financeiras;
create policy categorias_financeiras_insert on public.categorias_financeiras
  for insert to authenticated
  with check (
    (select public.tem_permissao('cadastros.categorias-financeiras', 'criar'))
  );

drop policy if exists categorias_financeiras_update on public.categorias_financeiras;
create policy categorias_financeiras_update on public.categorias_financeiras
  for update to authenticated
  using (
    (select public.tem_permissao('cadastros.categorias-financeiras', 'editar'))
  )
  with check (
    (select public.tem_permissao('cadastros.categorias-financeiras', 'editar'))
  );
