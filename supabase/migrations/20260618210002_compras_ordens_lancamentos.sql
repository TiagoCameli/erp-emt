-- =============================================================
-- Fase 2 / Migration 14: ordens de compra e base do financeiro
-- OC com valor_total mantido por trigger. Aprovar a OC (funcao
-- dedicada, atomica) gera um lancamento financeiro PREVISTO.
-- A tabela lancamentos nasce aqui com o essencial do fluxo de
-- compras; a Fase 3 estende (parcelas, rateios, pagamento, OFX).
-- =============================================================

-- -------------------------------------------------------------
-- lancamentos (base do financeiro, alimentado pela Fase 2)
-- -------------------------------------------------------------
create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'a_pagar' check (tipo in ('a_pagar', 'a_receber')),
  origem text not null check (origem in ('oc', 'manual', 'fatura')),
  origem_id uuid,
  fornecedor_id uuid references public.fornecedores(id),
  centro_custo_id uuid references public.centros_custo(id),
  descricao text not null,
  valor numeric(14, 2) not null check (valor >= 0),
  status text not null default 'previsto'
    check (status in ('previsto', 'a_pagar', 'aprovado', 'pago', 'cancelado')),
  data_emissao date not null default (now() at time zone 'America/Rio_Branco')::date,
  data_vencimento date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.lancamentos is 'Lancamentos financeiros. Na Fase 2: previsto (OC aprovada) > a_pagar (recebimento). Fase 3 completa parcelas, rateios, pagamento e conciliacao.';

create index idx_lancamentos_origem on public.lancamentos (origem, origem_id);
create index idx_lancamentos_status on public.lancamentos (status);
create index idx_lancamentos_fornecedor on public.lancamentos (fornecedor_id);

create trigger trg_lancamentos_updated_at
  before update on public.lancamentos
  for each row execute function public.fn_set_updated_at();
create trigger trg_audit_lancamentos
  after insert or update or delete on public.lancamentos
  for each row execute function public.fn_audit();

alter table public.lancamentos enable row level security;
-- Na Fase 2 ainda nao ha aba de Financeiro: o lancamento e visivel a
-- quem ve as ordens de compra (origem do lancamento). A Fase 3 troca
-- por recursos financeiro.*.
create policy lancamentos_select on public.lancamentos
  for select to authenticated using ((select public.tem_permissao('compras.ordens', 'ver')));
-- Escrita somente via funcoes security definer (aprovar/confirmar).
grant select on table public.lancamentos to authenticated;

-- -------------------------------------------------------------
-- ordens_compra
-- -------------------------------------------------------------
create table public.ordens_compra (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  fornecedor_id uuid not null references public.fornecedores(id),
  pedido_id uuid references public.pedidos(id),
  cotacao_id uuid references public.cotacoes(id),
  condicao_pagamento text,
  valor_total numeric(14, 2) not null default 0,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'pendente_aprovacao', 'aprovado', 'rejeitado', 'cancelado', 'recebido_parcial', 'recebido')),
  motivo_rejeicao text,
  data_emissao date not null default (now() at time zone 'America/Rio_Branco')::date,
  aprovado_por uuid references public.usuarios(id),
  aprovado_em timestamptz,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.ordens_compra is 'Ordens de compra. Aprovar gera lancamento previsto; receber confirma como a_pagar.';

create index idx_ordens_compra_status on public.ordens_compra (status);
create index idx_ordens_compra_fornecedor on public.ordens_compra (fornecedor_id);

create trigger trg_ordens_compra_numero
  before insert on public.ordens_compra
  for each row execute function public.fn_numerar_documento('OC');
create trigger trg_ordens_compra_updated_at
  before update on public.ordens_compra
  for each row execute function public.fn_set_updated_at();
create trigger trg_audit_ordens_compra
  after insert or update or delete on public.ordens_compra
  for each row execute function public.fn_audit();

alter table public.ordens_compra enable row level security;
create policy ordens_compra_select on public.ordens_compra
  for select to authenticated using ((select public.tem_permissao('compras.ordens', 'ver')));
create policy ordens_compra_insert on public.ordens_compra
  for insert to authenticated with check ((select public.tem_permissao('compras.ordens', 'criar')));
