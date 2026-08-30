-- Quem pode ver os relatórios financeiros pode ler o cadastro que eles nomeiam.
--
-- O PROBLEMA, medido em 28/08/2026: a policy de SELECT de sete tabelas que a aba
-- Relatórios lê não aceita `financeiro.relatorios`. Hoje ninguém é mordido, e é
-- por acidente: os cinco usuários com relatórios também têm lançamentos, ordens,
-- categorias e insumos, e passam por outro caminho. No dia em que a Administração
-- criar um perfil só de relatórios — o "diretor que só olha", que é justamente
-- para quem esta aba existe — quatro dos nove relatórios mentem EM SILÊNCIO:
--
--   custo-grupo         : `fn_rel_custo_por_grupo` faz INNER JOIN em oc_itens,
--                         insumos e categorias_insumo. A RLS zera os três e o
--                         INNER zera o resultado: tela vazia, sem erro.
--   posicao-bancaria    : `contas_bancarias` volta vazia, `contasOcultas` dá 0 e
--                         a tela oferece "Cadastre uma conta bancária" para quem
--                         tem cinco contas na frente.
--   extrato-fornecedor  : o seletor de fornecedor vem vazio (INNER em fornecedores).
--   dre e os demais     : `left join categorias_financeiras` sobrevive com nome
--                         nulo, então os números ficam certos e os RÓTULOS somem.
--                         Uma DRE sem nome de categoria é uma coluna de valores.
--
-- ESTA MIGRATION SÓ AMPLIA. Cada policy ganha mais um `OR tem_permissao(...)`, e
-- nenhuma perde nada: quem via continua vendo. É o mesmo padrão que
-- `centros_custo` já tem desde que o mesmo defeito mordeu a tela de ordens (a
-- Andreia via 17 ordens e 0 opções, com UUID no lugar do nome).
--
-- O QUE ESTA MIGRATION NÃO FAZ, de propósito: `fornecedores` e `insumos` têm a
-- policy `to public` em vez de `to authenticated`. É inócuo hoje (o `anon` não
-- tem grant de SELECT em nenhuma das duas), e estreitar privilégio é a metade que
-- DERRUBA: vai em migration própria, depois do deploy, nunca junto da que abre.

drop policy if exists categorias_financeiras_select on public.categorias_financeiras;
create policy categorias_financeiras_select on public.categorias_financeiras
  for select to authenticated
  using (
    (select tem_permissao('cadastros.categorias-financeiras', 'ver'))
    or (select tem_permissao('compras.ordens', 'ver'))
    or (select tem_permissao('compras.cotacoes', 'ver'))
    or (select tem_permissao('financeiro.lancamentos', 'ver'))
    or (select tem_permissao('financeiro.recebimentos', 'ver'))
    or (select tem_permissao('financeiro.relatorios', 'ver'))
  );

drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes
  for select to authenticated
  using (
    (select tem_permissao('cadastros.clientes', 'ver'))
    or (select tem_permissao('financeiro.recebimentos', 'ver'))
    or (select tem_permissao('financeiro.lancamentos', 'ver'))
    or (select tem_permissao('financeiro.relatorios', 'ver'))
  );

drop policy if exists contas_bancarias_select on public.contas_bancarias;
create policy contas_bancarias_select on public.contas_bancarias
  for select to authenticated
  using (
    (select tem_permissao('financeiro.contas-bancarias', 'ver'))
    or (select tem_permissao('financeiro.lancamentos', 'ver'))
    or (select tem_permissao('financeiro.pagamentos', 'ver'))
    or (select tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
    or (select tem_permissao('financeiro.recebimentos', 'ver'))
    or (select tem_permissao('financeiro.transferencias', 'ver'))
    or (select tem_permissao('financeiro.relatorios', 'ver'))
  );

-- Ver a CONTA não é ver o SALDO dela: `saldo_inicial` fica fora do grant por
-- coluna de `authenticated`, e o valor só sai por `fn_saldos_das_contas`, que
-- filtra por `fn_pode_ver_saldo(conta)`. Esta policy solta o nome, não o dinheiro.

-- `fornecedores` e `insumos` mantêm o `to public` que já tinham: trocar por
-- `authenticated` é estreitar, e estreitar vai em migration separada.
drop policy if exists fornecedores_select on public.fornecedores;
create policy fornecedores_select on public.fornecedores
  for select
  using (
    (select tem_permissao('cadastros.fornecedores', 'ver'))
    or (select tem_permissao('compras.ordens', 'ver'))
    or (select tem_permissao('compras.cotacoes', 'ver'))
    or (select tem_permissao('financeiro.lancamentos', 'ver'))
    or (select tem_permissao('financeiro.pagamentos', 'ver'))
    or (select tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
    or (select tem_permissao('financeiro.recebimentos', 'ver'))
    or (select tem_permissao('financeiro.relatorios', 'ver'))
  );

drop policy if exists insumos_select on public.insumos;
create policy insumos_select on public.insumos
  for select
  using (
    (select tem_permissao('cadastros.insumos', 'ver'))
    or (select tem_permissao('compras.ordens', 'ver'))
    or (select tem_permissao('compras.cotacoes', 'ver'))
    or (select tem_permissao('financeiro.relatorios', 'ver'))
  );

drop policy if exists categorias_insumo_select on public.categorias_insumo;
create policy categorias_insumo_select on public.categorias_insumo
  for select to authenticated
  using (
    (select tem_permissao('cadastros.categorias', 'ver'))
    or (select tem_permissao('financeiro.relatorios', 'ver'))
  );

-- `oc_itens` é o caso mais sensível dos sete: é o item da ordem de compra, com
-- preço unitário. Mas é exatamente dele que o custo por grupo de insumo sai, e
-- quem lê o relatório já enxerga o custo agregado do mesmo dado.
drop policy if exists oc_itens_select on public.oc_itens;
create policy oc_itens_select on public.oc_itens
  for select to authenticated
  using (
    (select tem_permissao('compras.ordens', 'ver'))
    or (select tem_permissao('financeiro.relatorios', 'ver'))
  );
