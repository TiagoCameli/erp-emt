-- =============================================================
-- Conciliacao 100% precisa, Bloco D: a diferenca de ate R$ 1,00 e juros,
-- desconto ou custo do fornecedor, e quem concilia escolhe
--
-- Decisao do Tiago (03/10/2026): as vezes o centavo e do proprio preco do
-- fornecedor (arredondamento de boleto) e tem que cair como custo no centro
-- de custo, nao como despesa financeira.
--
-- 1. fn_conciliacao_casar ganha a sobrecarga (..., p_automatica boolean,
--    p_ajuste text), SEM valores padrao (com padrao nas duas a chamada com 3
--    argumentos ficaria ambigua). p_ajuste: null (sem ajuste), 'financeiro'
--    (juros se o banco saiu a mais, desconto se saiu a menos, como antes) ou
--    'custo' (muda o valor do fornecimento).
-- 2. A versao antiga (p_ajustar boolean) vira repasse: true = 'financeiro'.
--    O codigo no ar continua funcionando ate o deploy; a remocao dela e outra
--    migration, depois do deploy e com ok do Tiago.
-- 3. 'custo': parcela.valor, lancamentos.valor (a coluna e "valor", nao
--    "valor_total"), a forma da parcela quando existe e os rateios
--    (proporcional, o ultimo absorve o arredondamento) recebem a diferenca;
--    juros e desconto nao mudam. A OC de origem nao e tocada. Origem de RH
--    (folha, guias, 13o, ferias, rescisao, adiantamento, diaria) e aplicacao
--    nao aceitam 'custo'. Exige a permissao de mexer no pago e competencia
--    aberta, mesmo com a parcela ainda aberta.
-- 4. Evento com o texto pedido: "... - juros", "... - desconto" ou
--    "valor do fornecimento ajustado de R$ X para R$ Y (diferenca R$ Z) - custo",
--    com os valores no formato brasileiro (fn_conciliacao_brl; antes saia
--    "1,716.66").
-- 5. O lote (automatico) continua sem ajuste nenhum.
-- =============================================================

create or replace function public.fn_conciliacao_brl(p_valor numeric)
returns text
language sql
immutable
set search_path to ''
as $function$
  select translate(to_char(round(p_valor, 2), 'FM999G999G999G990D00'), ',.', '.,')
$function$;

revoke all on function public.fn_conciliacao_brl(numeric) from public, anon, authenticated;

