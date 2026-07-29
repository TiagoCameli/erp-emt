-- Bug que já existia em produção, encontrado ao provar esta feature:
-- configuracoes.valor é jsonb e a função lia com nullif(valor,'')::numeric.
-- Como a linha tolerancia_divergencia_nf_percentual existe, a expressão
-- estourava com "invalid input syntax for type json" e o registro de
-- recebimento falhava em TODA ordem de compra, antes de fazer qualquer coisa.
-- Leitura correta de escalar jsonb: valor #>> '{}'.
-- create or replace: rodar de novo é inofensivo.

create or replace function public.fn_registrar_recebimento(
  p_oc_id uuid,
  p_numero_nf text,
  p_valor_nf numeric,
  p_data_recebimento date
)
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
  v_soma_parcelas numeric(14, 2);
  v_parcela_id uuid;
  v_valor_parcela numeric(14, 2);
  v_diferenca numeric(14, 2);
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

  select status, condicao_pagamento_id, valor_total
  into v_status, v_condicao_id, v_valor_total
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

  -- configuracoes.valor é jsonb: o nullif(valor,'')::numeric que estava aqui
  -- estourava com "invalid input syntax for type json" e derrubava TODO
  -- recebimento (ver 20260728180003_fix_tolerancia_nf_jsonb).
  select coalesce((valor #>> '{}')::numeric, 0) into v_tolerancia
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

  select id into v_lanc_id
  from public.lancamentos
  where origem = 'oc' and origem_id = p_oc_id and status = 'previsto'
  order by created_at desc
  limit 1;

  if v_lanc_id is null then
    raise exception 'Lancamento previsto desta ordem de compra nao encontrado';
  end if;

  select count(*), round(coalesce(sum(valor), 0), 2)
  into v_qtd_parcelas, v_soma_parcelas
  from public.lancamento_parcelas
  where lancamento_id = v_lanc_id;

  -- Parcelas herdadas da OC ficam como foram definidas. Se a nota veio com
  -- valor diferente (dentro da tolerância), a diferença cai na ÚLTIMA parcela
  -- em aberto, e a soma continua igual ao valor do lançamento.
  if v_qtd_parcelas > 0 and v_soma_parcelas <> round(p_valor_nf, 2) then
    select id, valor into v_parcela_id, v_valor_parcela
    from public.lancamento_parcelas
    where lancamento_id = v_lanc_id and status = 'pendente'
    order by numero_parcela desc
    limit 1;

    if v_parcela_id is null then
      raise exception 'A nota fiscal (R$ %) diverge da soma das parcelas (R$ %) e nao ha parcela em aberto para absorver a diferenca',
        round(p_valor_nf, 2), v_soma_parcelas;
    end if;

    v_diferenca := round(p_valor_nf, 2) - v_soma_parcelas;

    if round(v_valor_parcela + v_diferenca, 2) <= 0 then
      raise exception 'A diferenca da nota fiscal (R$ %) zeraria a ultima parcela em aberto (R$ %). Ajuste as parcelas antes de registrar o recebimento.',
        v_diferenca, v_valor_parcela;
    end if;

    update public.lancamento_parcelas
    set valor = round(v_valor_parcela + v_diferenca, 2)
    where id = v_parcela_id;
  end if;

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
