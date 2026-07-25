-- Semeia o recurso cadastros.funcoes (registrado em config/recursos.ts nesta
-- mesma task) espelhando EXATAMENTE quem ja tem cadastros.unidades — mesmo
-- desenho de acesso dos cadastros simples (Admin CRUD, Gestor so ver).
-- Lido via MCP (2026-07-25): cadastros.unidades em perfil_permissoes = Admin
-- (ver/criar/editar/excluir) e Gestor (ver); usuario_permissoes = Tiago/Admin
-- (4 acoes). Copiamos as MESMAS linhas trocando so o recurso, e sincronizamos
-- usuario_permissoes (getUsuarioLogado le usuario_permissoes; sem o sync a aba
-- some do menu mesmo pro Admin). Idempotente.
--
-- Padrao seguido: 20260722160005_perm_condicoes_pagamento.sql.
--
-- Rollback:
--   delete from public.usuario_permissoes where recurso = 'cadastros.funcoes';
--   delete from public.perfil_permissoes where recurso = 'cadastros.funcoes';

-- 1) Matriz de perfil: mesmos perfis/acoes que cadastros.unidades.
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select pp.perfil_id, 'cadastros.funcoes', pp.acao
from public.perfil_permissoes pp
where pp.recurso = 'cadastros.unidades'
on conflict (perfil_id, recurso, acao) do nothing;

-- 2) Sync usuario_permissoes dos usuarios cujo perfil recebeu o recurso.
insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
select u.id, pp.recurso, pp.acao, u.id
from public.usuarios u
join public.perfil_permissoes pp on pp.perfil_id = u.perfil_id
where pp.recurso = 'cadastros.funcoes'
on conflict (usuario_id, recurso, acao) do nothing;
