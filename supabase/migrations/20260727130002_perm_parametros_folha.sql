-- Semeia o recurso rh.parametros-folha (registrado em config/recursos.ts nesta mesma task)
-- espelhando EXATAMENTE quem ja tem rh.folha — os parametros/faixas da folha sao operados
-- por quem opera a folha gerencial. Lido via MCP (2026-07-27): rh.folha em perfil_permissoes
-- = 7 linhas (ver 3 / criar 2 / editar 2); usuario_permissoes = 6 linhas.
-- Copiamos as MESMAS linhas trocando so o recurso e sincronizamos usuario_permissoes
-- (getUsuarioLogado le usuario_permissoes; sem o sync a aba some do menu). Idempotente.
--
-- Padrao seguido: 20260727110002_perm_encargos.sql.
--
-- Rollback:
--   delete from public.usuario_permissoes where recurso = 'rh.parametros-folha';
--   delete from public.perfil_permissoes where recurso = 'rh.parametros-folha';

-- 1) Matriz de perfil: mesmos perfis/acoes que rh.folha.
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select pp.perfil_id, 'rh.parametros-folha', pp.acao
from public.perfil_permissoes pp
where pp.recurso = 'rh.folha'
on conflict (perfil_id, recurso, acao) do nothing;

-- 2) Sync usuario_permissoes dos usuarios cujo perfil recebeu o recurso.
insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
select u.id, pp.recurso, pp.acao, u.id
from public.usuarios u
join public.perfil_permissoes pp on pp.perfil_id = u.perfil_id
where pp.recurso = 'rh.parametros-folha'
on conflict (usuario_id, recurso, acao) do nothing;
