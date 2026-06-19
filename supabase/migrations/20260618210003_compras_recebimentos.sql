-- =============================================================
-- Fase 2 / Migration 15: recebimentos
-- Recebimento total ou parcial, confere NF (divergencia x OC pela
-- tolerancia configuravel), atualiza o status da OC e confirma o
-- lancamento previsto como a_pagar (Fase 3 completa o financeiro).
-- =============================================================

create table public.recebimentos (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  ordem_compra_id uuid not null references public.ordens_compra(id),
  numero_nf text,
  valor_nf numeric(14, 2),
  data_recebimento date not null default (now() at time zone 'America/Rio_Branco')::date,
  data_vencimento date,
  status text not null default 'registrado' check (status in ('registrado', 'cancelado')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.recebimentos is 'Recebimentos de uma OC (total ou parcial). Confirmam o lancamento financeiro como a_pagar.';

create index idx_recebimentos_oc on public.recebimentos (ordem_compra_id);

create trigger trg_recebimentos_numero
  before insert on public.recebimentos
  for each row execute function public.fn_numerar_documento('REC');
create trigger trg_recebimentos_updated_at
  before update on public.recebimentos
  for each row execute function public.fn_set_updated_at();
create trigger trg_audit_recebimentos
  after insert or update or delete on public.recebimentos
  for each row execute function public.fn_audit();

alter table public.recebimentos enable row level security;
create policy recebimentos_select on public.recebimentos
  for select to authenticated using ((select public.tem_permissao('compras.recebimentos', 'ver')));
-- Escrita via fn_registrar_recebimento (security definer).
grant select on table public.recebimentos to authenticated;

create table public.recebimento_itens (
  id uuid primary key default gen_random_uuid(),
  recebimento_id uuid not null references public.recebimentos(id) on delete cascade,
  oc_item_id uuid not null references public.oc_itens(id),
  quantidade_recebida numeric(14, 3) not null check (quantidade_recebida > 0),
  created_at timestamptz not null default now()
);

comment on table public.recebimento_itens is 'Quantidade recebida por item da OC neste recebimento.';

create index idx_recebimento_itens_receb on public.recebimento_itens (recebimento_id);
create index idx_recebimento_itens_oc_item on public.recebimento_itens (oc_item_id);

create trigger trg_audit_recebimento_itens
  after insert or update or delete on public.recebimento_itens
  for each row execute function public.fn_audit();

alter table public.recebimento_itens enable row level security;
create policy recebimento_itens_select on public.recebimento_itens
  for select to authenticated using ((select public.tem_permissao('compras.recebimentos', 'ver')));
grant select on table public.recebimento_itens to authenticated;

-- -------------------------------------------------------------
-- fn_registrar_recebimento: cria o recebimento, confere a NF,
-- atualiza o status da OC e confirma o lancamento como a_pagar.
-- p_itens: jsonb [{ "oc_item_id": uuid, "quantidade_recebida": number }]
-- -------------------------------------------------------------
create or replace function public.fn_registrar_recebimento(
  p_oc_id uuid,
  p_numero_nf text,
  p_valor_nf numeric,
  p_data_recebimento date,
  p_data_vencimento date,
  p_itens jsonb,
  p_observacoes text default null
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
begin
  if not public.tem_permissao('compras.recebimentos', 'criar') then
    raise exception 'Sem permissao para registrar recebimentos';
  end if;

  select status, fornecedor_id, numero
  into v_oc_status, v_fornecedor, v_numero_oc
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

  -- Valor esperado desta remessa = soma(qtd recebida x preco do item na OC).
  select coalesce(sum(
    (item->>'quantidade_recebida')::numeric * oi.preco_unitario
  ), 0)
  into v_esperado
  from jsonb_array_elements(p_itens) item
  join public.oc_itens oi on oi.id = (item->>'oc_item_id')::uuid
  where oi.ordem_compra_id = p_oc_id;

  -- Divergencia NF x esperado acima da tolerancia trava (plano secao 5.2).
  select coalesce((valor)::numeric, 0) into v_tolerancia
  from public.configuracoes where chave = 'tolerancia_divergencia_nf_percentual';

  if p_valor_nf is not null and v_esperado > 0 then
    if abs(p_valor_nf - v_esperado) > v_esperado * (coalesce(v_tolerancia, 0) / 100.0) then
      raise exception 'Valor da NF (R$ %) diverge do esperado (R$ %) acima da tolerancia de %%%. Ajuste antes de registrar.',
        p_valor_nf, v_esperado, v_tolerancia;
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

  -- Total pedido x total recebido (acumulado) define o status da OC.
  select coalesce(sum(quantidade), 0) into v_total_pedido
  from public.oc_itens where ordem_compra_id = p_oc_id;

  select coalesce(sum(ri.quantidade_recebida), 0) into v_total_recebido
  from public.recebimento_itens ri
  join public.recebimentos r on r.id = ri.recebimento_id
  where r.ordem_compra_id = p_oc_id and r.status = 'registrado';

  update public.ordens_compra
  set status = case when v_total_recebido >= v_total_pedido then 'recebido' else 'recebido_parcial' end
  where id = p_oc_id;

  -- Confirma o financeiro: usa o lancamento previsto da OC no primeiro
  -- recebimento; recebimentos seguintes criam um a_pagar proprio.
  select id into v_lancamento_id
  from public.lancamentos
  where origem = 'oc' and origem_id = p_oc_id and status = 'previsto'
  order by created_at limit 1;

  if v_lancamento_id is not null then
    update public.lancamentos
    set status = 'a_pagar',
        valor = coalesce(p_valor_nf, valor),
        data_vencimento = p_data_vencimento
    where id = v_lancamento_id;
  else
    insert into public.lancamentos (tipo, origem, origem_id, fornecedor_id, descricao, valor, status, data_vencimento, created_by)
    values ('a_pagar', 'oc', p_oc_id, v_fornecedor,
      'Recebimento da OC ' || coalesce(v_numero_oc, ''), coalesce(p_valor_nf, 0), 'a_pagar', p_data_vencimento, (select auth.uid()));
  end if;

  return v_recebimento_id;
end $$;

revoke all on function public.fn_registrar_recebimento(uuid, text, numeric, date, date, jsonb, text) from public, anon;
grant execute on function public.fn_registrar_recebimento(uuid, text, numeric, date, date, jsonb, text) to authenticated;

-- -------------------------------------------------------------
-- fn_desaprovar_ordem_compra: volta para pendente, cancela o
-- lancamento previsto. Bloqueia se ja houver recebimento (efeito).
-- -------------------------------------------------------------
create or replace function public.fn_desaprovar_ordem_compra(p_oc_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.tem_permissao('compras.ordens', 'desaprovar') then
    raise exception 'Sem permissao para desaprovar ordens de compra';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da desaprovacao';
  end if;

  select status into v_status from public.ordens_compra where id = p_oc_id;
  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status <> 'aprovado' then
    raise exception 'So da para desaprovar uma OC aprovada e ainda sem recebimento';
  end if;
  if exists (select 1 from public.recebimentos where ordem_compra_id = p_oc_id and status = 'registrado') then
    raise exception 'Estorne os recebimentos antes de desaprovar esta OC';
  end if;

  update public.ordens_compra
  set status = 'pendente_aprovacao', aprovado_por = null, aprovado_em = null
  where id = p_oc_id;

  update public.lancamentos
  set status = 'cancelado'
  where origem = 'oc' and origem_id = p_oc_id and status = 'previsto';
end $$;

revoke all on function public.fn_desaprovar_ordem_compra(uuid, text) from public, anon;
grant execute on function public.fn_desaprovar_ordem_compra(uuid, text) to authenticated;
