-- Concede o recurso gestao.painel (dashboard de visão geral) aos perfis
-- Admin e Gestor, e sincroniza a permissão efetiva dos usuários desses
-- perfis (getUsuarioLogado lê usuario_permissoes, não perfil_permissoes).

-- 1) Matriz do perfil
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, 'gestao.painel', 'ver'
from public.perfis p
where p.nome in ('Admin', 'Gestor')
on conflict (perfil_id, recurso, acao) do nothing;

-- 2) Permissao efetiva dos usuarios que ja tem esses perfis
insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
select u.id, pp.recurso, pp.acao, u.id
from public.usuarios u
join public.perfil_permissoes pp on pp.perfil_id = u.perfil_id
where pp.recurso = 'gestao.painel'
on conflict (usuario_id, recurso, acao) do nothing;
