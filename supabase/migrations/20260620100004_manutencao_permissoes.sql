-- =============================================================
-- Fase 5 / Migration: permissões do módulo manutenção
-- Recursos: ordens-servico (ver/criar/editar), planos-preventivos
-- (ver/criar/editar/excluir), checklists (ver/criar/editar/excluir),
-- painel (ver). Semeia Admin (tudo), Mecanico e Apontador (operacional),
-- Gestor (só ver). Demais perfis ajusta-se na matriz dentro do app.
-- =============================================================

create temporary table _man_pares (recurso text, acao text) on commit drop;
insert into _man_pares (recurso, acao) values
  ('manutencao.ordens-servico','ver'),('manutencao.ordens-servico','criar'),('manutencao.ordens-servico','editar'),
  ('manutencao.planos-preventivos','ver'),('manutencao.planos-preventivos','criar'),('manutencao.planos-preventivos','editar'),('manutencao.planos-preventivos','excluir'),
  ('manutencao.checklists','ver'),('manutencao.checklists','criar'),('manutencao.checklists','editar'),('manutencao.checklists','excluir'),
  ('manutencao.painel','ver');

-- Admin: tudo.
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, m.recurso, m.acao from public.perfis p cross join _man_pares m
where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

-- Mecanico: toca OS e checklist, vê planos e painel.
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, m.recurso, m.acao from public.perfis p cross join _man_pares m
where p.nome = 'Mecanico' and (
  m.recurso = 'manutencao.ordens-servico'
  or (m.recurso = 'manutencao.checklists' and m.acao in ('ver','criar'))
  or (m.recurso = 'manutencao.planos-preventivos' and m.acao = 'ver')
  or (m.recurso = 'manutencao.painel' and m.acao = 'ver')
)
on conflict (perfil_id, recurso, acao) do nothing;

-- Apontador: executa checklist e vê o painel.
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, m.recurso, m.acao from public.perfis p cross join _man_pares m
where p.nome = 'Apontador' and (
  (m.recurso = 'manutencao.checklists' and m.acao in ('ver','criar'))
  or (m.recurso = 'manutencao.painel' and m.acao = 'ver')
)
on conflict (perfil_id, recurso, acao) do nothing;

-- Gestor: só leitura de tudo.
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, m.recurso, 'ver' from public.perfis p cross join _man_pares m
where p.nome = 'Gestor' and m.acao = 'ver'
on conflict (perfil_id, recurso, acao) do nothing;

-- Sincroniza a matriz dos usuários Admin (espelho do que a Fase 4 fez).
insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
select u.id, pp.recurso, pp.acao, u.id
from public.usuarios u
join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
join public.perfil_permissoes pp on pp.perfil_id = p.id
where pp.recurso like 'manutencao.%'
on conflict (usuario_id, recurso, acao) do nothing;
