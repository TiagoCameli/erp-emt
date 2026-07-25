-- Semeia o recurso cadastros.jornadas (registrado em config/recursos.ts nesta
-- mesma task) espelhando EXATAMENTE quem ja tem cadastros.funcoes — mesmo
-- desenho de acesso dos cadastros simples (Admin CRUD, Gestor so ver).
-- Lido via MCP (2026-07-25): cadastros.funcoes em perfil_permissoes = 5 linhas
-- (Admin ver/criar/editar/excluir + Gestor ver); usuario_permissoes = 4 linhas.
-- Copiamos as MESMAS linhas trocando so o recurso, e sincronizamos
-- usuario_permissoes (getUsuarioLogado le usuario_permissoes; sem o sync a aba
-- some do menu mesmo pro Admin). Idempotente.
--
-- Padrao seguido: 20260725100002_perm_funcoes.sql.
--
-- Rollback:
--   delete from public.usuario_permissoes where recurso = 'cadastros.jornadas';
--   delete from public.perfil_permissoes where recurso = 'cadastros.jornadas';

-- 1) Matriz de perfil: mesmos perfis/acoes que cadastros.funcoes.
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select pp.perfil_id, 'cadastros.jornadas', pp.acao
from public.perfil_permissoes pp
where pp.recurso = 'cadastros.funcoes'
on conflict (perfil_id, recurso, acao) do nothing;

-- 2) Sync usuario_permissoes dos usuarios cujo perfil recebeu o recurso.
insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
select u.id, pp.recurso, pp.acao, u.id
from public.usuarios u
join public.perfil_permissoes pp on pp.perfil_id = u.perfil_id
where pp.recurso = 'cadastros.jornadas'
on conflict (usuario_id, recurso, acao) do nothing;
