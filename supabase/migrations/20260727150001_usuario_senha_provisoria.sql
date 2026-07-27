-- =============================================================
-- Administracao / usuarios: senha provisoria visivel ao admin.
-- Guarda a senha provisoria (texto puro) gerada no cadastro/reset,
-- visivel SO para admin de usuarios (RLS). Removida quando o usuario
-- define a propria senha. SEM trigger de auditoria: o valor da senha
-- nunca vai para audit_log (o evento e auditado na acao sobre o usuario).
-- =============================================================

create table public.usuario_senha_provisoria (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  senha text not null,
  gerada_em timestamptz not null default now(),
  gerada_por uuid references public.usuarios(id)
);

comment on table public.usuario_senha_provisoria is
  'Senha provisoria (texto puro) de acesso pendente. Visivel so para admin de usuarios via RLS. Removida quando o usuario define a propria senha. SEM auditoria de valor.';

create index idx_usuario_senha_provisoria_gerada_por
  on public.usuario_senha_provisoria (gerada_por);

alter table public.usuario_senha_provisoria enable row level security;

-- Leitura: so quem administra usuarios
create policy usuario_senha_provisoria_select on public.usuario_senha_provisoria
  for select to authenticated
  using ((select public.tem_permissao('administracao.usuarios', 'ver')));

-- Insercao: cadastro (criar) ou reset (editar)
create policy usuario_senha_provisoria_insert on public.usuario_senha_provisoria
  for insert to authenticated
  with check (
    (select public.tem_permissao('administracao.usuarios', 'criar'))
    or (select public.tem_permissao('administracao.usuarios', 'editar'))
  );

-- Atualizacao (upsert do reset): editar
create policy usuario_senha_provisoria_update on public.usuario_senha_provisoria
  for update to authenticated
  using ((select public.tem_permissao('administracao.usuarios', 'editar')))
  with check ((select public.tem_permissao('administracao.usuarios', 'editar')));

-- Remocao: o proprio usuario limpa a sua ao definir a senha; admin tambem pode
create policy usuario_senha_provisoria_delete on public.usuario_senha_provisoria
  for delete to authenticated
  using (
    usuario_id = (select auth.uid())
    or (select public.tem_permissao('administracao.usuarios', 'editar'))
  );

grant select, insert, update, delete on table public.usuario_senha_provisoria to authenticated;
