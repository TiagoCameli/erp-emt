-- =============================================================
-- Fase 1 / Migration 10: insumos, equipamentos, depositos, colaboradores
-- Equipamento cria automaticamente sua etapa no centro de custo Manutencao.
-- =============================================================

-- -------------------------------------------------------------
-- insumos
-- -------------------------------------------------------------
create table public.insumos (
  id uuid primary key default gen_random_uuid(),
  codigo text,
  nome text not null,
  categoria_id uuid not null references public.categorias_insumo(id),
  unidade_id uuid not null references public.unidades_medida(id),
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.insumos is 'Materiais, pecas, oleos, combustiveis, betuminosos e servicos. Unidade definida aqui.';

create index idx_insumos_categoria on public.insumos (categoria_id);
create index idx_insumos_unidade on public.insumos (unidade_id);

create trigger trg_insumos_updated_at
  before update on public.insumos
  for each row execute function public.fn_set_updated_at();
create trigger trg_audit_insumos
  after insert or update or delete on public.insumos
  for each row execute function public.fn_audit();

alter table public.insumos enable row level security;
create policy insumos_select on public.insumos
  for select to authenticated
  using ((select public.tem_permissao('cadastros.insumos', 'ver')));
create policy insumos_insert on public.insumos
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.insumos', 'criar')));
create policy insumos_update on public.insumos
  for update to authenticated
  using ((select public.tem_permissao('cadastros.insumos', 'editar')))
  with check ((select public.tem_permissao('cadastros.insumos', 'editar')));
grant select, insert, update on table public.insumos to authenticated;

-- -------------------------------------------------------------
-- equipamentos
-- -------------------------------------------------------------
create table public.equipamentos (
  id uuid primary key default gen_random_uuid(),
  codigo text,
  descricao text not null,
  tipo text,
  marca text,
  modelo text,
  ano smallint,
  placa text,
  controle_por text not null default 'horimetro'
    check (controle_por in ('horimetro', 'km', 'nenhum')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.equipamentos is 'Frota e equipamentos. Cada um gera uma etapa no centro de custo Manutencao.';

create trigger trg_equipamentos_updated_at
  before update on public.equipamentos
  for each row execute function public.fn_set_updated_at();
create trigger trg_audit_equipamentos
  after insert or update or delete on public.equipamentos
  for each row execute function public.fn_audit();

alter table public.equipamentos enable row level security;
create policy equipamentos_select on public.equipamentos
  for select to authenticated
  using ((select public.tem_permissao('cadastros.equipamentos', 'ver')));
create policy equipamentos_insert on public.equipamentos
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.equipamentos', 'criar')));
create policy equipamentos_update on public.equipamentos
  for update to authenticated
  using ((select public.tem_permissao('cadastros.equipamentos', 'editar')))
  with check ((select public.tem_permissao('cadastros.equipamentos', 'editar')));
grant select, insert, update on table public.equipamentos to authenticated;

-- FK adiada de centros_custo.equipamento_id (agora equipamentos existe)
alter table public.centros_custo
  add constraint centros_custo_equipamento_fk
  foreign key (equipamento_id) references public.equipamentos(id);

-- Trigger: equipamento cria sua etapa (nivel 2) dentro do CC Manutencao
create or replace function public.fn_equipamento_cria_etapa_manutencao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manutencao_id uuid;
begin
  select id into v_manutencao_id
  from public.centros_custo
  where nivel = 1 and tipo = 'manutencao'
  order by created_at
  limit 1;

  if v_manutencao_id is null then
    raise exception 'Centro de custo Manutencao nao encontrado. Cadastre-o antes dos equipamentos.';
  end if;

  insert into public.centros_custo (nome, nivel, pai_id, equipamento_id, created_by)
  values (new.descricao, 2, v_manutencao_id, new.id, new.created_by);

  return new;
end $$;

revoke all on function public.fn_equipamento_cria_etapa_manutencao() from public, anon, authenticated;

create trigger trg_equipamento_cria_etapa
  after insert on public.equipamentos
  for each row execute function public.fn_equipamento_cria_etapa_manutencao();

-- -------------------------------------------------------------
-- equipamento_documentos (CRLV, seguro, laudos com vencimento)
-- -------------------------------------------------------------
create table public.equipamento_documentos (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null references public.equipamentos(id) on delete cascade,
  tipo text not null,
  descricao text,
  vencimento date,
  anexo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.equipamento_documentos is 'Documentos do equipamento com vencimento, para alertas futuros.';

create index idx_equipamento_documentos_equip on public.equipamento_documentos (equipamento_id);

create trigger trg_equipamento_documentos_updated_at
  before update on public.equipamento_documentos
  for each row execute function public.fn_set_updated_at();
create trigger trg_audit_equipamento_documentos
  after insert or update or delete on public.equipamento_documentos
  for each row execute function public.fn_audit();

alter table public.equipamento_documentos enable row level security;
-- Documentos seguem a permissao da aba Equipamentos.
create policy equipamento_documentos_select on public.equipamento_documentos
  for select to authenticated
  using ((select public.tem_permissao('cadastros.equipamentos', 'ver')));
create policy equipamento_documentos_insert on public.equipamento_documentos
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.equipamentos', 'editar')));
create policy equipamento_documentos_update on public.equipamento_documentos
  for update to authenticated
  using ((select public.tem_permissao('cadastros.equipamentos', 'editar')))
  with check ((select public.tem_permissao('cadastros.equipamentos', 'editar')));
create policy equipamento_documentos_delete on public.equipamento_documentos
  for delete to authenticated
  using ((select public.tem_permissao('cadastros.equipamentos', 'editar')));
grant select, insert, update, delete on table public.equipamento_documentos to authenticated;

-- -------------------------------------------------------------
-- depositos (centrais, de obra, almoxarifado, tanques)
-- Tanque = deposito com insumo unico.
-- -------------------------------------------------------------
create table public.depositos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null
    check (tipo in ('central', 'obra', 'almoxarifado_mecanica', 'tanque_combustivel', 'tanque_betuminoso')),
  obra_id uuid references public.obras(id),
  insumo_id uuid references public.insumos(id),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  -- Tanque exige insumo unico; deposito comum nao tem insumo fixo.
  constraint depositos_tanque_insumo_check check (
    (tipo in ('tanque_combustivel', 'tanque_betuminoso') and insumo_id is not null) or
    (tipo in ('central', 'obra', 'almoxarifado_mecanica') and insumo_id is null)
  )
);

comment on table public.depositos is 'Depositos e tanques. Tanques tem insumo unico (combustivel/betuminoso).';

create index idx_depositos_obra on public.depositos (obra_id);
create index idx_depositos_insumo on public.depositos (insumo_id);

create trigger trg_depositos_updated_at
  before update on public.depositos
  for each row execute function public.fn_set_updated_at();
create trigger trg_audit_depositos
  after insert or update or delete on public.depositos
  for each row execute function public.fn_audit();

alter table public.depositos enable row level security;
create policy depositos_select on public.depositos
  for select to authenticated
  using ((select public.tem_permissao('cadastros.depositos', 'ver')));
create policy depositos_insert on public.depositos
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.depositos', 'criar')));
create policy depositos_update on public.depositos
  for update to authenticated
  using ((select public.tem_permissao('cadastros.depositos', 'editar')))
  with check ((select public.tem_permissao('cadastros.depositos', 'editar')));
grant select, insert, update on table public.depositos to authenticated;

-- -------------------------------------------------------------
-- colaboradores (dados basicos; o resto vive no RH, Fase 7)
-- -------------------------------------------------------------
create table public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text,
  funcao text,
  vinculo text not null default 'clt' check (vinculo in ('clt', 'diarista', 'terceiro')),
  obra_id uuid references public.obras(id),
  centro_custo_id uuid references public.centros_custo(id),
  data_admissao date,
  telefone text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.colaboradores is 'Colaboradores (CLT, diaristas, terceiros). Dados completos no modulo RH.';

create index idx_colaboradores_obra on public.colaboradores (obra_id);
create index idx_colaboradores_cc on public.colaboradores (centro_custo_id);

create trigger trg_colaboradores_updated_at
  before update on public.colaboradores
  for each row execute function public.fn_set_updated_at();
create trigger trg_audit_colaboradores
  after insert or update or delete on public.colaboradores
  for each row execute function public.fn_audit();

alter table public.colaboradores enable row level security;
create policy colaboradores_select on public.colaboradores
  for select to authenticated
  using ((select public.tem_permissao('cadastros.colaboradores', 'ver')));
create policy colaboradores_insert on public.colaboradores
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.colaboradores', 'criar')));
create policy colaboradores_update on public.colaboradores
  for update to authenticated
  using ((select public.tem_permissao('cadastros.colaboradores', 'editar')))
  with check ((select public.tem_permissao('cadastros.colaboradores', 'editar')));
grant select, insert, update on table public.colaboradores to authenticated;
