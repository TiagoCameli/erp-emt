-- =============================================================
-- Fase 1 / Migration 9: obras, clientes, fornecedores
-- Obra cria automaticamente seu centro de custo raiz (tipo obra).
-- Seeds dos centros de sistema (Escritorio Central, Manutencao).
-- =============================================================

-- -------------------------------------------------------------
-- clientes
-- -------------------------------------------------------------
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'pj' check (tipo in ('pf', 'pj')),
  nome text not null,
  nome_fantasia text,
  cpf_cnpj text,
  inscricao_estadual text,
  email text,
  telefone text,
  cidade text,
  uf text,
  endereco text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.clientes is 'Clientes (orgaos contratantes e outros). DNIT e o principal.';

create trigger trg_clientes_updated_at
  before update on public.clientes
  for each row execute function public.fn_set_updated_at();
create trigger trg_audit_clientes
  after insert or update or delete on public.clientes
  for each row execute function public.fn_audit();

alter table public.clientes enable row level security;
create policy clientes_select on public.clientes
  for select to authenticated
  using ((select public.tem_permissao('cadastros.clientes', 'ver')));
create policy clientes_insert on public.clientes
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.clientes', 'criar')));
create policy clientes_update on public.clientes
  for update to authenticated
  using ((select public.tem_permissao('cadastros.clientes', 'editar')))
  with check ((select public.tem_permissao('cadastros.clientes', 'editar')));
grant select, insert, update on table public.clientes to authenticated;

-- -------------------------------------------------------------
-- fornecedores
-- -------------------------------------------------------------
create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'pj' check (tipo in ('pf', 'pj')),
  razao_social text not null,
  nome_fantasia text,
  cnpj_cpf text,
  inscricao_estadual text,
  email text,
  telefone text,
  cidade text,
  uf text,
  endereco text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.fornecedores is 'Fornecedores de materiais, pecas, combustiveis, servicos e fretes.';

create trigger trg_fornecedores_updated_at
  before update on public.fornecedores
  for each row execute function public.fn_set_updated_at();
create trigger trg_audit_fornecedores
  after insert or update or delete on public.fornecedores
  for each row execute function public.fn_audit();

alter table public.fornecedores enable row level security;
create policy fornecedores_select on public.fornecedores
  for select to authenticated
  using ((select public.tem_permissao('cadastros.fornecedores', 'ver')));
create policy fornecedores_insert on public.fornecedores
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.fornecedores', 'criar')));
create policy fornecedores_update on public.fornecedores
  for update to authenticated
  using ((select public.tem_permissao('cadastros.fornecedores', 'editar')))
  with check ((select public.tem_permissao('cadastros.fornecedores', 'editar')));
grant select, insert, update on table public.fornecedores to authenticated;

-- -------------------------------------------------------------
-- obras
-- -------------------------------------------------------------
create table public.obras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  numero_contrato text,
  cliente_id uuid references public.clientes(id),
  rodovia text,
  lote text,
  uf text,
  extensao_km numeric(14, 3),
  data_inicio date,
  data_fim_prevista date,
  status text not null default 'em_andamento'
    check (status in ('planejamento', 'em_andamento', 'paralisada', 'concluida')),
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.obras is 'Obras (contratos DNIT). Ao criar, gera o centro de custo raiz tipo obra.';

create index idx_obras_cliente on public.obras (cliente_id);

create trigger trg_obras_updated_at
  before update on public.obras
  for each row execute function public.fn_set_updated_at();
create trigger trg_audit_obras
  after insert or update or delete on public.obras
  for each row execute function public.fn_audit();

alter table public.obras enable row level security;
create policy obras_select on public.obras
  for select to authenticated
  using ((select public.tem_permissao('cadastros.obras', 'ver')));
create policy obras_insert on public.obras
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.obras', 'criar')));
create policy obras_update on public.obras
  for update to authenticated
  using ((select public.tem_permissao('cadastros.obras', 'editar')))
  with check ((select public.tem_permissao('cadastros.obras', 'editar')));
grant select, insert, update on table public.obras to authenticated;

-- FK adiada de centros_custo.obra_id (agora obras existe)
alter table public.centros_custo
  add constraint centros_custo_obra_fk
  foreign key (obra_id) references public.obras(id);

-- -------------------------------------------------------------
-- Trigger: obra cria seu centro de custo raiz (tipo obra)
-- O created_by da obra vira o autor do centro de custo.
-- -------------------------------------------------------------
create or replace function public.fn_obra_cria_centro_custo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.centros_custo (nome, nivel, tipo, obra_id, created_by)
  values (new.nome, 1, 'obra', new.id, new.created_by);
  return new;
end $$;

revoke all on function public.fn_obra_cria_centro_custo() from public, anon, authenticated;

create trigger trg_obra_cria_centro_custo
  after insert on public.obras
  for each row execute function public.fn_obra_cria_centro_custo();

-- -------------------------------------------------------------
-- Seeds: cliente DNIT e centros de custo de sistema
-- -------------------------------------------------------------
insert into public.clientes (tipo, nome, nome_fantasia, uf)
values ('pj', 'Departamento Nacional de Infraestrutura de Transportes', 'DNIT', 'AC');

insert into public.centros_custo (nome, nivel, tipo, sistema) values
  ('Escritorio Central', 1, 'escritorio', true),
  ('Manutencao', 1, 'manutencao', true);
