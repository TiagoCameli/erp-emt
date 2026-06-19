-- Fase 2 / Migration 17: permissoes dos recursos de compras
-- Admin: tudo. Gestor: ver tudo + aprovar/desaprovar pedidos e ordens.
-- Compras: ver/criar/editar pedidos, cotacoes, ordens, recebimentos.

-- Admin: todas as acoes de todos os recursos de compras
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, r.recurso, a.acao
from public.perfis p
cross join (values
  ('compras.pedidos'), ('compras.cotacoes'), ('compras.ordens'),
  ('compras.recebimentos'), ('compras.painel')
) as r(recurso)
cross join (values ('ver'), ('criar'), ('editar'), ('excluir'), ('aprovar'), ('desaprovar')) as a(acao)
where p.nome = 'Admin'
  -- painel so tem ver; cotacoes/recebimentos sem aprovar/desaprovar
  and not (r.recurso = 'compras.painel' and a.acao <> 'ver')
  and not (r.recurso in ('compras.cotacoes', 'compras.recebimentos') and a.acao in ('aprovar', 'desaprovar'))
on conflict (perfil_id, recurso, acao) do nothing;

-- Gestor: ver tudo de compras + aprovar/desaprovar pedidos e ordens
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, v.recurso, v.acao
from public.perfis p
cross join (values
  ('compras.pedidos', 'ver'), ('compras.cotacoes', 'ver'), ('compras.ordens', 'ver'),
  ('compras.recebimentos', 'ver'), ('compras.painel', 'ver'),
  ('compras.pedidos', 'aprovar'), ('compras.pedidos', 'desaprovar'),
  ('compras.ordens', 'aprovar'), ('compras.ordens', 'desaprovar')
) as v(recurso, acao)
where p.nome = 'Gestor'
on conflict (perfil_id, recurso, acao) do nothing;

-- Compras: operacao do dia a dia, sem aprovar (quem aprova e gestor/admin)
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, v.recurso, v.acao
from public.perfis p
cross join (values
  ('compras.pedidos', 'ver'), ('compras.pedidos', 'criar'), ('compras.pedidos', 'editar'),
  ('compras.cotacoes', 'ver'), ('compras.cotacoes', 'criar'), ('compras.cotacoes', 'editar'),
  ('compras.ordens', 'ver'), ('compras.ordens', 'criar'), ('compras.ordens', 'editar'),
  ('compras.recebimentos', 'ver'), ('compras.recebimentos', 'criar'), ('compras.recebimentos', 'editar'),
  ('compras.painel', 'ver')
) as v(recurso, acao)
where p.nome = 'Compras'
on conflict (perfil_id, recurso, acao) do nothing;

-- Sincroniza usuarios com perfil Admin (o Tiago) com os recursos novos
insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
select u.id, pp.recurso, pp.acao, u.id
from public.usuarios u
join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
join public.perfil_permissoes pp on pp.perfil_id = p.id
where pp.recurso like 'compras.%'
on conflict (usuario_id, recurso, acao) do nothing;
