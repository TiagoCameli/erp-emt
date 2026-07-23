-- Semeia o recurso cadastros.condicoes-pagamento (existe em recursos.ts
-- desde a migration 20260722160001, mas nunca foi concedido a ninguém —
-- a aba do cadastro faz notFound() sem 'ver', e ninguém tinha 'criar'/
-- 'editar'/'excluir' pra usar o CRUD novo).
--
-- Checado antes (MCP execute_sql, 2026-07-22):
--   - tem_permissao() é pura consulta em usuario_permissoes (sem bypass
--     de Admin em código nem em SQL) — getUsuarioLogado/temPermissao em
--     src/lib/permissoes.ts também só olham a linha em usuario_permissoes.
--     Ou seja, Admin PRECISA da seed igual qualquer outro perfil.
--   - perfil_permissoes hoje, pra todo recurso cadastros.* (unidades,
--     categorias, centros-custo, clientes, colaboradores, equipamentos,
--     fornecedores, insumos, obras): Admin tem as 4 ações (ver/criar/
--     editar/excluir) e Gestor só 'ver'. Nenhum outro perfil (Almoxarife,
--     Apontador, Compras, Engenharia, Financeiro, Mecanico, RH) tem
--     qualquer recurso de Cadastros. Replicamos o mesmo padrão aqui.
--   - usuario_permissoes tinha 0 linhas com recurso='cadastros.condicoes-pagamento'
--     pro único usuário existente (Tiago, perfil Admin) — confirma o buraco.
--
-- Padrão seguido: 20260721120001_gestao_painel_permissoes.sql (seed em
-- perfil_permissoes + sync em usuario_permissoes na mesma migration,
-- porque getUsuarioLogado lê usuario_permissoes, não perfil_permissoes).
--
-- Rollback:
--   delete from public.usuario_permissoes where recurso = 'cadastros.condicoes-pagamento';
--   delete from public.perfil_permissoes where recurso = 'cadastros.condicoes-pagamento';

-- 1) Matriz do perfil: Admin CRUD completo, Gestor só ver.
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, 'cadastros.condicoes-pagamento', a.acao
from public.perfis p
cross join (values ('ver'), ('criar'), ('editar'), ('excluir')) as a(acao)
where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, 'cadastros.condicoes-pagamento', 'ver'
from public.perfis p
where p.nome = 'Gestor'
on conflict (perfil_id, recurso, acao) do nothing;

-- 2) Permissão efetiva dos usuários que já têm esses perfis (Admin/Gestor).
insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
select u.id, pp.recurso, pp.acao, u.id
from public.usuarios u
join public.perfil_permissoes pp on pp.perfil_id = u.perfil_id
where pp.recurso = 'cadastros.condicoes-pagamento'
on conflict (usuario_id, recurso, acao) do nothing;
