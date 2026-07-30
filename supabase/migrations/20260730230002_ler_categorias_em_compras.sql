-- Compras passou a classificar o custo na ordem de compra e na cotacao, mas a
-- unica policy de SELECT de categorias_financeiras exigia
-- financeiro.categorias.ver. Consequencia: quem tem so Compras via o Combobox de
-- categoria vazio e o embed categorias_financeiras(nome) voltava nulo na
-- listagem e no detalhe. Hoje nao doia porque os dois usuarios ativos tem as
-- duas permissoes, com 20 a 30 usuarios doeria.
-- Leitura, nao escrita: insert e update continuam presos ao financeiro.
drop policy if exists categorias_financeiras_select on public.categorias_financeiras;

create policy categorias_financeiras_select
  on public.categorias_financeiras
  for select
  to authenticated
  using (
    (select public.tem_permissao('financeiro.categorias', 'ver'))
    or (select public.tem_permissao('compras.ordens', 'ver'))
    or (select public.tem_permissao('compras.cotacoes', 'ver'))
  );
