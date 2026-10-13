-- =============================================================
-- Conciliacao: o "Lancar" passa pela aprovacao e pelo pagamento
--
-- Pedido do Tiago (13/10/2026): "os lancamentos que sao feitos atraves da
-- conciliacao so podem ser conciliados depois que forem aprovados na
-- aprovacao de pagamento e quitados na aba de pagamentos; antes disso eles
-- podem ser lancados por la mas nao conciliados."
--
-- 1. lancamentos.extrato_transacao_id: o movimento do extrato de onde o
--    lancamento saiu. lancamentos.lancado_na_conciliacao: a marca que fica
--    mesmo se o extrato for excluido e importado de novo.
-- 2. fn_conciliacao_lancar deixa de criar o lancamento pago e conciliado.
--    Cria como um lancamento comum: parcela pendente com a conta do extrato
--    ja escolhida (a conta e o que marca o a pagar como revisado) e
--    vencimento no dia do movimento. Vai para Aprovacao de pagamentos e
--    depois para Pagamentos (recebimento: baixa em Recebimentos). Recusa
--    lancar duas vezes o mesmo movimento.
-- 3. fn_conciliacao_casar recusa parcela de lancamento feito pela
--    conciliacao enquanto ela nao estiver paga (antes, parcela aprovada
--    levava baixa pelo extrato).
-- 4. fn_conciliacao_painel: cada movimento traz o lancamento que saiu dele
--    ("lancado"), e as abertas deixam de oferecer esses lancamentos.
-- 5. Regras de "lancar" seguem o mesmo caminho: a automatica pula o
--    movimento que ja tem lancamento esperando, e a marca de automatica so
--    fica quando o movimento conciliou.
-- =============================================================

alter table public.lancamentos
  add column if not exists extrato_transacao_id uuid
    references public.extrato_transacoes (id) on delete set null,
  add column if not exists lancado_na_conciliacao boolean not null default false;

comment on column public.lancamentos.extrato_transacao_id is
  'Movimento do extrato de onde a conciliacao lancou este lancamento.';
comment on column public.lancamentos.lancado_na_conciliacao is
  'Lancado pelo botao Lancar da conciliacao: so casa com o extrato depois de pago.';

create index if not exists lancamentos_extrato_transacao_id_idx
  on public.lancamentos (extrato_transacao_id)
  where extrato_transacao_id is not null;