create or replace function public.fn_conciliacao_casar(
  p_transacao_id uuid,
  p_especie text,
  p_alvo_id uuid,
  p_automatica boolean,
  p_ajuste text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_t public.extrato_transacoes;
  v_p public.lancamento_parcelas;
  v_tipo_lanc text;
  v_status_lanc text;
  v_mes_lanc date;
  v_conta_antiga text;
  v_conta_nova text;
  v_banco numeric(14, 2);
  v_diferenca numeric(14, 2);
  v_juros numeric(14, 2);
  v_desconto numeric(14, 2);
  v_partes text[] := '{}';
  v_muda_pago boolean;
  v_lanc_valor numeric(14, 2);
  v_lanc_origem text;
  v_soma_antiga numeric(14, 2);
  v_acumulado numeric(14, 2) := 0;
  v_rateio record;
  v_novo numeric(14, 2);
  v_qtd_rateios int;
  v_i int := 0;
begin
  if p_ajuste is not null and p_ajuste not in ('financeiro', 'custo') then
    raise exception 'Ajuste invalido: use financeiro ou custo';
  end if;
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;

  select * into v_t from public.extrato_transacoes where id = p_transacao_id for update;
  if v_t.id is null then raise exception 'Movimento do extrato nao encontrado'; end if;
  if v_t.conciliada then raise exception 'Este movimento ja esta conciliado'; end if;

  if p_especie = 'transferencia' then
    perform public.fn_conciliar_transferencia(p_transacao_id, p_alvo_id);
    update public.extrato_transacoes
       set conciliacao_automatica = coalesce(p_automatica, false)
     where id = p_transacao_id;
    return;
  end if;

  if p_especie is distinct from 'parcela' then
    raise exception 'Tipo de vinculo invalido';
  end if;

  select * into v_p from public.lancamento_parcelas where id = p_alvo_id for update;
  if v_p.id is null then raise exception 'Parcela nao encontrada'; end if;

  select l.tipo, l.status, l.mes_competencia, l.valor, l.origem
    into v_tipo_lanc, v_status_lanc, v_mes_lanc, v_lanc_valor, v_lanc_origem
  from public.lancamentos l where l.id = v_p.lancamento_id;
  if v_status_lanc = 'cancelado' then
    raise exception 'O lancamento desta parcela esta cancelado';
  end if;

  if (v_t.tipo = 'credito') <> (v_tipo_lanc = 'a_receber') then
    raise exception 'Credito so casa com recebimento, e debito so com pagamento';
  end if;

  if exists (select 1 from public.extrato_transacoes e where e.parcela_id = v_p.id) then
    raise exception 'Esta parcela ja esta conciliada com outro movimento';
  end if;

  if coalesce(p_automatica, false) and (
       p_ajuste is not null
       or v_p.status <> 'pago'
       or v_p.conta_bancaria_id is distinct from v_t.conta_bancaria_id
       or round(v_p.valor_liquido, 2) <> round(abs(v_t.valor), 2)
     ) then
    raise exception 'O casamento automatico so vincula parcela paga nesta conta com o valor exato';
  end if;

  v_banco := round(abs(v_t.valor), 2);
  v_diferenca := v_banco - round(v_p.valor_liquido, 2);

  if abs(v_diferenca) > 1 then
    raise exception 'O valor do extrato (R$ %) difere da parcela (R$ %) em mais de R$ 1,00: nao e o mesmo pagamento',
      v_banco, round(v_p.valor_liquido, 2);
  end if;
  if v_diferenca <> 0 and p_ajuste is null then
    raise exception 'O valor do extrato (R$ %) difere da parcela (R$ %)', v_banco, round(v_p.valor_liquido, 2);
  end if;

  -- Mexer em parcela paga (conta ou valor) e coisa de quem paga/recebe, e nao
  -- se faz em competencia fechada.
  -- Salario nao muda de valor por centavo de banco: RH so aceita financeiro.
  if v_diferenca <> 0 and p_ajuste = 'custo' and v_lanc_origem in (
       'folha', 'folha_guia', 'decimo_terceiro', 'decimo_terceiro_guia', 'ferias', 'ferias_guia',
       'rescisao', 'adiantamento', 'diaria', 'aplicacao') then
    raise exception 'Lancamento de origem % nao aceita ajuste como custo: salario e guia nao mudam de valor por centavo de banco. Use o ajuste financeiro (juros ou desconto).', v_lanc_origem;
  end if;

  v_muda_pago := v_p.status = 'pago'
    and (v_p.conta_bancaria_id is distinct from v_t.conta_bancaria_id or v_diferenca <> 0);
  -- Mudar o valor do fornecimento e mexer no pagamento mesmo com a parcela
  -- ainda aberta.
  if v_diferenca <> 0 and p_ajuste = 'custo' and not v_muda_pago then
    if not public.fn_conciliacao_pode_mexer_no_pago(v_tipo_lanc) then
      raise exception 'Sem permissao para alterar um pagamento ja registrado';
    end if;
    perform public.fn_exigir_competencia_aberta(v_mes_lanc, 'lancamento', v_p.lancamento_id);
  end if;
  if v_muda_pago then
    if not public.fn_conciliacao_pode_mexer_no_pago(v_tipo_lanc) then
      raise exception 'Sem permissao para alterar um pagamento ja registrado';
    end if;
    perform public.fn_exigir_competencia_aberta(v_mes_lanc, 'lancamento', v_p.lancamento_id);
  end if;

  if v_p.status = 'pago' then
    if v_p.conta_bancaria_id is distinct from v_t.conta_bancaria_id then
      select nome into v_conta_antiga from public.contas_bancarias where id = v_p.conta_bancaria_id;
      select nome into v_conta_nova from public.contas_bancarias where id = v_t.conta_bancaria_id;
      update public.lancamento_parcelas
         set conta_bancaria_id = v_t.conta_bancaria_id
       where id = v_p.id;
      v_partes := v_partes || format('conta trocada de %s para %s',
        coalesce(v_conta_antiga, 'nenhuma'), v_conta_nova);
    end if;
  elsif v_tipo_lanc = 'a_pagar' and v_p.status = 'aprovado' then
    if not public.tem_permissao('financeiro.pagamentos', 'criar') then
      raise exception 'Sem permissao para registrar pagamentos';
    end if;
  elsif v_tipo_lanc = 'a_pagar' then
    raise exception 'Esta parcela ainda nao foi aprovada para pagamento: aprove em Aprovacao de pagamentos antes de casar';
  elsif v_status_lanc is not null and v_p.status in ('pendente', 'aprovado') then
    if not public.tem_permissao('financeiro.recebimentos', 'editar') then
      raise exception 'Sem permissao para dar recebimento como recebido';
    end if;
  else
    raise exception 'Esta parcela nao pode ser conciliada (situacao: %)', v_p.status;
  end if;

  if v_p.status <> 'pago' then
    update public.lancamento_parcelas
       set status = 'pago',
           conta_bancaria_id = v_t.conta_bancaria_id,
           data_pagamento = v_t.data_movimento,
           pago_por = (select auth.uid()),
           pago_em = now()
     where id = v_p.id;
    v_partes := v_partes || format('baixa em %s pelo extrato',
      to_char(v_t.data_movimento, 'DD/MM/YYYY'));
  end if;

  if v_diferenca <> 0 and p_ajuste = 'financeiro' then
    v_juros := coalesce(v_p.juros, 0);
    v_desconto := coalesce(v_p.desconto, 0);
    if v_diferenca > 0 then
      if v_desconto >= v_diferenca then
        v_desconto := v_desconto - v_diferenca;
      else
        v_juros := v_juros + (v_diferenca - v_desconto);
        v_desconto := 0;
      end if;
    else
      if v_juros >= -v_diferenca then
        v_juros := v_juros + v_diferenca;
      else
        v_desconto := v_desconto + (-v_diferenca - v_juros);
        v_juros := 0;
      end if;
    end if;

    if v_desconto > v_p.valor then
      raise exception 'A diferenca e maior que a propria parcela: confira o movimento';
    end if;

    update public.lancamento_parcelas
       set juros = v_juros, desconto = v_desconto
     where id = v_p.id;
    v_partes := v_partes || format('valor ajustado de R$ %s para R$ %s - %s',
      public.fn_conciliacao_brl(round(v_p.valor_liquido, 2)),
      public.fn_conciliacao_brl(v_banco),
      case when v_diferenca > 0 then 'juros' else 'desconto' end);
  elsif v_diferenca <> 0 and p_ajuste = 'custo' then
    -- O valor do fornecimento muda: parcela, lancamento, forma da parcela e
    -- rateios (proporcional, o ultimo absorve o arredondamento). Juros e
    -- desconto nao mudam. A OC de origem nao e tocada: ela e o pedido, o
    -- lancamento e o que foi pago.
    if v_p.valor + v_diferenca < coalesce(v_p.desconto, 0) then
      raise exception 'O ajuste deixaria a parcela menor que o desconto ja dado';
    end if;
    update public.lancamento_parcelas set valor = valor + v_diferenca where id = v_p.id;
    if v_p.lancamento_forma_id is not null then
      update public.lancamento_formas set valor = valor + v_diferenca where id = v_p.lancamento_forma_id;
    end if;
    update public.lancamentos set valor = valor + v_diferenca where id = v_p.lancamento_id;

    select count(*), coalesce(sum(valor), 0) into v_qtd_rateios, v_soma_antiga
    from public.lancamento_rateios where lancamento_id = v_p.lancamento_id;
    for v_rateio in
      select id, valor from public.lancamento_rateios
      where lancamento_id = v_p.lancamento_id
      order by created_at, id
    loop
      v_i := v_i + 1;
      if v_i = v_qtd_rateios then
        v_novo := (v_lanc_valor + v_diferenca) - v_acumulado;
      elsif v_soma_antiga = 0 then
        v_novo := v_rateio.valor;
      else
        v_novo := round(v_rateio.valor * (v_lanc_valor + v_diferenca) / v_soma_antiga, 2);
      end if;
      v_acumulado := v_acumulado + v_novo;
      update public.lancamento_rateios set valor = v_novo where id = v_rateio.id;
    end loop;

    v_partes := v_partes || format('valor do fornecimento ajustado de R$ %s para R$ %s (diferenca R$ %s) - custo',
      public.fn_conciliacao_brl(round(v_p.valor, 2)),
      public.fn_conciliacao_brl(round(v_p.valor + v_diferenca, 2)),
      public.fn_conciliacao_brl(v_diferenca));
  end if;

  if array_length(v_partes, 1) > 0 then
    insert into public.parcela_eventos (parcela_id, tipo, motivo, valor_de, valor_para, created_by)
    values (
      v_p.id, 'alterou',
      'Conciliacao do extrato: ' || array_to_string(v_partes, '; '),
      case when v_diferenca <> 0 then round(v_p.valor_liquido, 2) end,
      case when v_diferenca <> 0 then v_banco end,
      (select auth.uid())
    );
    perform public.fn_recalcular_status_lancamento(v_p.lancamento_id);
  end if;

  if v_p.status <> 'pago' then
    perform public.fn_propagar_anexos('lancamento', v_p.lancamento_id, 'pagamento', v_p.id);
  end if;

  perform public.fn_conciliar_transacao(p_transacao_id, v_p.id);
  update public.extrato_transacoes
     set conciliacao_automatica = coalesce(p_automatica, false)
   where id = p_transacao_id;
end;
$function$;

revoke all on function public.fn_conciliacao_casar(uuid, text, uuid, boolean, text) from public, anon;
grant execute on function public.fn_conciliacao_casar(uuid, text, uuid, boolean, text) to authenticated;

-- A antiga vira repasse, ate o front novo subir.
create or replace function public.fn_conciliacao_casar(
  p_transacao_id uuid,
  p_especie text,
  p_alvo_id uuid,
  p_automatica boolean default false,
  p_ajustar boolean default false
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform public.fn_conciliacao_casar(
    p_transacao_id, p_especie, p_alvo_id, coalesce(p_automatica, false),
    case when coalesce(p_ajustar, false) then 'financeiro' end::text);
end;
$function$;

-- O lote chama a nova, sem ajuste.
create or replace function public.fn_conciliacao_casar_lote(p_pares jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_par jsonb;
  v_casadas int := 0;
  v_falhas jsonb := '[]'::jsonb;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  if jsonb_typeof(p_pares) is distinct from 'array' then
    raise exception 'Lista de pares invalida';
  end if;

  for v_par in select * from jsonb_array_elements(p_pares) loop
    begin
      perform public.fn_conciliacao_casar(
        (v_par->>'transacao')::uuid,
        v_par->>'especie',
        (v_par->>'alvo')::uuid,
        true,
        null::text
      );
      v_casadas := v_casadas + 1;
    exception when others then
      v_falhas := v_falhas || jsonb_build_object(
        'transacao', v_par->>'transacao', 'erro', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('casadas', v_casadas, 'falhas', v_falhas);
end;
$function$;
