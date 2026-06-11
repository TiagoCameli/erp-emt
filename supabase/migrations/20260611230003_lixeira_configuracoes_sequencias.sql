-- =============================================================
-- Fase 0 / Migration 3: lixeira, configuracoes e numeracao
-- =============================================================

-- -------------------------------------------------------------
-- lixeira: registro central de soft deletes
-- Excluir um registro transacional = snapshot aqui + remocao da
-- tabela de origem (cada modulo implementa via funcao propria).
-- Restaurar exige permissao administracao.lixeira editar.
-- -------------------------------------------------------------
create table public.lixeira (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id text not null,
  dados jsonb not null,
  motivo text not null,
  excluido_por uuid not null,
  excluido_em timestamptz not null default now(),
  restaurado_por uuid,
  restaurado_em timestamptz
);

comment on table public.lixeira is 'Soft delete central: snapshot do registro excluido, com motivo obrigatorio. Restauravel por quem tem administracao.lixeira editar.';

create index idx_lixeira_tabela on public.lixeira (tabela, registro_id);
create index idx_lixeira_excluido_em on public.lixeira (excluido_em desc);

alter table public.lixeira enable row level security;

create policy lixeira_select on public.lixeira
  for select to authenticated
  using ((select public.tem_permissao('administracao.lixeira', 'ver')));

-- INSERT/UPDATE somente via funcoes security definer dos modulos

create trigger trg_audit_lixeira
  after insert or update or delete on public.lixeira
  for each row execute function public.fn_audit();

-- -------------------------------------------------------------
-- configuracoes: parametros do sistema (chave/valor)
-- -------------------------------------------------------------
create table public.configuracoes (
  chave text primary key,
  valor jsonb not null,
  descricao text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.configuracoes is 'Parametros do sistema: tolerancias, encargos estimados, banco de horas on/off, alertas.';

create trigger trg_configuracoes_updated_at
  before update on public.configuracoes
  for each row execute function public.fn_set_updated_at();

create trigger trg_audit_configuracoes
  after insert or update or delete on public.configuracoes
  for each row execute function public.fn_audit();

alter table public.configuracoes enable row level security;

-- leitura liberada a autenticados: o app inteiro depende dos parametros
create policy configuracoes_select on public.configuracoes
  for select to authenticated
  using (true);

create policy configuracoes_insert on public.configuracoes
  for insert to authenticated
  with check ((select public.tem_permissao('administracao.configuracoes', 'editar')));

create policy configuracoes_update on public.configuracoes
  for update to authenticated
  using ((select public.tem_permissao('administracao.configuracoes', 'editar')))
  with check ((select public.tem_permissao('administracao.configuracoes', 'editar')));

-- -------------------------------------------------------------
-- documento_sequencias: numeracao anual de documentos
-- PED-2026-0001, OC-2026-0001, OS-2026-0001...
-- -------------------------------------------------------------
create table public.documento_sequencias (
  tipo text not null,
  ano integer not null,
  proximo integer not null default 1,
  primary key (tipo, ano)
);

comment on table public.documento_sequencias is 'Sequencia anual por tipo de documento. Acesso somente via proximo_numero_documento().';

alter table public.documento_sequencias enable row level security;
-- sem politicas: acesso exclusivo via funcao security definer

create or replace function public.proximo_numero_documento(p_tipo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ano integer := extract(year from now() at time zone 'America/Rio_Branco')::integer;
  v_num integer;
begin
  insert into public.documento_sequencias (tipo, ano, proximo)
  values (p_tipo, v_ano, 1)
  on conflict (tipo, ano) do nothing;

  update public.documento_sequencias
  set proximo = proximo + 1
  where tipo = p_tipo and ano = v_ano
  returning proximo - 1 into v_num;

  return p_tipo || '-' || v_ano::text || '-' || lpad(v_num::text, 4, '0');
end $$;

revoke all on function public.proximo_numero_documento(text) from public, anon;
grant execute on function public.proximo_numero_documento(text) to authenticated;
