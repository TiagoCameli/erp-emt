-- =============================================================
-- Fase 4 / Migration: estrutura do estoque (PEPS)
-- Movimentos (entrada/saida/consumo/transferencia/ajuste), camadas
-- PEPS (cada entrada e um lote consumido do mais antigo ao mais novo),
-- saldos materializados, minimos (alertas) e abastecimentos de tanque.
-- Escrita SEMPRE via funcao definer (migration seguinte).
-- =============================================================

create table public.estoque_movimentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('entrada', 'saida', 'consumo', 'transferencia', 'ajuste_positivo', 'ajuste_negativo')),
  insumo_id uuid not null references public.insumos(id),
  deposito_id uuid not null references public.depositos(id),
  deposito_destino_id uuid references public.depositos(id),
  quantidade numeric(14, 3) not null check (quantidade > 0),
  custo_unitario numeric(14, 4),
  custo_total numeric(14, 2),
  centro_custo_id uuid references public.centros_custo(id),
  equipamento_id uuid references public.equipamentos(id),
  origem text not null default 'manual' check (origem in ('recebimento', 'manual', 'transferencia', 'inventario', 'abastecimento', 'os')),
  origem_id uuid,
  observacao text,
  data_movimento date not null default (now() at time zone 'America/Rio_Branco')::date,
  created_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.estoque_movimentos is 'Movimentos de estoque. Saida/consumo custam por PEPS (camadas mais antigas primeiro).';
create index idx_estoque_mov_insumo_dep on public.estoque_movimentos (insumo_id, deposito_id);
create index idx_estoque_mov_tipo on public.estoque_movimentos (tipo);
create index idx_estoque_mov_cc on public.estoque_movimentos (centro_custo_id);
create index idx_estoque_mov_data on public.estoque_movimentos (data_movimento desc);
create trigger trg_estoque_mov_created_by before insert on public.estoque_movimentos for each row execute function public.fn_set_created_by();
create trigger trg_audit_estoque_mov after insert or update or delete on public.estoque_movimentos for each row execute function public.fn_audit();
alter table public.estoque_movimentos enable row level security;
create policy estoque_mov_select on public.estoque_movimentos for select to authenticated using (
  (select public.tem_permissao('estoque.posicao', 'ver'))
  or (select public.tem_permissao('estoque.entradas', 'ver'))
  or (select public.tem_permissao('estoque.saidas', 'ver'))
  or (select public.tem_permissao('estoque.transferencias', 'ver'))
  or (select public.tem_permissao('estoque.inventario', 'ver'))
  or (select public.tem_permissao('estoque.tanques', 'ver'))
);
grant select on table public.estoque_movimentos to authenticated;

create table public.estoque_camadas (
  id uuid primary key default gen_random_uuid(),
  sequencia bigint generated always as identity,
  insumo_id uuid not null references public.insumos(id),
  deposito_id uuid not null references public.depositos(id),
  movimento_id uuid references public.estoque_movimentos(id),
  quantidade_inicial numeric(14, 3) not null check (quantidade_inicial > 0),
  quantidade_restante numeric(14, 3) not null check (quantidade_restante >= 0),
  custo_unitario numeric(14, 4) not null check (custo_unitario >= 0),
  data_entrada date not null,
  created_at timestamptz not null default now()
);
comment on table public.estoque_camadas is 'Camadas PEPS: cada entrada e um lote. Saidas consomem por data_entrada/sequencia (mais antigo primeiro).';
create index idx_estoque_camadas_fifo on public.estoque_camadas (insumo_id, deposito_id, data_entrada, sequencia) where quantidade_restante > 0;
create trigger trg_audit_estoque_camadas after insert or update or delete on public.estoque_camadas for each row execute function public.fn_audit();
alter table public.estoque_camadas enable row level security;
create policy estoque_camadas_select on public.estoque_camadas for select to authenticated using (
  (select public.tem_permissao('estoque.posicao', 'ver')) or (select public.tem_permissao('estoque.inventario', 'ver'))
);
grant select on table public.estoque_camadas to authenticated;

