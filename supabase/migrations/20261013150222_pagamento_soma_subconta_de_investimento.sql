-- Pagamento olha o saldo da conta somado ao das subcontas de investimento
-- (13/10/2026). O dinheiro da subconta é da mesma conta no banco (Rende Fácil
-- no BB, por exemplo): a corrente pode estar negativa no app e a conta ter
-- saldo de sobra. BB 102.124-9: corrente R$ -191.846,57, investimentos
-- R$ 248.166,32, e um pagamento de R$ 1.716,67 era recusado.
--
-- Grupo = conta pai + todas as subcontas dela. Pagar pela subconta também olha
-- o grupo. A soma fica aqui dentro (SECURITY DEFINER), sem função pública nova
-- que mostre saldo por fora de fn_pode_ver_saldo; a mensagem só traz o valor
-- se o usuário vê o saldo de todas as contas do grupo.

CREATE OR REPLACE FUNCTION public.fn_pagar_parcela(p_parcela_id uuid, p_conta_id uuid, p_data_pagamento date, p_desconto numeric DEFAULT 0, p_juros numeric DEFAULT 0, p_outras_despesas numeric DEFAULT 0, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status text; v_lanc uuid; v_tipo text; v_valor numeric; v_saldo numeric;
  v_programada date; v_janela text; v_data_informada date; v_status_lanc text;
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_desconto numeric(14, 2);
  v_juros numeric(14, 2);
  v_outras numeric(14, 2);
  v_liquido numeric(14, 2);
  v_ve_grupo boolean;
begin
  select p.status, p.lancamento_id, l.tipo, p.valor, p.data_programada, l.status
  into v_status, v_lanc, v_tipo, v_valor, v_programada, v_status_lanc
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.id = p_parcela_id;

  if v_status is null then raise exception 'Parcela nao encontrada'; end if;

  if v_status_lanc = 'cancelado' then
    raise exception 'Este lancamento esta cancelado: nao da para pagar esta parcela';
  end if;

  v_data_informada := coalesce(p_data_pagamento, v_hoje);
  perform public.fn_conciliacao_exigir_data_aberta(p_conta_id, v_data_informada);

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

    v_janela := public.fn_janela_pagamento();

    if v_data_informada <> v_programada then
      if coalesce(btrim(p_motivo), '') = '' then
        raise exception 'Este pagamento esta fora da data autorizada (%): informe o motivo.',
          to_char(v_programada, 'DD/MM/YYYY');
      end if;
    end if;
  else
    if not public.tem_permissao('financeiro.recebimentos', 'editar') then
      raise exception 'Sem permissao para dar recebimento como recebido';
    end if;
    if v_status not in ('pendente', 'aprovado') then
      raise exception 'Recebimento ja baixado ou cancelado';
    end if;
  end if;

  v_desconto := round(coalesce(p_desconto, 0), 2);
  v_juros := round(coalesce(p_juros, 0), 2);
  v_outras := round(coalesce(p_outras_despesas, 0), 2);

  if v_desconto < 0 then
    raise exception 'O desconto nao pode ser negativo.';
  end if;

  if v_juros < 0 then
    raise exception 'Os juros nao podem ser negativos.';
  end if;

  if v_outras < 0 then
    raise exception 'As outras despesas nao podem ser negativas.';
  end if;

  if v_desconto > v_valor then
    raise exception 'O desconto (R$ %) nao pode ser maior que o valor da parcela (R$ %).',
      round(v_desconto, 2), round(v_valor, 2);
  end if;

  v_liquido := round(v_valor - v_desconto + v_juros + v_outras, 2);

  if p_conta_id is null then raise exception 'Informe a conta bancaria'; end if;

  if v_tipo = 'a_pagar' then
    select sum(public.fn_saldo_conta(c.id)), bool_and(public.fn_pode_ver_saldo(c.id))
      into v_saldo, v_ve_grupo
      from public.contas_bancarias c
     where c.id = (select coalesce(x.conta_pai_id, x.id) from public.contas_bancarias x where x.id = p_conta_id)
        or c.conta_pai_id = (select coalesce(x.conta_pai_id, x.id) from public.contas_bancarias x where x.id = p_conta_id);

    if coalesce(v_saldo, 0) - v_liquido < 0 then
      if coalesce(v_ve_grupo, false) then
        raise exception 'Saldo insuficiente na conta: saldo atual R$ % (com os investimentos), pagamento de R$ %.',
          round(coalesce(v_saldo, 0), 2), round(v_liquido, 2);
      else
        raise exception 'Saldo insuficiente nesta conta para o pagamento de R$ %.',
          round(v_liquido, 2);
      end if;
    end if;
  end if;

  update public.lancamento_parcelas
  set status = 'pago', conta_bancaria_id = p_conta_id,
      data_pagamento = v_data_informada,
      desconto = v_desconto,
      juros = v_juros,
      outras_despesas = v_outras,
      pago_por = (select auth.uid()), pago_em = now()
  where id = p_parcela_id;
  perform public.fn_recalcular_status_lancamento(v_lanc);

  if v_tipo = 'a_pagar' and v_data_informada <> v_programada then
    insert into public.parcela_eventos
      (parcela_id, tipo, motivo, data_de, data_para, created_by)
    values
      (p_parcela_id, 'pagou_fora_da_janela', btrim(p_motivo),
       v_programada, v_data_informada, (select auth.uid()));
  end if;

  perform public.fn_propagar_anexos('lancamento', v_lanc, 'pagamento', p_parcela_id);
end;
$function$;
