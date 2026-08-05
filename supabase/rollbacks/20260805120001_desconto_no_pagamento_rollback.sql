-- Rollback de 20260805120001_desconto_no_pagamento.sql
--
-- ATENCAO, ler antes de rodar: este rollback APAGA os descontos ja gravados.
-- Toda parcela paga com desconto volta a valer o valor cheio em todo lugar que
-- deriva saldo, e o saldo das contas cai a diferenca. Se ja houver desconto
-- gravado, guarde a lista antes:
--
--   select id, lancamento_id, numero_parcela, valor, desconto, data_pagamento
--   from public.lancamento_parcelas where desconto <> 0;
--
-- Volta as seis funcoes para a definicao viva de antes da migracao
-- (fn_pagar_parcela md5(prosrc) = 89a1555c23f6625de1675af5b41dd094,
--  fn_estornar_pagamento md5(prosrc) = 2440482b60440bab25a69f2527905d39).

-- ---------------------------------------------------------------------------
-- 1. Funcoes de relatorio voltam a somar `valor`
-- ---------------------------------------------------------------------------

create or replace function public.fn_rel_posicao_bancaria()
returns table(conta_bancaria_id uuid, tipo text, total numeric)
language sql
stable
set search_path to ''
as $function$
  select p.conta_bancaria_id, l.tipo, sum(p.valor) as total
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.status = 'pago'
    and p.conta_bancaria_id is not null
    and l.status <> 'cancelado'
  group by p.conta_bancaria_id, l.tipo
$function$;

create or replace function public.fn_rel_fluxo_caixa()
returns table(mes text, tipo text, realizado boolean, total numeric)
language sql
stable
set search_path to ''
as $function$
  select t.mes, t.tipo, t.realizado, sum(t.valor) as total
  from (
    select
      case
        when p.status = 'pago'
          then to_char(coalesce(p.data_pagamento, p.data_vencimento), 'YYYY-MM')
        else to_char(coalesce(p.data_programada, p.data_vencimento), 'YYYY-MM')
      end as mes,
      l.tipo,
      (p.status = 'pago') as realizado,
      p.valor
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    where p.status <> 'cancelado'
      and l.status <> 'cancelado'
  ) t
  where t.mes is not null
  group by t.mes, t.tipo, t.realizado
$function$;

create or replace function public.fn_rel_gestao_financeiro_resumo(p_hoje date default null::date)
returns table(a_pagar_contagem integer, a_pagar_vencidas integer, a_pagar_valor numeric, a_aprovar_contagem integer, a_aprovar_valor numeric, pago_mes_contagem integer, pago_mes_valor numeric)
language sql
stable
set search_path to ''
as $function$
  with janela as (
    select
      d.hoje,
      d.hoje + 7 as limite7,
      date_trunc('month', d.hoje)::date as inicio_mes,
      (date_trunc('month', d.hoje) + interval '1 month')::date as proximo_mes
    from (
      select coalesce(
        p_hoje,
        (now() at time zone 'America/Rio_Branco')::date
      ) as hoje
    ) d
  ),
  base as (
    -- Lancamento cancelado nao e divida: fora dos tres cortes, com o MESMO
    -- criterio das fn_rel_* irmas. Parcela cancelada ja cai fora sozinha,
    -- porque cada corte abaixo exige um status exato de parcela.
    select p.status, p.valor, p.data_vencimento, p.data_pagamento
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
  )
  -- left join ... on true garante uma linha mesmo com base vazia: os FILTER
  -- viram falso e a funcao devolve zeros, nunca "nenhuma linha".
  select
    count(*) filter (
      where b.status = 'aprovado' and b.data_vencimento <= j.limite7
    )::int,
    count(*) filter (
      where b.status = 'aprovado'
        and b.data_vencimento <= j.limite7
        and b.data_vencimento < j.hoje
    )::int,
    coalesce(sum(b.valor) filter (
      where b.status = 'aprovado' and b.data_vencimento <= j.limite7
    ), 0),
    count(*) filter (where b.status = 'pendente')::int,
    coalesce(sum(b.valor) filter (where b.status = 'pendente'), 0),
    count(*) filter (
      where b.status = 'pago'
        and b.data_pagamento >= j.inicio_mes
        and b.data_pagamento < j.proximo_mes
    )::int,
    coalesce(sum(b.valor) filter (
      where b.status = 'pago'
        and b.data_pagamento >= j.inicio_mes
        and b.data_pagamento < j.proximo_mes
    ), 0)
  from janela j
  left join base b on true
$function$;

-- ---------------------------------------------------------------------------
-- 2. fn_conciliar_transacao volta a casar pelo valor cheio
-- ---------------------------------------------------------------------------

