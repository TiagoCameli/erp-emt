-- =============================================================
-- Fase 0 / Migration 1: identidade e permissoes
-- usuarios, perfis, perfil_permissoes, usuario_permissoes,
-- funcao tem_permissao (base de TODA politica RLS do sistema),
-- aplicar_perfil e bootstrap do primeiro usuario como Admin.
-- =============================================================

-- updated_at automatico
create or replace function public.fn_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

revoke all on function public.fn_set_updated_at() from public, anon, authenticated;

-- -------------------------------------------------------------
-- perfis: templates de permissao (Admin, Compras, Financeiro...)
-- -------------------------------------------------------------
create table public.perfis (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.perfis is 'Templates de permissao. Aplicar um perfil preenche a matriz do usuario; ajustes individuais prevalecem depois.';

create trigger trg_perfis_updated_at
  before update on public.perfis
  for each row execute function public.fn_set_updated_at();

-- -------------------------------------------------------------
-- usuarios: espelho de auth.users com dados do app
-- -------------------------------------------------------------
create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null unique,
  ativo boolean not null default true,
  perfil_id uuid references public.perfis(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.usuarios is 'Usuarios do ERP. Desativar (ativo=false) e a forma de remover acesso; nao ha exclusao fisica.';

create index idx_usuarios_perfil on public.usuarios (perfil_id);

create trigger trg_usuarios_updated_at
  before update on public.usuarios
  for each row execute function public.fn_set_updated_at();

-- -------------------------------------------------------------
-- perfil_permissoes: o que um template concede
-- -------------------------------------------------------------
create table public.perfil_permissoes (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  recurso text not null,
  acao text not null check (acao in ('ver','criar','editar','excluir','aprovar','desaprovar')),
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (perfil_id, recurso, acao)
);

comment on table public.perfil_permissoes is 'Permissoes de um perfil. Recurso = aba de modulo (catalogo tipado em src/config/recursos.ts).';

-- -------------------------------------------------------------
-- usuario_permissoes: a matriz efetiva (fonte de verdade do RLS)
-- -------------------------------------------------------------
create table public.usuario_permissoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  recurso text not null,
  acao text not null check (acao in ('ver','criar','editar','excluir','aprovar','desaprovar')),
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (usuario_id, recurso, acao)
);

comment on table public.usuario_permissoes is 'Matriz efetiva usuario x recurso x acao. Presenca da linha = permissao concedida. E o que tem_permissao() consulta.';

create index idx_usuario_permissoes_lookup
  on public.usuario_permissoes (usuario_id, recurso, acao);

-- -------------------------------------------------------------
-- tem_permissao: usada em TODA politica RLS do sistema
-- -------------------------------------------------------------
create or replace function public.tem_permissao(p_recurso text, p_acao text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuario_permissoes up
    join public.usuarios u on u.id = up.usuario_id
    where up.usuario_id = (select auth.uid())
      and up.recurso = p_recurso
      and up.acao = p_acao
      and u.ativo
  );
$$;

revoke all on function public.tem_permissao(text, text) from public, anon;
grant execute on function public.tem_permissao(text, text) to authenticated;

-- -------------------------------------------------------------
-- aplicar_perfil: substitui a matriz do usuario pelo template
-- -------------------------------------------------------------
create or replace function public.aplicar_perfil(p_usuario_id uuid, p_perfil_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tem_permissao('administracao.usuarios', 'editar') then
    raise exception 'Sem permissao para editar permissoes de usuarios';
  end if;

  delete from public.usuario_permissoes where usuario_id = p_usuario_id;

  insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
  select p_usuario_id, pp.recurso, pp.acao, (select auth.uid())
  from public.perfil_permissoes pp
  where pp.perfil_id = p_perfil_id;

  update public.usuarios set perfil_id = p_perfil_id where id = p_usuario_id;
end $$;

revoke all on function public.aplicar_perfil(uuid, uuid) from public, anon;
grant execute on function public.aplicar_perfil(uuid, uuid) to authenticated;

-- -------------------------------------------------------------
-- Bootstrap: novo usuario em auth.users cria linha em usuarios.
-- O PRIMEIRO usuario do sistema recebe o perfil Admin completo
-- (single-tenant: o primeiro login e do dono do sistema).
-- -------------------------------------------------------------
create or replace function public.fn_handle_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text;
  v_primeiro boolean;
  v_admin_id uuid;
begin
  v_nome := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'nome'), ''),
    split_part(new.email, '@', 1)
  );

  v_primeiro := not exists (select 1 from public.usuarios);

  insert into public.usuarios (id, nome, email, created_by)
  values (new.id, v_nome, new.email, new.id)
  on conflict (id) do nothing;

  if v_primeiro then
    select id into v_admin_id from public.perfis where nome = 'Admin';
    if v_admin_id is not null then
      insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
      select new.id, pp.recurso, pp.acao, new.id
      from public.perfil_permissoes pp
      where pp.perfil_id = v_admin_id
      on conflict (usuario_id, recurso, acao) do nothing;

      update public.usuarios set perfil_id = v_admin_id where id = new.id;
    end if;
  end if;

  return new;
