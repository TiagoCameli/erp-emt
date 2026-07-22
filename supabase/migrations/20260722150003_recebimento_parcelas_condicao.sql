-- Recebimento como ação na OC: gera as parcelas do a_pagar pela condição de
-- pagamento (Task 6).
--
-- Divergência do brief checada ao vivo (MCP, 2026-07-22): `fn_registrar_recebimento`
-- NÃO EXISTIA no banco (select pg_get_functiondef... proname='fn_registrar_recebimento'
-- voltou vazio) e também não existia tabela `recebimentos`. O brief supunha as
-- duas já prontas ("já existe... só a função fn_registrar_recebimento no banco,
-- sem front"); na verdade só existia o lançamento PREVISTO com 1 parcela
-- placeholder (numero_parcela=1, valor=valor_total, data_vencimento NULL),
-- criado por fn_aprovar_ordem_compra. Esta migration CRIA a tabela e a função
-- do zero, com o comportamento pedido: confirmar o recebimento, confirmar o
-- lançamento (previsto -> a_pagar) e substituir a parcela única pelas N
-- parcelas da condição de pagamento da OC.
--
-- Fluxo hoje (lido ao vivo antes de mexer):
--   fn_aprovar_ordem_compra: ordens_compra.status -> 'aprovado'; insere 1
--   lancamentos (tipo='a_pagar', status='previsto', valor=valor_total da OC);
--   insere 1 lancamento_parcelas (numero_parcela=1, valor=total, status=
--   'pendente', data_vencimento NULL); insere lancamento_rateios por centro
--   de custo (somando oc_itens). fn_desaprovar_ordem_compra cancela o
--   lancamento 'previsto' e volta a OC pra 'pendente_aprovacao'.
--
-- Regra de split (replica dividirValorPorParcelas do TS em SQL, sem laço):
--   dinheiro em centavos (bigint); cada parcela exceto a última =
--   round(centavos_totais * percentual / 100); a última = centavos_totais -
--   soma das anteriores (window function, fecha exato sem laço PL/pgSQL).
--
-- Rollback:
--   drop function if exists public.fn_registrar_recebimento(uuid, text, numeric, date);
--   drop policy if exists condicao_parcelas_select on public.condicao_parcelas;
--   create policy condicao_parcelas_select on public.condicao_parcelas
--     for select to authenticated
--     using ((select public.tem_permissao('cadastros.condicoes-pagamento', 'ver')));
--   drop table if exists public.recebimentos;
--   alter table public.ordens_compra drop constraint if exists ordens_compra_status_check;
--   alter table public.ordens_compra add constraint ordens_compra_status_check
--     check (status = any (array['rascunho','pendente_aprovacao','aprovado','rejeitado','cancelado']));

-- Step 1: status 'recebido' na máquina de estado da OC.
alter table public.ordens_compra drop constraint ordens_compra_status_check;
alter table public.ordens_compra add constraint ordens_compra_status_check
  check (status = any (array[
    'rascunho', 'pendente_aprovacao', 'aprovado', 'rejeitado', 'cancelado', 'recebido'
  ]));

-- Step 2: tabela recebimentos — registro histórico/auditável da confirmação
-- (nº NF, valor, data). Um recebimento por OC (unique); escrita só via
-- fn_registrar_recebimento (security definer), mesmo padrão de
-- condicao_parcelas/salvar_condicao_parcelas: sem policy nem grant de
-- INSERT/UPDATE/DELETE direto pra authenticated.
create table public.recebimentos (
  id uuid primary key default gen_random_uuid(),
  ordem_compra_id uuid not null references public.ordens_compra (id),
  lancamento_id uuid not null references public.lancamentos (id),
  numero_nf text not null check (btrim(numero_nf) <> ''),
  valor_nf numeric(14, 2) not null check (valor_nf > 0),
  data_recebimento date not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (ordem_compra_id)
);

-- Índice de cobertura da FK (advisor unindexed_foreign_keys); ordem_compra_id
-- já tem índice implícito da unique constraint acima.
create index idx_recebimentos_lancamento on public.recebimentos (lancamento_id);

alter table public.recebimentos enable row level security;

-- SELECT: mesma permissão de quem vê a OC.
create policy recebimentos_select on public.recebimentos
  for select to authenticated
  using ((select public.tem_permissao('compras.ordens', 'ver')));

-- INSERT/UPDATE/DELETE só via fn_registrar_recebimento (security definer);
-- sem policy de escrita e sem grant de escrita direto (rule 1 do projeto).
grant select on public.recebimentos to authenticated;

create trigger trg_audit_recebimentos
  after insert or update or delete on public.recebimentos
  for each row execute function public.fn_audit();

-- Step 3: condicao_parcelas_select precisa também valer para quem vê OC (a
-- tela de recebimento mostra a prévia das parcelas da condição da OC), sem
-- depender da permissão de cadastro de condições de pagamento. Mesmo padrão
-- já usado em condicoes_pagamento_select (compras.ordens OR compras.cotacoes
-- OR cadastros.condicoes-pagamento).
drop policy condicao_parcelas_select on public.condicao_parcelas;

create policy condicao_parcelas_select on public.condicao_parcelas
  for select to authenticated
  using (
    (select public.tem_permissao('cadastros.condicoes-pagamento', 'ver'))
    or (select public.tem_permissao('compras.ordens', 'ver'))
  );

-- Step 4: fn_registrar_recebimento. Reusa a permissão 'aprovar' de
-- compras.ordens (mesmo padrão de baixarRecebimento em contas-receber, que
-- reusa 'editar' — o catálogo de ações do projeto é fixo em
-- ver/criar/editar/excluir/aprovar/desaprovar, sem ação dedicada; 'aprovar'
-- é a mais próxima porque confirma o efeito financeiro da OC, a mesma
-- capacidade que já gera o lançamento previsto).
create or replace function public.fn_registrar_recebimento(
  p_oc_id uuid,
  p_numero_nf text,
  p_valor_nf numeric,
  p_data_recebimento date
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_condicao_id uuid;
  v_numero_nf text;
  v_lanc_id uuid;
  v_qtd_parcelas int;
  v_soma_percentual numeric(7, 2);
  v_centavos bigint;
begin
  if not public.tem_permissao('compras.ordens', 'aprovar') then
    raise exception 'Sem permissao para registrar recebimento de ordens de compra';
  end if;

  v_numero_nf := btrim(p_numero_nf);
  if coalesce(v_numero_nf, '') = '' then
    raise exception 'Informe o numero da nota fiscal';
  end if;
  if p_valor_nf is null or p_valor_nf <= 0 then
    raise exception 'Informe um valor de nota fiscal maior que zero';
  end if;
  if p_data_recebimento is null then
    raise exception 'Informe a data do recebimento';
  end if;

  select status, condicao_pagamento_id into v_status, v_condicao_id
  from public.ordens_compra
  where id = p_oc_id;

  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status <> 'aprovado' then
    raise exception 'So da para registrar recebimento de uma ordem de compra aprovada';
  end if;
  if v_condicao_id is null then
    raise exception 'Ordem de compra sem condicao de pagamento definida';
  end if;

  if exists (select 1 from public.recebimentos where ordem_compra_id = p_oc_id) then
    raise exception 'Esta ordem de compra ja tem recebimento registrado';
  end if;

  select count(*), coalesce(sum(percentual), 0)
  into v_qtd_parcelas, v_soma_percentual
  from public.condicao_parcelas
  where condicao_id = v_condicao_id;

  if v_qtd_parcelas = 0 then
    raise exception 'A condicao de pagamento da ordem nao tem parcelas cadastradas';
  end if;
  if round(v_soma_percentual, 2) <> 100.00 then
    raise exception 'A condicao de pagamento tem parcelas cujos percentuais nao somam 100 (recebido %)', v_soma_percentual;
  end if;

  select id into v_lanc_id
  from public.lancamentos
  where origem = 'oc' and origem_id = p_oc_id and status = 'previsto'
  order by created_at desc
  limit 1;

  if v_lanc_id is null then
    raise exception 'Lancamento previsto desta ordem de compra nao encontrado';
  end if;

  -- Split do valor da NF em centavos pelos percentuais da condição, na ordem
  -- crescente de dias_offset (mesma ordem de numero). A última parcela
  -- absorve o resto do arredondamento via window function (sem laço),
  -- replicando dividirValorPorParcelas (calculo.ts) em SQL.
  v_centavos := round(p_valor_nf * 100)::bigint;

  delete from public.lancamento_parcelas where lancamento_id = v_lanc_id;

  with base as (
    select
      numero,
      dias_offset,
      count(*) over () as total_parcelas,
      round(v_centavos * percentual / 100)::bigint as valor_centavos_bruto
    from public.condicao_parcelas
    where condicao_id = v_condicao_id
  ),
  somado as (
    select
      numero,
      dias_offset,
      total_parcelas,
      valor_centavos_bruto,
      coalesce(
        sum(valor_centavos_bruto) over (
          order by numero rows between unbounded preceding and 1 preceding
        ),
        0
      ) as soma_anteriores
    from base
  )
  insert into public.lancamento_parcelas (
    lancamento_id, numero_parcela, valor, data_vencimento, status, created_by
  )
  select
    v_lanc_id,
    numero,
    case
      when numero = total_parcelas then (v_centavos - soma_anteriores) / 100.0
      else valor_centavos_bruto / 100.0
    end,
    p_data_recebimento + dias_offset,
    'pendente',
    (select auth.uid())
  from somado;

  update public.lancamentos
  set status = 'a_pagar', valor = p_valor_nf
  where id = v_lanc_id;

  insert into public.recebimentos (
    ordem_compra_id, lancamento_id, numero_nf, valor_nf, data_recebimento, created_by
  )
  values (p_oc_id, v_lanc_id, v_numero_nf, p_valor_nf, p_data_recebimento, (select auth.uid()));

  update public.ordens_compra
  set status = 'recebido'
  where id = p_oc_id;
end;
$function$;

revoke all on function public.fn_registrar_recebimento(uuid, text, numeric, date) from public, anon;
grant execute on function public.fn_registrar_recebimento(uuid, text, numeric, date) to authenticated;
