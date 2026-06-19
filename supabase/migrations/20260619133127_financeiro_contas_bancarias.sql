-- =============================================================
-- Fase 3 / Migration 20: contas bancarias
-- Contas da EMT (Caixa, Banco do Brasil, Sicredi). O saldo do
-- sistema = saldo_inicial + parcelas pagas/recebidas na conta.
-- Escrita direta por RLS (cadastro simples, sem ciclo de status).
-- =============================================================

create table public.contas_bancarias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  banco text not null default 'outro'
    check (banco in ('caixa', 'bb', 'sicredi', 'outro')),
  agencia text,
  conta text,
  tipo text not null default 'corrente'
    check (tipo in ('corrente', 'poupanca', 'caixa')),
  saldo_inicial numeric(14, 2) not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.contas_bancarias is 'Contas bancarias da EMT: Caixa, Banco do Brasil, Sicredi. Saldo do sistema = saldo_inicial + movimentos pagos/recebidos.';

create trigger trg_contas_bancarias_updated_at
  before update on public.contas_bancarias
  for each row execute function public.fn_set_updated_at();
create trigger trg_contas_bancarias_created_by
  before insert on public.contas_bancarias
  for each row execute function public.fn_set_created_by();
create trigger trg_audit_contas_bancarias
  after insert or update or delete on public.contas_bancarias
  for each row execute function public.fn_audit();

alter table public.contas_bancarias enable row level security;
create policy contas_bancarias_select on public.contas_bancarias
  for select to authenticated using ((select public.tem_permissao('financeiro.contas-bancarias', 'ver')));
create policy contas_bancarias_insert on public.contas_bancarias
  for insert to authenticated with check ((select public.tem_permissao('financeiro.contas-bancarias', 'criar')));
create policy contas_bancarias_update on public.contas_bancarias
  for update to authenticated
  using ((select public.tem_permissao('financeiro.contas-bancarias', 'editar')))
  with check ((select public.tem_permissao('financeiro.contas-bancarias', 'editar')));
grant select, insert, update on table public.contas_bancarias to authenticated;
