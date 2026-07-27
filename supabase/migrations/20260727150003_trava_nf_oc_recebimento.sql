-- QA bug #2: recebimento aceitava NF com valor divergente da OC sem apitar
-- (ex.: OC R$ 1.505,00 gerou lancamento/parcelas de R$ 1.600,00). A trava de
-- tolerancia NF x OC existia no fn_registrar_recebimento antigo (por itens) e
-- foi dropada na Reforma A; a config tolerancia_divergencia_nf_percentual virou
-- orfa (ninguem lia). Aqui religamos a trava: le valor_total da OC + a config,
-- e BLOQUEIA o recebimento quando a NF diverge alem da tolerancia.
--
-- Base: pg_get_functiondef ao vivo (identico a 20260723110001). Unica mudanca:
-- + le valor_total no select da OC, + checa tolerancia antes de gerar parcelas.
-- Rollback: recriar a funcao sem o bloco de tolerancia (ver 20260723110001).

create or replace function public.fn_registrar_recebimento(p_oc_id uuid, p_numero_nf text, p_valor_nf numeric, p_data_recebimento date)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_status text;
  v_condicao_id uuid;
  v_valor_total numeric;
  v_tolerancia numeric;
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

  select status, condicao_pagamento_id, valor_total into v_status, v_condicao_id, v_valor_total
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

  -- Trava de divergencia NF x OC (bloqueia). Tolerancia em % vem da config.
  select coalesce(nullif(valor, '')::numeric, 0) into v_tolerancia
  from public.configuracoes where chave = 'tolerancia_divergencia_nf_percentual';
  if v_valor_total is not null and v_valor_total > 0 then
    if abs(p_valor_nf - v_valor_total) > v_valor_total * (coalesce(v_tolerancia, 0) / 100.0) then
      raise exception 'A nota fiscal (R$ %) diverge do total da ordem de compra (R$ %) acima da tolerancia permitida (% por cento).',
        round(p_valor_nf, 2), round(v_valor_total, 2), coalesce(v_tolerancia, 0);
    end if;
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
