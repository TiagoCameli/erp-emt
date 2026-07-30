-- Dois furos na trava de pagamento, achados no teste ponta a ponta em producao.
--
-- FURO 1 (grave): a janela era conferida contra a DATA DIGITADA no formulario,
-- nao contra hoje. Bastava digitar a data autorizada para pagar hoje uma parcela
-- liberada so para o mes que vem, e o pagamento ficava registrado com
-- data_pagamento no futuro (dinheiro saindo em julho e aparecendo como realizado
-- em agosto no fluxo de caixa). Aconteceu de verdade: parcela autorizada para
-- 27/08 foi paga em 30/07 com data_pagamento = 27/08.
--
-- O item 9 fala de QUANDO o pagamento acontece, nao de um campo que o usuario
-- preenche. Entao a janela passa a ser conferida contra HOJE, e a data informada
-- nao pode ser no futuro (ninguem registra pagamento que ainda nao aconteceu).
--
-- FURO 2: parcela de lancamento CANCELADO continuava pagavel. A fila de
-- aprovacao ja se defendia disso; a de pagamento nao. Agora o banco recusa.

create or replace function public.fn_pagar_parcela(
  p_parcela_id uuid,
  p_conta_id uuid,
  p_data_pagamento date
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_status text; v_lanc uuid; v_tipo text; v_valor numeric; v_saldo numeric;
  v_programada date; v_janela text; v_data_informada date; v_status_lanc text;
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
begin
  select p.status, p.lancamento_id, l.tipo, p.valor, p.data_programada, l.status
  into v_status, v_lanc, v_tipo, v_valor, v_programada, v_status_lanc
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.id = p_parcela_id;

  if v_status is null then raise exception 'Parcela nao encontrada'; end if;

  -- Furo 2: lancamento cancelado nao paga, seja a pagar ou a receber.
  if v_status_lanc = 'cancelado' then
    raise exception 'Este lancamento esta cancelado: nao da para pagar esta parcela';
  end if;

  v_data_informada := coalesce(p_data_pagamento, v_hoje);

  -- Ninguem registra pagamento que ainda nao aconteceu.
  if v_data_informada > v_hoje then
    raise exception 'A data do pagamento nao pode ser no futuro (hoje e %).',
      to_char(v_hoje, 'DD/MM/YYYY');
  end if;

  if v_tipo = 'a_pagar' then
    if not public.tem_permissao('financeiro.pagamentos', 'criar') then
      raise exception 'Sem permissao para registrar pagamentos';
    end if;
    if v_status = 'em_revisao' then
      raise exception 'Esta parcela esta em revisao: ela precisa ser reenviada e aprovada antes de pagar';
    end if;
    if v_status <> 'aprovado' then
      raise exception 'A parcela precisa estar aprovada para pagamento';
    end if;

    if v_programada is null then
      raise exception 'Esta parcela esta aprovada sem data programada: reprograme a data antes de pagar';
    end if;

    -- Furo 1: a janela e conferida contra HOJE.
    v_janela := public.fn_janela_pagamento();

    if v_janela = 'a_partir' then
      if v_hoje < v_programada then
        raise exception 'Pagamento autorizado a partir de %.',
          to_char(v_programada, 'DD/MM/YYYY');
      end if;
    else
      if v_hoje < v_programada then
        raise exception 'Pagamento autorizado para %.',
          to_char(v_programada, 'DD/MM/YYYY');
      elsif v_hoje > v_programada then
        raise exception 'A data autorizada (%) passou: reprograme a data antes de pagar.',
          to_char(v_programada, 'DD/MM/YYYY');
      end if;
    end if;
  else
    if not public.tem_permissao('financeiro.contas-receber', 'editar') then
      raise exception 'Sem permissao para baixar recebimentos';
    end if;
    if v_status not in ('pendente', 'aprovado') then
      raise exception 'Parcela ja baixada ou cancelada';
    end if;
  end if;

  if p_conta_id is null then raise exception 'Informe a conta bancaria'; end if;

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
      data_pagamento = v_data_informada,
      pago_por = (select auth.uid()), pago_em = now()
  where id = p_parcela_id;
  perform public.fn_recalcular_status_lancamento(v_lanc);

  perform public.fn_propagar_anexos('lancamento', v_lanc, 'pagamento', p_parcela_id);
end;
$$;

revoke all on function public.fn_pagar_parcela(uuid, uuid, date) from public;
grant execute on function public.fn_pagar_parcela(uuid, uuid, date) to authenticated;

notify pgrst, 'reload schema';