CREATE OR REPLACE FUNCTION public.fn_conciliacao_lancar(p_transacao_id uuid, p_dados jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_t public.extrato_transacoes;
  v_tipo text;
  v_valor numeric(14, 2);
  v_mes date;
  v_centro uuid;
  v_centro_ok boolean;
  v_categoria uuid;
  v_categoria_tipo text;
  v_descricao text;
  v_lanc uuid;
  v_ja text;
  v_quem uuid := (select auth.uid());
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;

  select * into v_t from public.extrato_transacoes where id = p_transacao_id for update;
  if v_t.id is null then raise exception 'Movimento do extrato nao encontrado'; end if;
  if v_t.conciliada then raise exception 'Este movimento ja esta conciliado'; end if;
  perform public.fn_conciliacao_exigir_mes_aberto(v_t.conta_bancaria_id, v_t.data_movimento);

  select coalesce(l.numero, 'sem numero') into v_ja
  from public.lancamentos l
  where l.extrato_transacao_id = p_transacao_id and l.status <> 'cancelado'
  limit 1;
  if v_ja is not null then
    raise exception 'Este movimento ja foi lancado (%): aprove, pague e depois case', v_ja;
  end if;

  v_tipo := case when v_t.tipo = 'credito' then 'a_receber' else 'a_pagar' end;
  if not public.fn_pode_lancar_tipo(v_tipo, 'criar') then
    raise exception 'Sem permissao para criar lancamentos';
  end if;

  v_valor := round(abs(v_t.valor), 2);
  v_descricao := nullif(btrim(coalesce(p_dados->>'descricao', '')), '');
  if v_descricao is null then
    v_descricao := coalesce(nullif(btrim(coalesce(v_t.memo, '')), ''), 'Movimento do extrato');
  end if;
  v_descricao := left(v_descricao, 500);

  begin
    v_mes := (p_dados->>'mesCompetencia')::date;
  exception when others then
    raise exception 'Mes de referencia invalido';
  end;
  if v_mes is null then raise exception 'Informe o mes de referencia'; end if;
  v_mes := date_trunc('month', v_mes)::date;

  begin
    v_centro := (p_dados->>'centroCustoId')::uuid;
    v_categoria := nullif(p_dados->>'categoriaId', '')::uuid;
  exception when others then
    raise exception 'Centro de custo ou categoria invalidos';
  end;
  if v_centro is null then raise exception 'Informe o centro de custo'; end if;
  select c.ativo into v_centro_ok from public.centros_custo c where c.id = v_centro;
  if v_centro_ok is null then raise exception 'Centro de custo nao encontrado'; end if;
  if not v_centro_ok then raise exception 'Centro de custo inativo'; end if;

  if v_categoria is not null then
    select c.tipo into v_categoria_tipo from public.categorias_financeiras c where c.id = v_categoria;
    if v_categoria_tipo is null then raise exception 'Categoria nao encontrada'; end if;
    if v_categoria_tipo <> (case when v_tipo = 'a_receber' then 'receita' else 'despesa' end) then
      raise exception 'A categoria escolhida nao e do tipo deste movimento';
    end if;
  end if;

  v_lanc := gen_random_uuid();
  perform public.fn_exigir_competencia_aberta(v_mes, 'lancamento', v_lanc);

  -- Nasce como um lancamento comum (o mesmo status de fn_salvar_lancamento),
  -- nao pago: segue para a aprovacao e o pagamento, e so depois casa.
  insert into public.lancamentos (
    id, tipo, origem, fornecedor_id, cliente_id, categoria_id, centro_custo_id,
    descricao, valor, status, data_compra, mes_competencia, data_vencimento,
    numero_documento, observacoes, extrato_transacao_id, lancado_na_conciliacao,
    created_by
  ) values (
    v_lanc, v_tipo, 'manual',
    case when v_tipo = 'a_pagar' then nullif(p_dados->>'fornecedorId', '')::uuid end,
    case when v_tipo = 'a_receber' then nullif(p_dados->>'clienteId', '')::uuid end,
    v_categoria,
    v_centro,
    v_descricao, v_valor, 'a_pagar', v_t.data_movimento, v_mes, v_t.data_movimento,
    nullif(left(btrim(coalesce(p_dados->>'numeroDocumento', '')), 60), ''),
    left(coalesce(nullif(btrim(coalesce(p_dados->>'observacoes', '')), ''),
      'Lancado na conciliacao do extrato: ' || coalesce(v_t.memo, '-')), 2000),
    p_transacao_id, true,
    v_quem
  );

  -- A conta ja vem do extrato: e o que marca o a pagar como revisado.
  insert into public.lancamento_parcelas (
    lancamento_id, numero_parcela, valor, data_vencimento, status,
    conta_bancaria_id, created_by
  ) values (
    v_lanc, 1, v_valor, v_t.data_movimento, 'pendente',
    v_t.conta_bancaria_id, v_quem
  );

  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  values (v_lanc, v_centro, v_valor, v_categoria, v_quem);

  perform public.fn_aplicar_regra_pagamento(v_lanc);
  perform public.fn_recalcular_status_lancamento(v_lanc);

  return v_lanc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_conciliacao_casar(p_transacao_id uuid, p_especie text, p_alvo_id uuid, p_automatica boolean, p_ajuste text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_da_conciliacao boolean;
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
  perform public.fn_conciliacao_exigir_mes_aberto(v_t.conta_bancaria_id, v_t.data_movimento);

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
  -- Tirar um pagamento de outra conta tambem mexe no mes fechado de la.
  if v_p.status = 'pago' and v_p.conta_bancaria_id is distinct from v_t.conta_bancaria_id then
    perform public.fn_conciliacao_exigir_mes_aberto(v_p.conta_bancaria_id, v_p.data_pagamento);
  end if;

  select l.tipo, l.status, l.mes_competencia, l.valor, l.origem, l.lancado_na_conciliacao
    into v_tipo_lanc, v_status_lanc, v_mes_lanc, v_lanc_valor, v_lanc_origem, v_da_conciliacao
  from public.lancamentos l where l.id = v_p.lancamento_id;
  if v_status_lanc = 'cancelado' then
    raise exception 'O lancamento desta parcela esta cancelado';
  end if;
  -- Lancado pela conciliacao: segue o caminho de qualquer lancamento e so
  -- casa depois de pago (Tiago, 13/10/2026). Nada de baixa pelo extrato.
  if coalesce(v_da_conciliacao, false) and v_p.status <> 'pago' then
    if v_tipo_lanc = 'a_pagar' then
      raise exception 'Este lancamento foi feito pela conciliacao: aprove em Aprovacao de pagamentos e pague em Pagamentos antes de conciliar';
    else
      raise exception 'Este lancamento foi feito pela conciliacao: de baixa em Recebimentos antes de conciliar';
    end if;
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

CREATE OR REPLACE FUNCTION public.fn_conciliacao_painel(p_conta_id uuid, p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_folga_paga int := 5;
  v_folga_aberta int := 45;
  v_tolerancia numeric := 1.00;
  v_valores numeric[];
  v_resultado jsonb;
  v_saldo jsonb;
  v_banco numeric(14, 2);
  v_banco_data date;
  v_tem_extrato boolean := false;
  v_app numeric(14, 2);
  v_pode_ver boolean;
  v_fechamento jsonb;
  v_corte date;
  v_saldo_banco jsonb;
  v_sub uuid;
  v_sub_banco numeric(14, 2);
  v_sub_app numeric(14, 2);
begin
  if not public.tem_permissao('financeiro.conciliacao', 'ver') then
    raise exception 'Sem permissao para ver a conciliacao';
  end if;
  if p_conta_id is null or p_inicio is null or p_fim is null then
    raise exception 'Informe a conta e o periodo';
  end if;
  if p_inicio > p_fim then
    raise exception 'O periodo comeca depois de terminar';
  end if;

  select coalesce(array_agg(distinct round(abs(t.valor), 2)), '{}')
    into v_valores
  from public.extrato_transacoes t
  where t.conta_bancaria_id = p_conta_id
    and t.data_movimento between p_inicio and p_fim
    and not t.conciliada;

  -- Saldo do banco no ultimo dia do periodo (Bloco K): encadeado a partir
  -- de uma ancora com extrato cobrindo; o LEDGERBAL so quando o banco diz que
  -- e do fim do periodo. So aparece quando algum extrato cobre esse dia.
  select true into v_tem_extrato
  from public.extratos_ofx e
  where e.conta_bancaria_id = p_conta_id
    and e.periodo_inicio <= p_fim and e.periodo_fim >= p_fim
  limit 1;

  if coalesce(v_tem_extrato, false) then
    v_pode_ver := public.fn_pode_ver_saldo(p_conta_id);
    select saldo_inicial_data into v_corte from public.contas_bancarias where id = p_conta_id;
    v_saldo_banco := public.fn_conciliacao_saldo_banco_no_dia(p_conta_id, p_fim);
    v_banco := (v_saldo_banco->>'banco')::numeric;
    v_banco_data := p_fim;
    v_app := public.fn_conciliacao_saldo_app_interno(p_conta_id, p_fim);

    select c.id into v_sub from public.contas_bancarias c where c.conta_pai_id = p_conta_id;
    if v_sub is not null then
      select a.saldo into v_sub_banco from public.conciliacao_saldos_ancora a
       where a.conta_bancaria_id = v_sub and a.data = p_fim;
      v_sub_app := public.fn_conciliacao_saldo_app_interno(v_sub, p_fim);
    end if;

    -- Quem nao ve saldo recebe so se bateu ou nao, calculado aqui.
    v_saldo := jsonb_build_object(
      'data', v_banco_data,
      'temSaldoNoArquivo', v_banco is not null,
      'podeVer', v_pode_ver,
      'banco', case when v_pode_ver then v_banco end,
      'bancoFonte', v_saldo_banco->>'fonte',
      'bancoAncora', v_saldo_banco->>'ancoraData',
      'motivo', v_saldo_banco->>'motivo',
      'app', case when v_pode_ver then v_app end,
      'diferenca', case when v_pode_ver and v_banco is not null then v_banco - v_app end,
      'bate', case when v_banco is null then null else v_banco = v_app end,
      'corte', v_corte,
      'antesDoCorte', v_corte is not null and v_banco_data < v_corte,
      'subconta', case when v_sub is null then null else jsonb_build_object(
        'banco', case when v_pode_ver then v_sub_banco end,
        'app', case when v_pode_ver then v_sub_app end,
        'temAncora', v_sub_banco is not null,
        'bate', case when v_sub_banco is null then null else v_sub_banco = v_sub_app end) end
    );
  end if;

  select jsonb_build_object(
           'fechadoEm', f.fechado_em,
           'fechadoPor', u.nome,
           'saldoBanco', case when public.fn_pode_ver_saldo(p_conta_id) then f.saldo_banco end)
    into v_fechamento
  from public.conciliacao_fechamentos f
  left join public.usuarios u on u.id = f.fechado_por
  where f.conta_bancaria_id = p_conta_id
    and f.mes = date_trunc('month', p_inicio)::date
    and f.reaberto_em is null;

  with base as (
    -- So o que pode interessar: pagas na janela, abertas na janela maior, e
    -- as ja vinculadas a movimentos deste periodo. Antes a CTE varria todas
    -- as parcelas do banco.
    select p.*
    from public.lancamento_parcelas p
    where (p.status = 'pago'
           and p.data_pagamento between p_inicio - v_folga_paga and p_fim + v_folga_paga)
       or (p.status in ('pendente', 'aprovado')
           and coalesce(p.data_programada, p.data_vencimento)
               between p_inicio - v_folga_aberta and p_fim + v_folga_aberta)
       or p.id in (
           select t.parcela_id from public.extrato_transacoes t
           where t.conta_bancaria_id = p_conta_id
             and t.data_movimento between p_inicio and p_fim
             and t.parcela_id is not null)
  ),
  parcela_info as (
    select
      p.id, p.lancamento_id, p.numero_parcela, p.status, p.valor, p.desconto,
      p.juros, p.outras_despesas, p.valor_liquido, p.data_pagamento,
      p.data_vencimento, p.data_programada, p.conta_bancaria_id,
      l.numero as lancamento_numero, l.descricao, l.tipo, l.origem,
      l.numero_documento,
      -- Apelidos bancarios do favorecido (Bloco I): o cedente que o banco
      -- escreve no historico e que a pessoa ja confirmou ser este fornecedor.
      coalesce((
        select array_agg(a.apelido order by a.apelido)
        from public.fornecedor_apelidos_bancarios a
        where (l.fornecedor_id is not null and a.fornecedor_id = l.fornecedor_id)
           or (l.colaborador_id is not null and a.colaborador_id = l.colaborador_id)
      ), '{}') as apelidos,
      coalesce(f.nome_fantasia, f.razao_social, cl.nome_fantasia, cl.nome, co.nome) as nome,
      f.razao_social as razao_social,
      l.lancado_na_conciliacao as da_conciliacao,
      cb.nome as conta_nome,
      q.qtd as qtd_parcelas,
      (exists (select 1 from public.extrato_transacoes e where e.parcela_id = p.id)
       or exists (select 1 from public.cartao_fatura_parcelas fp where fp.parcela_id = p.id)) as vinculada
    from base p
    join public.lancamentos l on l.id = p.lancamento_id
    left join public.fornecedores f on f.id = l.fornecedor_id
    left join public.clientes cl on cl.id = l.cliente_id
    left join public.colaboradores co on co.id = l.colaborador_id
    left join public.contas_bancarias cb on cb.id = p.conta_bancaria_id
    left join lateral (
      select count(*) as qtd from public.lancamento_parcelas p2 where p2.lancamento_id = p.lancamento_id
    ) q on true
    where l.status <> 'cancelado'
  ),
  livres as (
    select pi.* from parcela_info pi where not pi.vinculada
  ),
  -- Perto de algum movimento sem par (ate a tolerancia).
  perto as (
    select lv.* from livres lv
    where exists (
      select 1 from unnest(v_valores) v
      where abs(v - round(lv.valor_liquido, 2)) <= v_tolerancia
    )
  ),
  transf as (
    select
      tr.id, tr.numero, tr.descricao, tr.data_transferencia, tr.valor,
      tr.conta_origem_id, tr.conta_destino_id,
      o.nome as origem_nome, d.nome as destino_nome,
      case when tr.conta_origem_id = p_conta_id then 'saida' else 'entrada' end as lado
    from public.transferencias_contas tr
    join public.contas_bancarias o on o.id = tr.conta_origem_id
    join public.contas_bancarias d on d.id = tr.conta_destino_id
    where p_conta_id in (tr.conta_origem_id, tr.conta_destino_id)
  )
  select jsonb_build_object(
    'saldo', v_saldo,
    'fechamento', v_fechamento,
    'transacoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'extratoId', t.extrato_id,
        'dataMovimento', t.data_movimento,
        'valor', t.valor,
        'tipo', t.tipo,
        'memo', t.memo,
        'conciliada', t.conciliada,
        'automatica', t.conciliacao_automatica,
        'confiraConfirmado', t.confira_confirmado_em is not null,
        'parcela', case when pi.id is null then null else jsonb_build_object(
          'id', pi.id, 'lancamentoId', pi.lancamento_id, 'lancamentoNumero', pi.lancamento_numero,
          'descricao', pi.descricao, 'nome', pi.nome, 'numeroParcela', pi.numero_parcela,
          'valorLiquido', pi.valor_liquido, 'dataPagamento', pi.data_pagamento,
          'apelidos', to_jsonb(pi.apelidos)) end,
        'transferencia', case when tf.id is null then null else jsonb_build_object(
          'id', tf.id, 'numero', tf.numero, 'descricao', tf.descricao,
          'origemNome', tf.origem_nome, 'destinoNome', tf.destino_nome,
          'data', tf.data_transferencia) end,
        'estorno', case when ep.id is null then null else jsonb_build_object(
          'id', ep.id, 'dataMovimento', ep.data_movimento, 'valor', ep.valor,
          'memo', ep.memo) end,
        'lancado', case when lc.id is null then null else jsonb_build_object(
          'lancamentoId', lc.id, 'lancamentoNumero', lc.numero, 'tipo', lc.tipo,
          'parcelaId', lc.parcela_id, 'parcelaStatus', lc.parcela_status,
          'pagaNestaConta', lc.parcela_conta = t.conta_bancaria_id) end,
        'fatura', case when cf.id is null then null else jsonb_build_object(
          'id', cf.id, 'cartaoNome', cc.nome, 'vencimento', cf.vencimento,
          'qtdCompras', (select count(*) from public.cartao_fatura_parcelas fp where fp.fatura_id = cf.id),
          'encargos', cf.encargos) end
      ) order by t.data_movimento, t.created_at)
      from public.extrato_transacoes t
      left join parcela_info pi on pi.id = t.parcela_id
      left join transf tf on tf.id = t.transferencia_id
      left join public.extrato_transacoes ep on ep.id = t.estorno_par_id
      left join public.cartao_faturas cf on cf.id = t.cartao_fatura_id
      left join public.cartoes_credito cc on cc.id = cf.cartao_id
      left join lateral (
        select l.id, l.numero, l.tipo, p.id as parcela_id, p.status as parcela_status,
               p.conta_bancaria_id as parcela_conta
        from public.lancamentos l
        left join lateral (
          select p.* from public.lancamento_parcelas p
          where p.lancamento_id = l.id
          order by p.numero_parcela limit 1
        ) p on true
        where l.extrato_transacao_id = t.id and l.status <> 'cancelado'
        order by l.created_at desc limit 1
      ) lc on not t.conciliada
      where t.conta_bancaria_id = p_conta_id
        and t.data_movimento between p_inicio and p_fim
    ), '[]'::jsonb),

    -- Movimentos sem par logo antes e logo depois do periodo: o envio de
    -- uma TED devolvida no comeco do mes pode ter saido no mes anterior.
    'vizinhos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'dataMovimento', v.data_movimento, 'valor', v.valor,
        'tipo', v.tipo, 'memo', v.memo) order by v.data_movimento)
      from public.extrato_transacoes v
      where v.conta_bancaria_id = p_conta_id
        and not v.conciliada
        and (v.data_movimento between p_inicio - 10 and p_inicio - 1
             or v.data_movimento between p_fim + 1 and p_fim + 10)
    ), '[]'::jsonb),

    'pagasNaConta', coalesce((
      select jsonb_agg(to_jsonb(lv) order by lv."dataPagamento")
      from (
        select id, lancamento_id as "lancamentoId", lancamento_numero as "lancamentoNumero",
               descricao, nome, razao_social as "razaoSocial", tipo, origem,
               numero_parcela as "numeroParcela", qtd_parcelas as "qtdParcelas",
               valor, valor_liquido as "valorLiquido", data_pagamento as "dataPagamento",
               numero_documento as "numeroDocumento", status, conta_nome as "contaNome",
               conta_bancaria_id as "contaId", apelidos
        from livres
        where status = 'pago'
          and conta_bancaria_id = p_conta_id
      ) lv
    ), '[]'::jsonb),

    'pagasEmOutraConta', coalesce((
      select jsonb_agg(to_jsonb(lv) order by lv."dataPagamento")
      from (
        select id, lancamento_id as "lancamentoId", lancamento_numero as "lancamentoNumero",
               descricao, nome, razao_social as "razaoSocial", tipo, origem,
               numero_parcela as "numeroParcela", qtd_parcelas as "qtdParcelas",
               valor, valor_liquido as "valorLiquido", data_pagamento as "dataPagamento",
               numero_documento as "numeroDocumento", status, conta_nome as "contaNome",
               conta_bancaria_id as "contaId", apelidos
        from perto
        where status = 'pago'
          and conta_bancaria_id is distinct from p_conta_id
      ) lv
    ), '[]'::jsonb),

    'abertas', coalesce((
      select jsonb_agg(to_jsonb(lv) order by lv."dataVencimento")
      from (
        select id, lancamento_id as "lancamentoId", lancamento_numero as "lancamentoNumero",
               descricao, nome, razao_social as "razaoSocial", tipo, origem,
               numero_parcela as "numeroParcela", qtd_parcelas as "qtdParcelas",
               valor, valor_liquido as "valorLiquido",
               coalesce(data_programada, data_vencimento) as "dataVencimento",
               numero_documento as "numeroDocumento", status, conta_nome as "contaNome",
               conta_bancaria_id as "contaId", apelidos
        from perto
        where status in ('pendente', 'aprovado')
          -- Lancado pela conciliacao so casa depois de pago.
          and not da_conciliacao
      ) lv
    ), '[]'::jsonb),

    'transferencias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tf.id, 'numero', tf.numero, 'descricao', tf.descricao,
        'data', tf.data_transferencia, 'valor', tf.valor, 'lado', tf.lado,
        'origemNome', tf.origem_nome, 'destinoNome', tf.destino_nome
      ) order by tf.data_transferencia)
      from transf tf
      where tf.data_transferencia between p_inicio - v_folga_paga and p_fim + v_folga_paga
        and not exists (
          select 1 from public.extrato_transacoes e
          where e.transferencia_id = tf.id
            and e.tipo = case when tf.lado = 'saida' then 'debito' else 'credito' end
        )
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_conciliacao_aplicar_regras(p_conta_id uuid, p_mes date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_t record;
  v_regra public.conciliacao_regras;
  v_aplicadas int := 0;
  v_sugeridas int := 0;
  v_por jsonb := '{}'::jsonb;
  v_ignoradas jsonb := '[]'::jsonb;
  v_inicio date;
  v_fim date;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  if p_conta_id is null then raise exception 'Informe a conta'; end if;
  if p_mes is not null then
    v_inicio := date_trunc('month', p_mes)::date;
    v_fim := (v_inicio + interval '1 month - 1 day')::date;
    perform public.fn_conciliacao_exigir_mes_aberto(p_conta_id, v_inicio);
  end if;

  for v_t in
    select t.id, t.tipo, public.fn_conciliacao_normalizar_historico(t.memo) as historico
    from public.extrato_transacoes t
    where t.conta_bancaria_id = p_conta_id and not t.conciliada
      -- Ja lancado pela conciliacao: espera aprovacao e pagamento.
      and not exists (
        select 1 from public.lancamentos l
        where l.extrato_transacao_id = t.id and l.status <> 'cancelado')
      and (p_mes is null or t.data_movimento between v_inicio and v_fim)
    order by t.data_movimento, t.created_at
  loop
    -- A primeira regra ativa que casa: a da conta antes da geral, por nome.
    select r.* into v_regra
    from public.conciliacao_regras r
    where r.ativa and r.acao <> 'apelido'
      and (r.conta_bancaria_id is null or r.conta_bancaria_id = p_conta_id)
      and (r.sentido is null or r.sentido = v_t.tipo)
      and position(r.padrao in coalesce(v_t.historico, '')) > 0
    order by (r.conta_bancaria_id is null), r.nome, r.id
    limit 1;
    if v_regra.id is null then continue; end if;
    if not v_regra.automatica then
      v_sugeridas := v_sugeridas + 1;
      continue;
    end if;
    begin
      perform public.fn_conciliacao_aplicar_regra_interna(v_regra, v_t.id, true);
      v_aplicadas := v_aplicadas + 1;
      v_por := jsonb_set(v_por, array[v_regra.id::text],
        jsonb_build_object('regraId', v_regra.id, 'nome', v_regra.nome,
          'qtd', coalesce((v_por->v_regra.id::text->>'qtd')::int, 0) + 1));
    exception when others then
      v_ignoradas := v_ignoradas || jsonb_build_object(
        'transacaoId', v_t.id, 'regra', v_regra.nome, 'erro', sqlerrm);
    end;
  end loop;

  return jsonb_build_object(
    'aplicadas', v_aplicadas,
    'porRegra', coalesce((select jsonb_agg(value) from jsonb_each(v_por)), '[]'::jsonb),
    'sugeridas', v_sugeridas,
    'ignoradas', v_ignoradas);
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_conciliacao_aplicar_regra_interna(p_regra conciliacao_regras, p_transacao_id uuid, p_automatica boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_t public.extrato_transacoes;
  v_contraparte public.contas_bancarias;
  v_conta public.contas_bancarias;
  v_aplicacao uuid;
  v_qtd int;
begin
  select * into v_t from public.extrato_transacoes where id = p_transacao_id;
  if v_t.id is null then raise exception 'Movimento do extrato nao encontrado'; end if;
  if v_t.conciliada then raise exception 'Este movimento ja esta conciliado'; end if;
  if not p_regra.ativa then raise exception 'A regra % esta inativa', p_regra.nome; end if;
  if p_regra.conta_bancaria_id is not null and p_regra.conta_bancaria_id <> v_t.conta_bancaria_id then
    raise exception 'A regra % e de outra conta', p_regra.nome;
  end if;
  if p_regra.sentido is not null and p_regra.sentido <> v_t.tipo then
    raise exception 'A regra % e so para %', p_regra.nome, p_regra.sentido;
  end if;
  if position(p_regra.padrao in coalesce(public.fn_conciliacao_normalizar_historico(v_t.memo), '')) = 0 then
    raise exception 'O historico nao tem o texto da regra %', p_regra.nome;
  end if;

  if p_regra.acao = 'transferencia' then
    select * into v_conta from public.contas_bancarias where id = v_t.conta_bancaria_id;
    select * into v_contraparte from public.contas_bancarias where id = p_regra.conta_contraparte_id;
    if v_contraparte.id is null then raise exception 'A conta da regra % nao existe mais', p_regra.nome; end if;
    if v_contraparte.tipo = 'investimento' or v_conta.tipo = 'investimento' then
      v_aplicacao := p_regra.centro_custo_id;
      if v_aplicacao is null then
        select count(*), min(a.centro_custo_id::text)::uuid into v_qtd, v_aplicacao
        from public.aplicacoes a
        where a.ativa and a.conta_bancaria_id = case when v_contraparte.tipo = 'investimento' then v_contraparte.id else v_conta.id end;
        if v_qtd = 0 then raise exception 'Cadastre a aplicacao da subconta'; end if;
        if v_qtd > 1 then raise exception 'A subconta tem mais de uma aplicacao: escolha a aplicacao na regra %', p_regra.nome; end if;
      end if;
    end if;
    perform public.fn_conciliacao_lancar_transferencia(
      v_t.id, v_contraparte.id, v_aplicacao, p_regra.nome || ' (regra)');
  elsif p_regra.acao = 'lancar' then
    perform public.fn_conciliacao_lancar(v_t.id, jsonb_build_object(
      'mesCompetencia', date_trunc('month', v_t.data_movimento)::date,
      'centroCustoId', p_regra.centro_custo_id,
      'categoriaId', p_regra.categoria_id,
      'fornecedorId', p_regra.fornecedor_id,
      'observacoes', 'Lancado pela regra de conciliacao ' || p_regra.nome || ': ' || coalesce(v_t.memo, '-')));
  else
    raise exception 'A regra % nao lanca nada', p_regra.nome;
  end if;

  -- A regra de lancar so cria o lancamento (ele passa pela aprovacao e pelo
  -- pagamento antes de casar): a marca de automatica so vale se conciliou.
  update public.extrato_transacoes set conciliacao_automatica = coalesce(p_automatica, false)
   where id = v_t.id and conciliada;
  update public.conciliacao_regras
     set vezes_aplicada = vezes_aplicada + 1, ultima_aplicacao = now()
   where id = p_regra.id;
end;
$function$;
