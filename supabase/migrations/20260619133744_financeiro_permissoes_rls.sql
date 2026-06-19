-- =============================================================
-- Fase 3 / Migration 24: permissoes dos recursos do financeiro
-- Admin e Financeiro: operacao completa. Gestor: ve tudo + aprova/desaprova
-- pagamentos. Acoes por recurso seguem o que cada aba expoe:
--   categorias/contas-bancarias/lancamentos: ver, criar, editar, excluir
--   contas-receber/conciliacao: ver, criar, editar
--   pagamentos: ver, criar
--   aprovacao-pagamentos: ver, aprovar, desaprovar
--   relatorios: ver
-- =============================================================

-- Admin e Financeiro: operacao completa do modulo
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, v.recurso, v.acao
from public.perfis p
cross join (values
  ('financeiro.categorias', 'ver'), ('financeiro.categorias', 'criar'), ('financeiro.categorias', 'editar'), ('financeiro.categorias', 'excluir'),
  ('financeiro.contas-bancarias', 'ver'), ('financeiro.contas-bancarias', 'criar'), ('financeiro.contas-bancarias', 'editar'), ('financeiro.contas-bancarias', 'excluir'),
  ('financeiro.lancamentos', 'ver'), ('financeiro.lancamentos', 'criar'), ('financeiro.lancamentos', 'editar'), ('financeiro.lancamentos', 'excluir'),
  ('financeiro.contas-receber', 'ver'), ('financeiro.contas-receber', 'criar'), ('financeiro.contas-receber', 'editar'),
  ('financeiro.aprovacao-pagamentos', 'ver'), ('financeiro.aprovacao-pagamentos', 'aprovar'), ('financeiro.aprovacao-pagamentos', 'desaprovar'),
  ('financeiro.pagamentos', 'ver'), ('financeiro.pagamentos', 'criar'),
  ('financeiro.conciliacao', 'ver'), ('financeiro.conciliacao', 'criar'), ('financeiro.conciliacao', 'editar'),
  ('financeiro.relatorios', 'ver')
) as v(recurso, acao)
where p.nome in ('Admin', 'Financeiro')
on conflict (perfil_id, recurso, acao) do nothing;

-- Gestor: ve tudo do financeiro + aprova/desaprova pagamentos
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, v.recurso, v.acao
from public.perfis p
cross join (values
  ('financeiro.categorias', 'ver'),
  ('financeiro.contas-bancarias', 'ver'),
  ('financeiro.lancamentos', 'ver'),
  ('financeiro.contas-receber', 'ver'),
  ('financeiro.aprovacao-pagamentos', 'ver'), ('financeiro.aprovacao-pagamentos', 'aprovar'), ('financeiro.aprovacao-pagamentos', 'desaprovar'),
  ('financeiro.pagamentos', 'ver'),
  ('financeiro.conciliacao', 'ver'),
  ('financeiro.relatorios', 'ver')
) as v(recurso, acao)
where p.nome = 'Gestor'
on conflict (perfil_id, recurso, acao) do nothing;

-- Sincroniza usuarios com perfil Admin (o Tiago) com os recursos novos
insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
select u.id, pp.recurso, pp.acao, u.id
from public.usuarios u
join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
join public.perfil_permissoes pp on pp.perfil_id = p.id
where pp.recurso like 'financeiro.%'
on conflict (usuario_id, recurso, acao) do nothing;
