-- Engancha a propagacao de anexos nas duas outras funcoes da cadeia.
-- Corpo identico ao vigente, com uma linha de propagacao no fim de cada uma:
--   aprovar OC  -> o lancamento herda os anexos da OC
--   pagar parcela -> o pagamento (a parcela) herda os anexos do lancamento
--
-- O corpo completo destas duas funcoes esta em
-- 20260728180001_oc_parcelas.sql e 20260728180003_fix_tolerancia_nf_jsonb.sql;
-- aqui elas sao recriadas com o mesmo conteudo mais o perform da propagacao.
-- Aplicado no banco vivo em 2026-07-28 (schema_migrations 20260728235955).

create or replace function public.fn_aprovar_ordem_compra(p_oc_id uuid)
returns void language plpgsql security definer set search_path to '' as $function$
declare
  v_status text; v_fornecedor uuid; v_total numeric(14, 2); v_numero text;
  v_lanc_id uuid; v_competencia date; v_qtd_parcelas int; v_soma_parcelas numeric(14, 2);
begin
  if not public.tem_permissao('compras.ordens', 'aprovar') then
    raise exception 'Sem permissao para aprovar ordens de compra';
  end if;

  select status, fornecedor_id, valor_total, numero
  into v_status, v_fornecedor, v_total, v_numero
  from public.ordens_compra where id = p_oc_id;

  if v_status is null then raise exception 'Ordem de compra nao encontrada'; end if;
  if v_status <> 'pendente_aprovacao' then
    raise exception 'A ordem de compra precisa estar pendente de aprovacao';
  end if;

  select count(*), round(coalesce(sum(valor), 0), 2) into v_qtd_parcelas, v_soma_parcelas
  from public.oc_parcelas where ordem_compra_id = p_oc_id;

  if v_qtd_parcelas > 0 and v_soma_parcelas <> round(v_total, 2) then
    raise exception 'A soma das parcelas da ordem (R$ %) nao fecha com o total (R$ %). Ajuste as parcelas antes de aprovar.',
      v_soma_parcelas, round(v_total, 2);
  end if;

  update public.ordens_compra
  set status = 'aprovado', aprovado_por = (select auth.uid()), aprovado_em = now()
  where id = p_oc_id;

  v_competencia := (now() at time zone 'America/Rio_Branco')::date;

  insert into public.lancamentos (tipo, origem, origem_id, fornecedor_id, descricao, valor, status, competencia, created_by)
  values ('a_pagar', 'oc', p_oc_id, v_fornecedor, 'Ordem de compra ' || coalesce(v_numero, ''), v_total, 'previsto', v_competencia, (select auth.uid()))
  returning id into v_lanc_id;

  if v_qtd_parcelas > 0 then
    insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
    select v_lanc_id, p.numero_parcela, p.valor, p.data_vencimento, 'pendente', (select auth.uid())
    from public.oc_parcelas p where p.ordem_compra_id = p_oc_id order by p.numero_parcela;

    update public.lancamentos
    set data_vencimento = (select min(p.data_vencimento) from public.oc_parcelas p where p.ordem_compra_id = p_oc_id)
    where id = v_lanc_id;
  end if;

  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
  select v_lanc_id, oi.centro_custo_id, sum(oi.quantidade * oi.preco_unitario), (select auth.uid())
  from public.oc_itens oi where oi.ordem_compra_id = p_oc_id group by oi.centro_custo_id;

  -- O lancamento herda os anexos da OC (inclusive os que a OC herdou da
  -- cotacao), por referencia: nenhum binario e copiado.
  perform public.fn_propagar_anexos('ordem_compra', p_oc_id, 'lancamento', v_lanc_id);
end $function$;

create or replace function public.fn_pagar_parcela(p_parcela_id uuid, p_conta_id uuid, p_data_pagamento date)
returns void language plpgsql security definer set search_path to '' as $function$
declare v_status text; v_lanc uuid; v_tipo text; v_valor numeric; v_saldo numeric;
begin
  select p.status, p.lancamento_id, l.tipo, p.valor into v_status, v_lanc, v_tipo, v_valor
  from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id where p.id = p_parcela_id;
  if v_status is null then raise exception 'Parcela nao encontrada'; end if;
  if v_tipo = 'a_pagar' then
    if not public.tem_permissao('financeiro.pagamentos', 'criar') then raise exception 'Sem permissao para registrar pagamentos'; end if;
    if v_status <> 'aprovado' then raise exception 'A parcela precisa estar aprovada para pagamento'; end if;
  else
    if not public.tem_permissao('financeiro.contas-receber', 'editar') then raise exception 'Sem permissao para baixar recebimentos'; end if;
    if v_status not in ('pendente','aprovado') then raise exception 'Parcela ja baixada ou cancelada'; end if;
  end if;
  if p_conta_id is null then raise exception 'Informe a conta bancaria'; end if;

  if v_tipo = 'a_pagar' then
    select c.saldo_inicial + coalesce(sum(case when l.tipo = 'a_receber' then p.valor else -p.valor end), 0)
    into v_saldo
    from public.contas_bancarias c
    left join public.lancamento_parcelas p on p.conta_bancaria_id = c.id and p.status = 'pago'
    left join public.lancamentos l on l.id = p.lancamento_id
    where c.id = p_conta_id group by c.saldo_inicial;

    if coalesce(v_saldo, 0) - v_valor < 0 then
      raise exception 'Saldo insuficiente na conta: saldo atual R$ %, pagamento de R$ %.',
        round(coalesce(v_saldo, 0), 2), round(v_valor, 2);
    end if;
  end if;

  update public.lancamento_parcelas
  set status = 'pago', conta_bancaria_id = p_conta_id,
      data_pagamento = coalesce(p_data_pagamento, (now() at time zone 'America/Rio_Branco')::date),
      pago_por = (select auth.uid()), pago_em = now()
  where id = p_parcela_id;
  perform public.fn_recalcular_status_lancamento(v_lanc);

  -- O pagamento (a parcela paga) herda os anexos do lancamento, por referencia.
  perform public.fn_propagar_anexos('lancamento', v_lanc, 'pagamento', p_parcela_id);
end $function$;
