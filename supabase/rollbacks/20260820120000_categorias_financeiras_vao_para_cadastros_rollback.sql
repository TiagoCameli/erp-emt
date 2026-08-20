-- Rollback de 20260820120000_categorias_financeiras_vao_para_cadastros.sql
--
-- Devolve o recurso para financeiro.categorias e recria as tres policies com a
-- chave antiga. Nao ha perda de dado: a migration so troca texto de permissao e
-- redefine policy, nunca toca em `categorias_financeiras`.
--
-- Depois de rodar isto, o codigo tem que voltar junto (a rota
-- /cadastros/categorias-financeiras e a chave nova estao no recursos.ts): rodar
-- so este arquivo deixa a tela pedindo uma permissao que ninguem mais tem.

update public.usuario_permissoes
set recurso = 'financeiro.categorias'
where recurso = 'cadastros.categorias-financeiras';

update public.perfil_permissoes
set recurso = 'financeiro.categorias'
where recurso = 'cadastros.categorias-financeiras';

drop policy if exists categorias_financeiras_select on public.categorias_financeiras;
create policy categorias_financeiras_select on public.categorias_financeiras
  for select to authenticated
  using (
    (select public.tem_permissao('financeiro.categorias', 'ver'))
    or (select public.tem_permissao('compras.ordens', 'ver'))
    or (select public.tem_permissao('compras.cotacoes', 'ver'))
    or (select public.tem_permissao('financeiro.lancamentos', 'ver'))
    or (select public.tem_permissao('financeiro.recebimentos', 'ver'))
  );

drop policy if exists categorias_financeiras_insert on public.categorias_financeiras;
create policy categorias_financeiras_insert on public.categorias_financeiras
  for insert to authenticated
  with check (
    (select public.tem_permissao('financeiro.categorias', 'criar'))
  );

drop policy if exists categorias_financeiras_update on public.categorias_financeiras;
create policy categorias_financeiras_update on public.categorias_financeiras
  for update to authenticated
  using ((select public.tem_permissao('financeiro.categorias', 'editar')))
  with check ((select public.tem_permissao('financeiro.categorias', 'editar')));
