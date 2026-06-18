-- =============================================================
-- Fase 2 / Migration 13: pedidos e cotacoes
-- Documentos transacionais com status machine e numeracao
-- (PED/COT via proximo_numero_documento, chamada por trigger definer
-- pois a funcao nao e executavel direto por authenticated).
-- Documentos NAO usam exclusao fisica: o ciclo de vida e o status
-- (cancelado com motivo). O audit_log guarda o historico.
-- =============================================================

-- Numeracao por trigger: seta numero = PREFIXO-ANO-0001 no insert.
-- O prefixo vem de tg_argv[0]. Security definer porque
-- proximo_numero_documento foi revogado de authenticated.
create or replace function public.fn_numerar_documento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.numero is null or new.numero = '' then
    new.numero := public.proximo_numero_documento(tg_argv[0]);
  end if;
  return new;
end $$;

revoke all on function public.fn_numerar_documento() from public, anon, authenticated;

-- -------------------------------------------------------------
-- pedidos
-- -------------------------------------------------------------
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  justificativa text,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'pendente_aprovacao', 'aprovado', 'rejeitado', 'cancelado')),
  motivo_rejeicao text,
  aprovado_por uuid references public.usuarios(id),
  aprovado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.pedidos is 'Pedidos de compra. Itens em pedido_itens. Aprovacao por quem tem compras.pedidos aprovar.';

create index idx_pedidos_status on public.pedidos (status);

create trigger trg_pedidos_numero
  before insert on public.pedidos
  for each row execute function public.fn_numerar_documento('PED');
create trigger trg_pedidos_updated_at
  before update on public.pedidos
  for each row execute function public.fn_set_updated_at();
create trigger trg_audit_pedidos
  after insert or update or delete on public.pedidos
  for each row execute function public.fn_audit();

alter table public.pedidos enable row level security;
create policy pedidos_select on public.pedidos
  for select to authenticated using ((select public.tem_permissao('compras.pedidos', 'ver')));
create policy pedidos_insert on public.pedidos
  for insert to authenticated with check ((select public.tem_permissao('compras.pedidos', 'criar')));
create policy pedidos_update on public.pedidos
  for update to authenticated
  using ((select public.tem_permissao('compras.pedidos', 'editar')) or (select public.tem_permissao('compras.pedidos', 'aprovar')))
  with check ((select public.tem_permissao('compras.pedidos', 'editar')) or (select public.tem_permissao('compras.pedidos', 'aprovar')));
grant select, insert, update on table public.pedidos to authenticated;

-- -------------------------------------------------------------
-- pedido_itens
-- -------------------------------------------------------------
create table public.pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  insumo_id uuid not null references public.insumos(id),
  quantidade numeric(14, 3) not null check (quantidade > 0),
  centro_custo_id uuid not null references public.centros_custo(id),
  deposito_id uuid references public.depositos(id),
  observacao text,
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.pedido_itens is 'Itens do pedido: insumo, quantidade, centro de custo destino e deposito destino opcional.';

create index idx_pedido_itens_pedido on public.pedido_itens (pedido_id);
create index idx_pedido_itens_insumo on public.pedido_itens (insumo_id);

create trigger trg_audit_pedido_itens
  after insert or update or delete on public.pedido_itens
  for each row execute function public.fn_audit();

alter table public.pedido_itens enable row level security;
-- Itens seguem a permissao da aba Pedidos.
create policy pedido_itens_select on public.pedido_itens
  for select to authenticated using ((select public.tem_permissao('compras.pedidos', 'ver')));
create policy pedido_itens_insert on public.pedido_itens
  for insert to authenticated with check ((select public.tem_permissao('compras.pedidos', 'criar')) or (select public.tem_permissao('compras.pedidos', 'editar')));
create policy pedido_itens_update on public.pedido_itens
  for update to authenticated
  using ((select public.tem_permissao('compras.pedidos', 'editar')))
  with check ((select public.tem_permissao('compras.pedidos', 'editar')));
create policy pedido_itens_delete on public.pedido_itens
  for delete to authenticated using ((select public.tem_permissao('compras.pedidos', 'editar')) or (select public.tem_permissao('compras.pedidos', 'criar')));
grant select, insert, update, delete on table public.pedido_itens to authenticated;

