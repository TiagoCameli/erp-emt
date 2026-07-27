-- QA bug #3: fn_pagar_parcela nunca checou saldo; dava pra pagar sem fundo e a
-- conta (ex.: CAIXINHA DE DINHEIRO) ficava negativa em silencio. Decisao do
-- dono: BLOQUEAR em QUALQUER conta (nenhuma pode ficar negativa).
--
-- Saldo = saldo_inicial + soma das parcelas ja PAGAS da conta (a_receber soma,
-- a_pagar subtrai) -- mesma formula da tela (contas-bancarias/queries.ts). A
-- parcela sendo paga ainda nao esta 'pago', entao nao entra na soma; checamos
-- saldo_atual - valor < 0 antes de baixar.
--
-- Base: pg_get_functiondef ao vivo (identico a 20260619133531). Unica mudanca:
-- + le p.valor, + bloco de trava de saldo para tipo 'a_pagar'.
-- Rollback: recriar a funcao sem o bloco de saldo (ver 20260619133531).

create or replace function public.fn_pagar_parcela(p_parcela_id uuid, p_conta_id uuid, p_data_pagamento date)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_status text; v_lanc uuid; v_tipo text; v_valor numeric; v_saldo numeric;
begin
  select p.status, p.lancamento_id, l.tipo, p.valor into v_status, v_lanc, v_tipo, v_valor
  from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id where p.id = p_parcela_id;
  if v_status is null then raise exception 'Parcela nao encontrada'; end if;
  -- a pagar exige aprovacao previa; a receber baixa direto pela aba de contas a receber
  if v_tipo = 'a_pagar' then
    if not public.tem_permissao('financeiro.pagamentos', 'criar') then raise exception 'Sem permissao para registrar pagamentos'; end if;
    if v_status <> 'aprovado' then raise exception 'A parcela precisa estar aprovada para pagamento'; end if;
  else
    if not public.tem_permissao('financeiro.contas-receber', 'editar') then raise exception 'Sem permissao para baixar recebimentos'; end if;
    if v_status not in ('pendente','aprovado') then raise exception 'Parcela ja baixada ou cancelada'; end if;
  end if;
  if p_conta_id is null then raise exception 'Informe a conta bancaria'; end if;

  -- Trava de saldo: um pagamento (a_pagar) nao pode deixar a conta negativa.
  if v_tipo = 'a_pagar' then
    select c.saldo_inicial
      + coalesce(sum(case when l.tipo = 'a_receber' then p.valor else -p.valor end), 0)
    into v_saldo
    from public.contas_bancarias c
    left join public.lancamento_parcelas p on p.conta_bancaria_id = c.id and p.status = 'pago'
    left join public.lancamentos l on l.id = p.lancamento_id
    where c.id = p_conta_id
    group by c.saldo_inicial;

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
end $function$;

revoke all on function public.fn_pagar_parcela(uuid, uuid, date) from public, anon;
grant execute on function public.fn_pagar_parcela(uuid, uuid, date) to authenticated;
