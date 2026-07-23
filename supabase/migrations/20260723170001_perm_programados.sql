-- Semeia o recurso financeiro.programados (registrado em config/recursos.ts
-- nesta mesma tarefa, ações ver/editar) — lição do cadastro de condições
-- (20260722160005_perm_condicoes_pagamento.sql): sem seed em
-- usuario_permissoes, getUsuarioLogado não vê a permissão e a aba some do
-- menu mesmo pro Admin, mesmo com o recurso já cadastrado no TS.
--
-- Checado antes (MCP execute_sql, 2026-07-23):
--   - perfil_permissoes hoje pra financeiro.pagamentos: Admin (ver, criar),
--     Financeiro (ver, criar), Gestor (ver). Mesmo padrão de
--     financeiro.conciliacao (Admin/Financeiro full, Gestor só ver).
--   - financeiro.programados só tem as ações ver/editar (não tem criar):
--     replicamos o mesmo desenho de acesso mapeando o papel de escrita —
--     quem tem 'criar' em pagamentos (Admin, Financeiro) ganha 'editar' em
--     programados (pode programar/reprogramar data); Gestor só 'ver'
--     (só enxerga a fila, não mexe).
--   - usuario_permissoes tinha 0 linhas com recurso='financeiro.programados'
--     pro único usuário existente (Tiago, perfil Admin) — confirma o buraco.
--
-- Padrão seguido: 20260722160005_perm_condicoes_pagamento.sql (seed em
-- perfil_permissoes + sync em usuario_permissoes na mesma migration, porque
-- getUsuarioLogado lê usuario_permissoes, não perfil_permissoes).
--
-- Rollback:
--   delete from public.usuario_permissoes where recurso = 'financeiro.programados';
--   delete from public.perfil_permissoes where recurso = 'financeiro.programados';

-- 1) ver: mesmos perfis que já têm 'ver' em financeiro.pagamentos (Admin, Financeiro, Gestor)
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select pp.perfil_id, 'financeiro.programados', 'ver'
from public.perfil_permissoes pp
where pp.recurso = 'financeiro.pagamentos' and pp.acao = 'ver'
on conflict (perfil_id, recurso, acao) do nothing;

-- 2) editar: mesmos perfis que já têm 'criar' em financeiro.pagamentos (Admin, Financeiro)
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select pp.perfil_id, 'financeiro.programados', 'editar'
from public.perfil_permissoes pp
where pp.recurso = 'financeiro.pagamentos' and pp.acao = 'criar'
on conflict (perfil_id, recurso, acao) do nothing;

-- 3) sync usuario_permissoes (padrão do projeto — senão a aba some do menu)
insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
select u.id, pp.recurso, pp.acao, u.id
from public.usuarios u
join public.perfil_permissoes pp on pp.perfil_id = u.perfil_id
where pp.recurso = 'financeiro.programados'
on conflict (usuario_id, recurso, acao) do nothing;
