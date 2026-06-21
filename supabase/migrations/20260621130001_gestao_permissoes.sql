-- =============================================================
-- Fase 8 / Migration: permissões do módulo Gestão (BI)
-- Módulo somente leitura (vitrine): agrega dados dos outros módulos, não cria
-- tabelas. Só a ação 'ver' em cada painel. Admin e Gestor recebem.
-- =============================================================

create temporary table _gestao_pares (recurso text) on commit drop;
insert into _gestao_pares (recurso) values
  ('gestao.painel-empresa'),
  ('gestao.painel-obra'),
  ('gestao.custos'),
  ('gestao.equipamentos'),
  ('gestao.alertas');

insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, g.recurso, 'ver' from public.perfis p cross join _gestao_pares g
where p.nome in ('Admin', 'Gestor')
on conflict (perfil_id, recurso, acao) do nothing;

insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
select u.id, pp.recurso, pp.acao, u.id
from public.usuarios u
join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
join public.perfil_permissoes pp on pp.recurso like 'gestao.%' and pp.perfil_id = p.id
on conflict (usuario_id, recurso, acao) do nothing;