create or replace function public.fn_conciliar_transacao(p_transacao_id uuid, p_parcela_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_t_conta uuid; v_t_valor numeric(14,2); v_t_tipo text; v_t_conciliada boolean;
  v_p_status text; v_p_conta uuid; v_p_valor numeric(14,2); v_l_tipo text;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then raise exception 'Sem permissao para conciliar'; end if;

  select t.conta_bancaria_id, t.valor, t.tipo, t.conciliada
  into v_t_conta, v_t_valor, v_t_tipo, v_t_conciliada
  from public.extrato_transacoes t where t.id = p_transacao_id;
  if v_t_conta is null then raise exception 'Transacao nao encontrada'; end if;
  if v_t_conciliada then raise exception 'Transacao ja conciliada'; end if;

  select p.status, p.conta_bancaria_id, p.valor, l.tipo
  into v_p_status, v_p_conta, v_p_valor, v_l_tipo
  from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id
  where p.id = p_parcela_id;
  if v_p_status is null then raise exception 'Parcela nao encontrada'; end if;
  if v_p_status <> 'pago' then raise exception 'So da para conciliar uma parcela ja paga'; end if;
  if v_p_conta is distinct from v_t_conta then raise exception 'A parcela e de outra conta bancaria'; end if;
  if round(v_p_valor, 2) <> round(abs(v_t_valor), 2) then raise exception 'O valor da parcela diverge do valor da transacao'; end if;
  if (v_t_tipo = 'credito' and v_l_tipo <> 'a_receber')
     or (v_t_tipo = 'debito' and v_l_tipo <> 'a_pagar') then
    raise exception 'O sentido da transacao nao corresponde ao tipo do lancamento';
  end if;
  if exists (select 1 from public.extrato_transacoes where parcela_id = p_parcela_id and id <> p_transacao_id) then
    raise exception 'Parcela ja conciliada com outra transacao';
  end if;

  update public.extrato_transacoes
  set conciliada = true, parcela_id = p_parcela_id, conciliado_por = (select auth.uid()), conciliado_em = now()
  where id = p_transacao_id;
end $function$;

-- ---------------------------------------------------------------------------
-- 3. fn_estornar_pagamento volta a nao mexer em desconto
-- ---------------------------------------------------------------------------

create or replace function public.fn_estornar_pagamento(p_parcela_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_status text; v_lanc uuid; v_tipo text;
begin
  if not public.tem_permissao('financeiro.pagamentos', 'excluir') then
    raise exception 'Sem permissao para estornar pagamentos';
  end if;
  select p.status, p.lancamento_id, l.tipo into v_status, v_lanc, v_tipo
    from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id
    where p.id = p_parcela_id;
  if v_status is null then raise exception 'Parcela nao encontrada'; end if;
  if v_status <> 'pago' then raise exception 'Esta parcela nao esta paga'; end if;
  if exists (select 1 from public.extrato_transacoes t where t.parcela_id = p_parcela_id) then
    raise exception 'Nao da para estornar: este pagamento esta conciliado. Desfaca a conciliacao primeiro';
  end if;
  update public.lancamento_parcelas
    set status = case when v_tipo = 'a_pagar' then 'aprovado' else 'pendente' end,
        conta_bancaria_id = null, data_pagamento = null, pago_por = null, pago_em = null
    where id = p_parcela_id;
  perform public.fn_recalcular_status_lancamento(v_lanc);
end $function$;

-- ---------------------------------------------------------------------------
-- 4. fn_pagar_parcela volta a assinatura de 3 argumentos
-- ---------------------------------------------------------------------------
-- Drop da de 4 antes de recriar a de 3, senao as duas convivem e a chamada de
-- 3 argumentos fica ambigua ("function is not unique").

drop function if exists public.fn_pagar_parcela(uuid, uuid, date, numeric);

create or replace function public.fn_pagar_parcela(
  p_parcela_id uuid,
  p_conta_id uuid,
  p_data_pagamento date
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
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

  if v_status_lanc = 'cancelado' then
    raise exception 'Este lancamento esta cancelado: nao da para pagar esta parcela';
  end if;

  v_data_informada := coalesce(p_data_pagamento, v_hoje);

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
$function$;

revoke all on function public.fn_pagar_parcela(uuid, uuid, date) from public;
grant execute on function public.fn_pagar_parcela(uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Colunas
-- ---------------------------------------------------------------------------
-- valor_liquido primeiro: e gerada a partir de desconto, entao dropar desconto
-- com ela viva falharia.

alter table public.lancamento_parcelas drop column if exists valor_liquido;

alter table public.lancamento_parcelas
  drop constraint if exists lancamento_parcelas_desconto_valido;

alter table public.lancamento_parcelas drop column if exists desconto;

notify pgrst, 'reload schema';