end $$;

revoke all on function public.fn_handle_novo_usuario() from public, anon, authenticated;

create trigger trg_novo_usuario
  after insert on auth.users
  for each row execute function public.fn_handle_novo_usuario();

-- -------------------------------------------------------------
-- RLS: 100% das tabelas, sem excecao
-- -------------------------------------------------------------
alter table public.usuarios enable row level security;
alter table public.perfis enable row level security;
alter table public.perfil_permissoes enable row level security;
alter table public.usuario_permissoes enable row level security;

-- usuarios: cada um ve o proprio registro; o resto exige permissao
create policy usuarios_select on public.usuarios
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.tem_permissao('administracao.usuarios', 'ver'))
  );

create policy usuarios_insert on public.usuarios
  for insert to authenticated
  with check ((select public.tem_permissao('administracao.usuarios', 'criar')));

create policy usuarios_update on public.usuarios
  for update to authenticated
  using ((select public.tem_permissao('administracao.usuarios', 'editar')))
  with check ((select public.tem_permissao('administracao.usuarios', 'editar')));

-- sem politica de DELETE: usuario se desativa, nunca se apaga

-- perfis: quem administra usuarios ou perfis enxerga
create policy perfis_select on public.perfis
  for select to authenticated
  using (
    (select public.tem_permissao('administracao.perfis', 'ver'))
    or (select public.tem_permissao('administracao.usuarios', 'ver'))
  );

create policy perfis_insert on public.perfis
  for insert to authenticated
  with check ((select public.tem_permissao('administracao.perfis', 'criar')));

create policy perfis_update on public.perfis
  for update to authenticated
  using ((select public.tem_permissao('administracao.perfis', 'editar')))
  with check ((select public.tem_permissao('administracao.perfis', 'editar')));

create policy perfis_delete on public.perfis
  for delete to authenticated
  using ((select public.tem_permissao('administracao.perfis', 'excluir')));

-- perfil_permissoes: acompanha perfis
create policy perfil_permissoes_select on public.perfil_permissoes
  for select to authenticated
  using (
    (select public.tem_permissao('administracao.perfis', 'ver'))
    or (select public.tem_permissao('administracao.usuarios', 'ver'))
  );

create policy perfil_permissoes_insert on public.perfil_permissoes
  for insert to authenticated
  with check ((select public.tem_permissao('administracao.perfis', 'editar')));

create policy perfil_permissoes_delete on public.perfil_permissoes
  for delete to authenticated
  using ((select public.tem_permissao('administracao.perfis', 'editar')));

-- usuario_permissoes: cada um ve as proprias; so admin de usuarios muta
create policy usuario_permissoes_select on public.usuario_permissoes
  for select to authenticated
  using (
    usuario_id = (select auth.uid())
    or (select public.tem_permissao('administracao.usuarios', 'ver'))
  );

create policy usuario_permissoes_insert on public.usuario_permissoes
  for insert to authenticated
  with check ((select public.tem_permissao('administracao.usuarios', 'editar')));

create policy usuario_permissoes_delete on public.usuario_permissoes
  for delete to authenticated
  using ((select public.tem_permissao('administracao.usuarios', 'editar')));