create policy ordens_compra_update on public.ordens_compra
  for update to authenticated
  using ((select public.tem_permissao('compras.ordens', 'editar')) or (select public.tem_permissao('compras.ordens', 'aprovar')))
  with check ((select public.tem_permissao('compras.ordens', 'editar')) or (select public.tem_permissao('compras.ordens', 'aprovar')));
grant select, insert, update on table public.ordens_compra to authenticated;

-- -------------------------------------------------------------
-- oc_itens
-- -------------------------------------------------------------
create table public.oc_itens (
  id uuid primary key default gen_random_uuid(),
  ordem_compra_id uuid not null references public.ordens_compra(id) on delete cascade,
  insumo_id uuid not null references public.insumos(id),
  quantidade numeric(14, 3) not null check (quantidade > 0),
  preco_unitario numeric(14, 2) not null check (preco_unitario >= 0),
  centro_custo_id uuid not null references public.centros_custo(id),
  deposito_id uuid references public.depositos(id),
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.oc_itens is 'Itens da ordem de compra. O valor_total da OC e a soma de quantidade x preco.';

create index idx_oc_itens_oc on public.oc_itens (ordem_compra_id);
create index idx_oc_itens_insumo on public.oc_itens (insumo_id);

create trigger trg_audit_oc_itens
  after insert or update or delete on public.oc_itens
  for each row execute function public.fn_audit();

alter table public.oc_itens enable row level security;
create policy oc_itens_select on public.oc_itens
  for select to authenticated using ((select public.tem_permissao('compras.ordens', 'ver')));
create policy oc_itens_insert on public.oc_itens
  for insert to authenticated with check ((select public.tem_permissao('compras.ordens', 'criar')) or (select public.tem_permissao('compras.ordens', 'editar')));
create policy oc_itens_update on public.oc_itens
  for update to authenticated
  using ((select public.tem_permissao('compras.ordens', 'editar')))
  with check ((select public.tem_permissao('compras.ordens', 'editar')));
create policy oc_itens_delete on public.oc_itens
  for delete to authenticated using ((select public.tem_permissao('compras.ordens', 'editar')) or (select public.tem_permissao('compras.ordens', 'criar')));
grant select, insert, update, delete on table public.oc_itens to authenticated;

-- -------------------------------------------------------------
-- Trigger: mantem ordens_compra.valor_total = soma dos itens
-- -------------------------------------------------------------
create or replace function public.fn_recalcular_total_oc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oc uuid := coalesce(new.ordem_compra_id, old.ordem_compra_id);
begin
  update public.ordens_compra o
  set valor_total = coalesce((
    select sum(i.quantidade * i.preco_unitario)
    from public.oc_itens i
    where i.ordem_compra_id = v_oc
  ), 0)
  where o.id = v_oc;
  return null;
end $$;

revoke all on function public.fn_recalcular_total_oc() from public, anon, authenticated;

create trigger trg_recalcular_total_oc
  after insert or update or delete on public.oc_itens
  for each row execute function public.fn_recalcular_total_oc();

-- -------------------------------------------------------------
-- fn_aprovar_ordem_compra: aprova e gera o lancamento previsto
-- -------------------------------------------------------------
create or replace function public.fn_aprovar_ordem_compra(p_oc_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_fornecedor uuid;
  v_total numeric(14, 2);
  v_numero text;
begin
  if not public.tem_permissao('compras.ordens', 'aprovar') then
    raise exception 'Sem permissao para aprovar ordens de compra';
  end if;

  select status, fornecedor_id, valor_total, numero
  into v_status, v_fornecedor, v_total, v_numero
  from public.ordens_compra where id = p_oc_id;

  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status <> 'pendente_aprovacao' then
    raise exception 'A ordem de compra precisa estar pendente de aprovacao';
  end if;

  update public.ordens_compra
  set status = 'aprovado', aprovado_por = (select auth.uid()), aprovado_em = now()
  where id = p_oc_id;

  -- Lancamento previsto (sem vencimento ate o recebimento confirmar).
  insert into public.lancamentos (tipo, origem, origem_id, fornecedor_id, descricao, valor, status, created_by)
  values ('a_pagar', 'oc', p_oc_id, v_fornecedor, 'Ordem de compra ' || coalesce(v_numero, ''), v_total, 'previsto', (select auth.uid()));
end $$;

revoke all on function public.fn_aprovar_ordem_compra(uuid) from public, anon;
grant execute on function public.fn_aprovar_ordem_compra(uuid) to authenticated;
