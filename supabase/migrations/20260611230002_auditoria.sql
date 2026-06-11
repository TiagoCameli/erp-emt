-- =============================================================
-- Fase 0 / Migration 2: auditoria universal
-- audit_log + trigger generico fn_audit().
-- Toda tabela transacional do sistema recebe este trigger.
-- =============================================================

create table public.audit_log (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text,
  acao text not null check (acao in ('INSERT', 'UPDATE', 'DELETE')),
  usuario_id uuid,
  dados_antes jsonb,
  dados_depois jsonb,
  criado_em timestamptz not null default now()
);

comment on table public.audit_log is 'Trilha de auditoria universal: quem, quando, o que, valores antes e depois. Imutavel: sem UPDATE nem DELETE via API.';

create index idx_audit_log_registro on public.audit_log (tabela, registro_id);
create index idx_audit_log_usuario on public.audit_log (usuario_id);
create index idx_audit_log_criado_em on public.audit_log (criado_em desc);

-- Trigger generico. Roda como owner (security definer), entao grava
-- mesmo quando o usuario nao tem acesso direto ao audit_log.
create or replace function public.fn_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.audit_log (tabela, registro_id, acao, usuario_id, dados_antes, dados_depois)
    values (tg_table_name, to_jsonb(old) ->> 'id', tg_op, auth.uid(), to_jsonb(old), null);
    return old;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (tabela, registro_id, acao, usuario_id, dados_antes, dados_depois)
    values (tg_table_name, to_jsonb(new) ->> 'id', tg_op, auth.uid(), to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.audit_log (tabela, registro_id, acao, usuario_id, dados_antes, dados_depois)
    values (tg_table_name, to_jsonb(new) ->> 'id', tg_op, auth.uid(), null, to_jsonb(new));
    return new;
  end if;
end $$;

revoke all on function public.fn_audit() from public, anon, authenticated;

-- RLS: leitura somente com permissao; escrita so via trigger
alter table public.audit_log enable row level security;

create policy audit_log_select on public.audit_log
  for select to authenticated
  using ((select public.tem_permissao('administracao.auditoria', 'ver')));

-- sem politicas de INSERT/UPDATE/DELETE: a trilha e imutavel pela API

-- Auditoria nas tabelas de identidade e permissao
create trigger trg_audit_usuarios
  after insert or update or delete on public.usuarios
  for each row execute function public.fn_audit();

create trigger trg_audit_perfis
  after insert or update or delete on public.perfis
  for each row execute function public.fn_audit();

create trigger trg_audit_perfil_permissoes
  after insert or update or delete on public.perfil_permissoes
  for each row execute function public.fn_audit();

create trigger trg_audit_usuario_permissoes
  after insert or update or delete on public.usuario_permissoes
  for each row execute function public.fn_audit();
