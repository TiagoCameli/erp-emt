-- =============================================================
-- Fase 3 / Migration 21: parcelas e rateios
-- Estende lancamentos (categoria, numero LAN, competencia) e cria
-- as tabelas filhas. Toda parcela carrega o ciclo de pagamento;
-- o rateio distribui o valor por centro de custo. Migra os
-- lancamentos da Fase 2 (de OC) para 1 parcela + rateio dos itens.
-- Escrita das filhas e do lancamento e SEMPRE via funcao definer.
-- =============================================================

alter table public.lancamentos
  add column if not exists categoria_id uuid references public.categorias_financeiras(id),
  add column if not exists numero text,
  add column if not exists competencia date;

-- Numeracao LAN para lancamentos
create trigger trg_lancamentos_numero
  before insert on public.lancamentos
  for each row execute function public.fn_numerar_documento('LAN');

-- -------------------------------------------------------------
-- lancamento_parcelas
-- -------------------------------------------------------------
create table public.lancamento_parcelas (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.lancamentos(id) on delete cascade,
  numero_parcela smallint not null default 1,
  valor numeric(14, 2) not null check (valor >= 0),
  data_vencimento date,
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovado', 'pago', 'cancelado')),
  conta_bancaria_id uuid references public.contas_bancarias(id),
  data_pagamento date,
  aprovado_por uuid references public.usuarios(id),
  aprovado_em timestamptz,
  pago_por uuid references public.usuarios(id),
  pago_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.lancamento_parcelas is 'Parcelas de um lancamento. Aprovacao de pagamento e pagamento (ou baixa de recebimento) operam aqui.';

create index idx_lancamento_parcelas_lancamento on public.lancamento_parcelas (lancamento_id);
create index idx_lancamento_parcelas_status on public.lancamento_parcelas (status);
create index idx_lancamento_parcelas_vencimento on public.lancamento_parcelas (data_vencimento);

create trigger trg_lancamento_parcelas_updated_at
  before update on public.lancamento_parcelas
  for each row execute function public.fn_set_updated_at();
create trigger trg_audit_lancamento_parcelas
  after insert or update or delete on public.lancamento_parcelas
  for each row execute function public.fn_audit();

alter table public.lancamento_parcelas enable row level security;
-- Visivel a quem ve qualquer aba que mexe com parcela. Escrita via funcao.
create policy lancamento_parcelas_select on public.lancamento_parcelas
  for select to authenticated using (
    (select public.tem_permissao('financeiro.lancamentos', 'ver'))
    or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.contas-receber', 'ver'))
    or (select public.tem_permissao('compras.ordens', 'ver'))
  );
grant select on table public.lancamento_parcelas to authenticated;

-- -------------------------------------------------------------
-- lancamento_rateios
-- -------------------------------------------------------------
create table public.lancamento_rateios (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.lancamentos(id) on delete cascade,
  centro_custo_id uuid not null references public.centros_custo(id),
  valor numeric(14, 2) not null check (valor >= 0),
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.lancamento_rateios is 'Distribuicao do valor do lancamento por centro de custo. Fonte de verdade do custo por CC.';

create index idx_lancamento_rateios_lancamento on public.lancamento_rateios (lancamento_id);
create index idx_lancamento_rateios_cc on public.lancamento_rateios (centro_custo_id);

create trigger trg_audit_lancamento_rateios
  after insert or update or delete on public.lancamento_rateios
  for each row execute function public.fn_audit();

alter table public.lancamento_rateios enable row level security;
create policy lancamento_rateios_select on public.lancamento_rateios
  for select to authenticated using (
    (select public.tem_permissao('financeiro.lancamentos', 'ver'))
    or (select public.tem_permissao('financeiro.relatorios', 'ver'))
    or (select public.tem_permissao('compras.ordens', 'ver'))
  );
grant select on table public.lancamento_rateios to authenticated;

-- -------------------------------------------------------------
-- Migracao: lancamentos da Fase 2 ganham 1 parcela + rateio
-- -------------------------------------------------------------
insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
select l.id, 1, l.valor, l.data_vencimento,
  case when l.status = 'pago' then 'pago' when l.status = 'cancelado' then 'cancelado' else 'pendente' end,
  l.created_by
from public.lancamentos l
where not exists (select 1 from public.lancamento_parcelas p where p.lancamento_id = l.id);

insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
select l.id, l.centro_custo_id, l.valor, l.created_by
from public.lancamentos l
where l.centro_custo_id is not null
  and not exists (select 1 from public.lancamento_rateios r where r.lancamento_id = l.id);

-- -------------------------------------------------------------
-- Atualiza as funcoes da Fase 2 para gerar parcela + rateio
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
  v_lanc_id uuid;
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

  insert into public.lancamentos (tipo, origem, origem_id, fornecedor_id, descricao, valor, status, created_by)
  values ('a_pagar', 'oc', p_oc_id, v_fornecedor, 'Ordem de compra ' || coalesce(v_numero, ''), v_total, 'previsto', (select auth.uid()))
  returning id into v_lanc_id;

  -- 1 parcela previsto (sem vencimento ate o recebimento confirmar)
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, status, created_by)
  values (v_lanc_id, 1, v_total, 'pendente', (select auth.uid()));

  -- rateio pelos centros de custo dos itens da OC
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
  select v_lanc_id, oi.centro_custo_id, sum(oi.quantidade * oi.preco_unitario), (select auth.uid())
  from public.oc_itens oi
  where oi.ordem_compra_id = p_oc_id
  group by oi.centro_custo_id;
end $$;

create or replace function public.fn_registrar_recebimento(
  p_oc_id uuid, p_numero_nf text, p_valor_nf numeric, p_data_recebimento date,
  p_data_vencimento date, p_itens jsonb, p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oc_status text;
  v_fornecedor uuid;
  v_numero_oc text;
  v_recebimento_id uuid;
  v_esperado numeric(14, 2);
  v_tolerancia numeric;
  v_item jsonb;
  v_total_pedido numeric(14, 3);
  v_total_recebido numeric(14, 3);
  v_lancamento_id uuid;
  v_ja_recebido numeric(14, 3);
  v_qtd_pedida numeric(14, 3);
begin
  if not public.tem_permissao('compras.recebimentos', 'criar') then
    raise exception 'Sem permissao para registrar recebimentos';
  end if;

  select status, fornecedor_id, numero into v_oc_status, v_fornecedor, v_numero_oc
  from public.ordens_compra where id = p_oc_id;
  if v_oc_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_oc_status not in ('aprovado', 'recebido_parcial') then
    raise exception 'So da para receber uma OC aprovada';
  end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe ao menos um item recebido';
  end if;

  -- valida cada item: pertence a OC e nao excede o saldo
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    select oi.quantidade into v_qtd_pedida
    from public.oc_itens oi
    where oi.id = (v_item->>'oc_item_id')::uuid and oi.ordem_compra_id = p_oc_id;
    if v_qtd_pedida is null then
      raise exception 'Item nao pertence a ordem de compra informada';
    end if;
    select coalesce(sum(ri.quantidade_recebida), 0) into v_ja_recebido
    from public.recebimento_itens ri
    join public.recebimentos r on r.id = ri.recebimento_id
    where ri.oc_item_id = (v_item->>'oc_item_id')::uuid and r.status = 'registrado';
    if v_ja_recebido + (v_item->>'quantidade_recebida')::numeric > v_qtd_pedida then
      raise exception 'Quantidade recebida excede o saldo do item';
    end if;
  end loop;

  select coalesce(sum((item->>'quantidade_recebida')::numeric * oi.preco_unitario), 0)
  into v_esperado
  from jsonb_array_elements(p_itens) item
  join public.oc_itens oi on oi.id = (item->>'oc_item_id')::uuid
  where oi.ordem_compra_id = p_oc_id;

  select coalesce((valor)::numeric, 0) into v_tolerancia
  from public.configuracoes where chave = 'tolerancia_divergencia_nf_percentual';

  if p_valor_nf is not null and v_esperado > 0 then
    if abs(p_valor_nf - v_esperado) > v_esperado * (coalesce(v_tolerancia, 0) / 100.0) then
      raise exception 'Valor da NF (R$ %) diverge do esperado (R$ %) acima da tolerancia de %.', p_valor_nf, v_esperado, (coalesce(v_tolerancia, 0)::text || '%');
    end if;
  end if;

  insert into public.recebimentos (ordem_compra_id, numero_nf, valor_nf, data_recebimento, data_vencimento, observacoes, created_by)
  values (p_oc_id, p_numero_nf, p_valor_nf, coalesce(p_data_recebimento, (now() at time zone 'America/Rio_Branco')::date), p_data_vencimento, p_observacoes, (select auth.uid()))
  returning id into v_recebimento_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    insert into public.recebimento_itens (recebimento_id, oc_item_id, quantidade_recebida)
    values (v_recebimento_id, (v_item->>'oc_item_id')::uuid, (v_item->>'quantidade_recebida')::numeric);
  end loop;

  select coalesce(sum(quantidade), 0) into v_total_pedido from public.oc_itens where ordem_compra_id = p_oc_id;
  select coalesce(sum(ri.quantidade_recebida), 0) into v_total_recebido
  from public.recebimento_itens ri join public.recebimentos r on r.id = ri.recebimento_id
  where r.ordem_compra_id = p_oc_id and r.status = 'registrado';

  update public.ordens_compra
  set status = case when v_total_recebido >= v_total_pedido then 'recebido' else 'recebido_parcial' end
  where id = p_oc_id;

  -- confirma o financeiro: lancamento previsto da OC vira a_pagar + parcela
  select id into v_lancamento_id from public.lancamentos
  where origem = 'oc' and origem_id = p_oc_id and status = 'previsto' order by created_at limit 1;

  if v_lancamento_id is not null then
    update public.lancamentos
    set status = 'a_pagar', valor = coalesce(p_valor_nf, valor), data_vencimento = p_data_vencimento
    where id = v_lancamento_id;
    update public.lancamento_parcelas
    set valor = coalesce(p_valor_nf, valor), data_vencimento = p_data_vencimento
    where lancamento_id = v_lancamento_id;
  else
    insert into public.lancamentos (tipo, origem, origem_id, fornecedor_id, descricao, valor, status, data_vencimento, created_by)
    values ('a_pagar', 'oc', p_oc_id, v_fornecedor, 'Recebimento da OC ' || coalesce(v_numero_oc, ''), coalesce(p_valor_nf, 0), 'a_pagar', p_data_vencimento, (select auth.uid()))
    returning id into v_lancamento_id;
    insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
    values (v_lancamento_id, 1, coalesce(p_valor_nf, 0), p_data_vencimento, 'pendente', (select auth.uid()));
  end if;

  return v_recebimento_id;
end $$;
