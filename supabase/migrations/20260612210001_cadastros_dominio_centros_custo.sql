-- =============================================================
-- Fase 1 / Migration 8: dominio e centros de custo
-- unidades_medida, categorias_insumo e a arvore centros_custo
-- (auto-referenciada, 3 niveis). RLS + grants + auditoria.
-- Convencao da fase: cadastro tem `ativo` (desativar e o caminho
-- normal); exclusao fisica so via fn_excluir_cadastro (migration 11),
-- entao authenticated recebe select/insert/update, nunca delete.
-- =============================================================

-- -------------------------------------------------------------
-- unidades_medida
-- Cada insumo e controlado na unidade cadastrada (sem conversao
-- automatica na v1, decisao 18 do plano).
-- -------------------------------------------------------------
create table public.unidades_medida (
  id uuid primary key default gen_random_uuid(),
  sigla text not null unique,
  nome text not null,
  tipo text not null default 'outro'
    check (tipo in ('massa', 'volume', 'comprimento', 'area', 'unidade', 'tempo', 'outro')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.unidades_medida is 'Unidades de medida dos insumos. Sem conversao automatica na v1.';

create trigger trg_unidades_medida_updated_at
  before update on public.unidades_medida
  for each row execute function public.fn_set_updated_at();

create trigger trg_audit_unidades_medida
  after insert or update or delete on public.unidades_medida
  for each row execute function public.fn_audit();

alter table public.unidades_medida enable row level security;

create policy unidades_medida_select on public.unidades_medida
  for select to authenticated
  using ((select public.tem_permissao('cadastros.unidades', 'ver')));
create policy unidades_medida_insert on public.unidades_medida
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.unidades', 'criar')));
create policy unidades_medida_update on public.unidades_medida
  for update to authenticated
  using ((select public.tem_permissao('cadastros.unidades', 'editar')))
  with check ((select public.tem_permissao('cadastros.unidades', 'editar')));

grant select, insert, update on table public.unidades_medida to authenticated;

-- -------------------------------------------------------------
-- categorias_insumo
-- Agrupador de insumos. O tipo casa com a natureza do insumo.
-- -------------------------------------------------------------
create table public.categorias_insumo (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null
    check (tipo in ('material', 'peca', 'oleo', 'combustivel', 'betuminoso', 'servico')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (nome, tipo)
);

comment on table public.categorias_insumo is 'Categorias de insumo: material, peca, oleo, combustivel, betuminoso, servico.';

create trigger trg_categorias_insumo_updated_at
  before update on public.categorias_insumo
  for each row execute function public.fn_set_updated_at();

create trigger trg_audit_categorias_insumo
  after insert or update or delete on public.categorias_insumo
  for each row execute function public.fn_audit();

alter table public.categorias_insumo enable row level security;

create policy categorias_insumo_select on public.categorias_insumo
  for select to authenticated
  using ((select public.tem_permissao('cadastros.categorias', 'ver')));
create policy categorias_insumo_insert on public.categorias_insumo
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.categorias', 'criar')));
create policy categorias_insumo_update on public.categorias_insumo
  for update to authenticated
  using ((select public.tem_permissao('cadastros.categorias', 'editar')))
  with check ((select public.tem_permissao('cadastros.categorias', 'editar')));

grant select, insert, update on table public.categorias_insumo to authenticated;

-- -------------------------------------------------------------
-- centros_custo (espinha dorsal): arvore auto-ref, 3 niveis
--   nivel 1 CENTRO  (tipo obra | escritorio | manutencao), pai nulo
--   nivel 2 ETAPA   (no centro Manutencao, cada equipamento e uma etapa)
--   nivel 3 ITEM
-- obra_id/equipamento_id ligam o no a sua origem; as FKs sao
-- adicionadas na migration 9/10 (obras/equipamentos ainda nao existem).
-- -------------------------------------------------------------
create table public.centros_custo (
  id uuid primary key default gen_random_uuid(),
  codigo text,
  nome text not null,
  nivel smallint not null check (nivel in (1, 2, 3)),
  tipo text check (tipo in ('obra', 'escritorio', 'manutencao')),
  pai_id uuid references public.centros_custo(id),
  obra_id uuid,
  equipamento_id uuid,
  orcamento numeric(14, 2),
  -- Centro de sistema (Escritorio Central, Manutencao raiz): nao se exclui.
  sistema boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  -- nivel 1 nao tem pai e exige tipo; niveis 2/3 exigem pai e nao tem tipo
  constraint centros_custo_raiz_check check (
    (nivel = 1 and pai_id is null and tipo is not null) or
    (nivel in (2, 3) and pai_id is not null and tipo is null)
  )
);

comment on table public.centros_custo is 'Arvore de centros de custo (Obra > Etapa > Item). Todo custo do sistema aponta para um no, preferencialmente o mais profundo.';

create index idx_centros_custo_pai on public.centros_custo (pai_id);
create index idx_centros_custo_obra on public.centros_custo (obra_id);
create index idx_centros_custo_equipamento on public.centros_custo (equipamento_id);
create index idx_centros_custo_tipo on public.centros_custo (tipo) where nivel = 1;

create trigger trg_centros_custo_updated_at
  before update on public.centros_custo
  for each row execute function public.fn_set_updated_at();

create trigger trg_audit_centros_custo
  after insert or update or delete on public.centros_custo
  for each row execute function public.fn_audit();

alter table public.centros_custo enable row level security;

create policy centros_custo_select on public.centros_custo
  for select to authenticated
  using ((select public.tem_permissao('cadastros.centros-custo', 'ver')));
create policy centros_custo_insert on public.centros_custo
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.centros-custo', 'criar')));
create policy centros_custo_update on public.centros_custo
  for update to authenticated
  using ((select public.tem_permissao('cadastros.centros-custo', 'editar')))
  with check ((select public.tem_permissao('cadastros.centros-custo', 'editar')));

grant select, insert, update on table public.centros_custo to authenticated;

-- -------------------------------------------------------------
-- Seeds de dominio
-- -------------------------------------------------------------
insert into public.unidades_medida (sigla, nome, tipo) values
  ('t', 'Tonelada', 'massa'),
  ('kg', 'Quilograma', 'massa'),
  ('m3', 'Metro cubico', 'volume'),
  ('L', 'Litro', 'volume'),
  ('m', 'Metro', 'comprimento'),
  ('km', 'Quilometro', 'comprimento'),
  ('m2', 'Metro quadrado', 'area'),
  ('un', 'Unidade', 'unidade'),
  ('sc', 'Saco', 'unidade'),
  ('h', 'Hora', 'tempo'),
  ('vb', 'Verba', 'outro');

insert into public.categorias_insumo (nome, tipo) values
  ('Materiais de construcao', 'material'),
  ('Pecas e componentes', 'peca'),
  ('Oleos e lubrificantes', 'oleo'),
  ('Combustiveis', 'combustivel'),
  ('Betuminosos', 'betuminoso'),
  ('Servicos e fretes', 'servico');
