-- Bug #2 do QA ("Vence em -"): fn_registrar_recebimento gera as parcelas do
-- lançamento com vencimento certo (data_recebimento + dias_offset), mas nunca
-- preenchia lancamentos.data_vencimento no CABEÇALHO. Três telas leem esse
-- campo direto do cabeçalho (card "Lançamento financeiro" da OC, header do
-- lançamento em Financeiro > Lançamentos > detalhe, coluna "Vencimento" da
-- lista de Lançamentos) e mostravam "Vence em -" mesmo com as parcelas certas
-- (confirmado no LAN-2026-0003). As telas que leem da parcela (fila de
-- aprovação, modal de recebimento, aba Parcelas) já mostravam certo.
--
-- Fix: create or replace da função (lida ao vivo via pg_get_functiondef antes
-- desta migration), preservando tudo, só ADICIONANDO um segundo update em
-- lancamentos logo após o update existente (status -> 'a_pagar', valor),
-- setando data_vencimento = menor data_vencimento das parcelas recém-geradas
-- (a mais próxima, já que todas usam a mesma data_recebimento como base).
--
-- Rollback: reaplicar a versão anterior da função, idêntica a esta menos o
-- segundo update (ver supabase/migrations/20260722150003_recebimento_parcelas_condicao.sql
-- e 20260722150005_fn_criar_ordem_compra_precisao.sql para o corpo anterior).

create or replace function public.fn_registrar_recebimento(p_oc_id uuid, p_numero_nf text, p_valor_nf numeric, p_data_recebimento date)
 returns void
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

  -- Bug #2: denormaliza o vencimento da parcela mais próxima (menor
  -- dias_offset, ou seja, menor data_vencimento já que todas partem da mesma
  -- p_data_recebimento) pro cabeçalho do lançamento. As telas de resumo (card
  -- da OC, header do lançamento, lista de Lançamentos) leem lancamentos.data_vencimento
  -- direto e não das parcelas.
  update public.lancamentos
  set data_vencimento = (
    select min(lp.data_vencimento)
    from public.lancamento_parcelas lp
    where lp.lancamento_id = v_lanc_id
  )
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