-- -------------------------------------------------------------
-- cotacoes (a partir de pedido aprovado ou avulsa)
-- -------------------------------------------------------------
create table public.cotacoes (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  pedido_id uuid references public.pedidos(id),
  status text not null default 'aberta'
    check (status in ('aberta', 'finalizada', 'cancelada')),
  vencedor_fornecedor_id uuid references public.fornecedores(id),
  motivo_selecao text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.cotacoes is 'Cotacoes: 1+ fornecedores, mapa comparativo, selecao do vencedor com motivo quando nao for o menor preco.';

create index idx_cotacoes_pedido on public.cotacoes (pedido_id);
create index idx_cotacoes_status on public.cotacoes (status);

create trigger trg_cotacoes_numero
  before insert on public.cotacoes
  for each row execute function public.fn_numerar_documento('COT');
create trigger trg_cotacoes_updated_at
  before update on public.cotacoes
  for each row execute function public.fn_set_updated_at();
create trigger trg_audit_cotacoes
  after insert or update or delete on public.cotacoes
  for each row execute function public.fn_audit();

alter table public.cotacoes enable row level security;
create policy cotacoes_select on public.cotacoes
  for select to authenticated using ((select public.tem_permissao('compras.cotacoes', 'ver')));
create policy cotacoes_insert on public.cotacoes
  for insert to authenticated with check ((select public.tem_permissao('compras.cotacoes', 'criar')));
create policy cotacoes_update on public.cotacoes
  for update to authenticated
  using ((select public.tem_permissao('compras.cotacoes', 'editar')))
  with check ((select public.tem_permissao('compras.cotacoes', 'editar')));
grant select, insert, update on table public.cotacoes to authenticated;

-- -------------------------------------------------------------
-- cotacao_fornecedores (uma coluna do mapa comparativo)
-- -------------------------------------------------------------
create table public.cotacao_fornecedores (
  id uuid primary key default gen_random_uuid(),
  cotacao_id uuid not null references public.cotacoes(id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedores(id),
  condicao_pagamento text,
  prazo_entrega_dias integer,
  observacao text,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (cotacao_id, fornecedor_id)
);

comment on table public.cotacao_fornecedores is 'Fornecedores convidados a cotar. Cada um e uma coluna do mapa comparativo.';

create index idx_cotacao_fornecedores_cotacao on public.cotacao_fornecedores (cotacao_id);

create trigger trg_audit_cotacao_fornecedores
  after insert or update or delete on public.cotacao_fornecedores
  for each row execute function public.fn_audit();

alter table public.cotacao_fornecedores enable row level security;
create policy cotacao_fornecedores_select on public.cotacao_fornecedores
  for select to authenticated using ((select public.tem_permissao('compras.cotacoes', 'ver')));
create policy cotacao_fornecedores_insert on public.cotacao_fornecedores
  for insert to authenticated with check ((select public.tem_permissao('compras.cotacoes', 'criar')) or (select public.tem_permissao('compras.cotacoes', 'editar')));
create policy cotacao_fornecedores_update on public.cotacao_fornecedores
  for update to authenticated
  using ((select public.tem_permissao('compras.cotacoes', 'editar')))
  with check ((select public.tem_permissao('compras.cotacoes', 'editar')));
create policy cotacao_fornecedores_delete on public.cotacao_fornecedores
  for delete to authenticated using ((select public.tem_permissao('compras.cotacoes', 'editar')) or (select public.tem_permissao('compras.cotacoes', 'criar')));
grant select, insert, update, delete on table public.cotacao_fornecedores to authenticated;

-- -------------------------------------------------------------
-- cotacao_itens (preco por item por fornecedor)
-- -------------------------------------------------------------
create table public.cotacao_itens (
  id uuid primary key default gen_random_uuid(),
  cotacao_id uuid not null references public.cotacoes(id) on delete cascade,
  cotacao_fornecedor_id uuid not null references public.cotacao_fornecedores(id) on delete cascade,
  insumo_id uuid not null references public.insumos(id),
  quantidade numeric(14, 3) not null check (quantidade > 0),
  preco_unitario numeric(14, 2) not null check (preco_unitario >= 0),
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.cotacao_itens is 'Preco unitario de cada insumo por fornecedor na cotacao.';

create index idx_cotacao_itens_cotacao on public.cotacao_itens (cotacao_id);
create index idx_cotacao_itens_fornecedor on public.cotacao_itens (cotacao_fornecedor_id);

create trigger trg_audit_cotacao_itens
  after insert or update or delete on public.cotacao_itens
  for each row execute function public.fn_audit();

alter table public.cotacao_itens enable row level security;
create policy cotacao_itens_select on public.cotacao_itens
  for select to authenticated using ((select public.tem_permissao('compras.cotacoes', 'ver')));
create policy cotacao_itens_insert on public.cotacao_itens
  for insert to authenticated with check ((select public.tem_permissao('compras.cotacoes', 'criar')) or (select public.tem_permissao('compras.cotacoes', 'editar')));
create policy cotacao_itens_update on public.cotacao_itens
  for update to authenticated
  using ((select public.tem_permissao('compras.cotacoes', 'editar')))
  with check ((select public.tem_permissao('compras.cotacoes', 'editar')));
create policy cotacao_itens_delete on public.cotacao_itens
  for delete to authenticated using ((select public.tem_permissao('compras.cotacoes', 'editar')) or (select public.tem_permissao('compras.cotacoes', 'criar')));
grant select, insert, update, delete on table public.cotacao_itens to authenticated;
