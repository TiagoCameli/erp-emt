-- =============================================================
-- Fase 3 / Migration 19: categorias financeiras (plano de contas)
-- Plano de contas gerencial: receita/despesa, hierarquia simples por
-- pai_id. Base da DRE gerencial por categoria.
-- =============================================================

create table public.categorias_financeiras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('receita', 'despesa')),
  pai_id uuid references public.categorias_financeiras(id),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (nome, tipo)
);

comment on table public.categorias_financeiras is 'Plano de contas gerencial. Categoriza os lancamentos para a DRE por categoria.';

create index idx_categorias_financeiras_pai on public.categorias_financeiras (pai_id);

create trigger trg_categorias_financeiras_updated_at
  before update on public.categorias_financeiras
  for each row execute function public.fn_set_updated_at();
create trigger trg_categorias_financeiras_created_by
  before insert on public.categorias_financeiras
  for each row execute function public.fn_set_created_by();
create trigger trg_audit_categorias_financeiras
  after insert or update or delete on public.categorias_financeiras
  for each row execute function public.fn_audit();

alter table public.categorias_financeiras enable row level security;
create policy categorias_financeiras_select on public.categorias_financeiras
  for select to authenticated using ((select public.tem_permissao('financeiro.categorias', 'ver')));
create policy categorias_financeiras_insert on public.categorias_financeiras
  for insert to authenticated with check ((select public.tem_permissao('financeiro.categorias', 'criar')));
create policy categorias_financeiras_update on public.categorias_financeiras
  for update to authenticated
  using ((select public.tem_permissao('financeiro.categorias', 'editar')))
  with check ((select public.tem_permissao('financeiro.categorias', 'editar')));
grant select, insert, update on table public.categorias_financeiras to authenticated;

-- Plano de contas inicial
insert into public.categorias_financeiras (nome, tipo) values
  ('Medicoes de obra', 'receita'),
  ('Outras receitas', 'receita'),
  ('Materiais de construcao', 'despesa'),
  ('Combustiveis e lubrificantes', 'despesa'),
  ('Folha de pagamento', 'despesa'),
  ('Manutencao de equipamentos', 'despesa'),
  ('Servicos e fretes', 'despesa'),
  ('Escritorio e administrativo', 'despesa'),
  ('Impostos e taxas', 'despesa');