create table public.estoque_saldos (
  insumo_id uuid not null references public.insumos(id),
  deposito_id uuid not null references public.depositos(id),
  quantidade numeric(14, 3) not null default 0,
  valor_total numeric(14, 2) not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (insumo_id, deposito_id)
);
comment on table public.estoque_saldos is 'Saldo materializado por insumo + deposito. Recalculado das camadas a cada movimento.';
create index idx_estoque_saldos_deposito on public.estoque_saldos (deposito_id);
alter table public.estoque_saldos enable row level security;
create policy estoque_saldos_select on public.estoque_saldos for select to authenticated using (
  (select public.tem_permissao('estoque.posicao', 'ver'))
  or (select public.tem_permissao('estoque.entradas', 'ver'))
  or (select public.tem_permissao('estoque.saidas', 'ver'))
  or (select public.tem_permissao('estoque.transferencias', 'ver'))
  or (select public.tem_permissao('estoque.tanques', 'ver'))
  or (select public.tem_permissao('estoque.alertas', 'ver'))
);
grant select on table public.estoque_saldos to authenticated;

create table public.estoque_minimos (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references public.insumos(id),
  deposito_id uuid not null references public.depositos(id),
  minimo numeric(14, 3) not null default 0 check (minimo >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (insumo_id, deposito_id)
);
comment on table public.estoque_minimos is 'Estoque minimo por insumo + deposito. Base dos alertas de reposicao.';
create trigger trg_estoque_minimos_updated_at before update on public.estoque_minimos for each row execute function public.fn_set_updated_at();
create trigger trg_estoque_minimos_created_by before insert on public.estoque_minimos for each row execute function public.fn_set_created_by();
create trigger trg_audit_estoque_minimos after insert or update or delete on public.estoque_minimos for each row execute function public.fn_audit();
alter table public.estoque_minimos enable row level security;
create policy estoque_minimos_select on public.estoque_minimos for select to authenticated using (
  (select public.tem_permissao('estoque.alertas', 'ver')) or (select public.tem_permissao('estoque.posicao', 'ver'))
);
create policy estoque_minimos_insert on public.estoque_minimos for insert to authenticated with check ((select public.tem_permissao('estoque.alertas', 'editar')));
create policy estoque_minimos_update on public.estoque_minimos for update to authenticated using ((select public.tem_permissao('estoque.alertas', 'editar'))) with check ((select public.tem_permissao('estoque.alertas', 'editar')));
grant select, insert, update on table public.estoque_minimos to authenticated;

create table public.abastecimentos (
  id uuid primary key default gen_random_uuid(),
  movimento_id uuid references public.estoque_movimentos(id),
  equipamento_id uuid not null references public.equipamentos(id),
  deposito_id uuid not null references public.depositos(id),
  insumo_id uuid not null references public.insumos(id),
  quantidade numeric(14, 3) not null check (quantidade > 0),
  custo_total numeric(14, 2),
  horimetro numeric(14, 2),
  km numeric(14, 2),
  operador_id uuid references public.colaboradores(id),
  data_abastecimento date not null default (now() at time zone 'America/Rio_Branco')::date,
  observacao text,
  created_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.abastecimentos is 'Abastecimento de equipamento a partir de um tanque: litros, horimetro/km e operador.';
create index idx_abastecimentos_equip on public.abastecimentos (equipamento_id);
create index idx_abastecimentos_deposito on public.abastecimentos (deposito_id);
create trigger trg_abastecimentos_created_by before insert on public.abastecimentos for each row execute function public.fn_set_created_by();
create trigger trg_audit_abastecimentos after insert or update or delete on public.abastecimentos for each row execute function public.fn_audit();
alter table public.abastecimentos enable row level security;
create policy abastecimentos_select on public.abastecimentos for select to authenticated using ((select public.tem_permissao('estoque.tanques', 'ver')));
grant select on table public.abastecimentos to authenticated;
