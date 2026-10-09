-- Trava por data em mes conciliado (PR 1 do controle total, 09/10/2026).
--
-- A trava antiga (fn_conciliacao_exigir_mes_aberto) olha so o mes exato do
-- movimento e continua nas operacoes da propria conciliacao. Esta olha o ULTIMO
-- mes fechado da conta: mexer em julho muda o saldo de setembro fechado. Vale
-- para o que mexe em saldo: pagar, estornar, salvar e excluir transferencia e
-- gravar posicao de aplicacao. Subconta de investimento nao fecha sozinha
-- (#419), entao vale o fechamento da conta pai.

create or replace function public.fn_conciliacao_exigir_data_aberta(p_conta_id uuid, p_data date)
 returns void
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_pai uuid; v_mes date; v_nome text;
  v_meses text[] := array['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
begin
  if p_conta_id is null or p_data is null then return; end if;
  select coalesce(c.conta_pai_id, c.id), c.nome into v_pai, v_nome
    from public.contas_bancarias c where c.id = p_conta_id;
  select max(f.mes) into v_mes from public.conciliacao_fechamentos f
   where f.conta_bancaria_id in (p_conta_id, v_pai) and f.reaberto_em is null;
  if v_mes is not null and p_data < (v_mes + interval '1 month')::date then
    raise exception 'Conta % esta conciliada ate %/%. Reabra esse mes na Conciliacao para mudar.',
      coalesce(v_nome, '-'), v_meses[extract(month from v_mes)::int], extract(year from v_mes)::int;
  end if;
end;
$function$;

grant execute on function public.fn_conciliacao_exigir_data_aberta(uuid, date) to authenticated;

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
    v_saldo := public.fn_saldo_conta(p_conta_id);

    if coalesce(v_saldo, 0) - v_liquido < 0 then
      if public.fn_pode_ver_saldo(p_conta_id) then
        raise exception 'Saldo insuficiente na conta: saldo atual R$ %, pagamento de R$ %.',
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

CREATE OR REPLACE FUNCTION public.fn_estornar_pagamento(p_parcela_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status text; v_lanc uuid; v_tipo text;
begin
  select p.status, p.lancamento_id, l.tipo into v_status, v_lanc, v_tipo
    from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id
    where p.id = p_parcela_id;
  if v_status is null then raise exception 'Parcela nao encontrada'; end if;
  -- Estornar muda o saldo da conta na data do pagamento: recusa ate o ultimo
  -- mes conciliado fechado, conciliado ou nao o pagamento.
  perform public.fn_conciliacao_exigir_data_aberta(p.conta_bancaria_id, p.data_pagamento)
    from public.lancamento_parcelas p
   where p.id = p_parcela_id and p.status = 'pago';
  if exists (select 1 from public.lancamentos l join public.lancamento_parcelas lp on lp.lancamento_id = l.id where lp.id = p_parcela_id and l.origem = 'aplicacao') then
    raise exception 'Nao da para estornar: este lancamento foi gerado pela posicao da aplicacao. Regrave ou exclua a posicao em Financeiro > Aplicacoes';
  end if;

  if v_tipo = 'a_pagar' then
    if not public.tem_permissao('financeiro.pagamentos', 'excluir') then
      raise exception 'Sem permissao para estornar pagamentos';
    end if;
    if v_status <> 'pago' then raise exception 'Esta parcela nao esta paga'; end if;
  else
    if not public.tem_permissao('financeiro.recebimentos', 'excluir') then
      raise exception 'Sem permissao para estornar recebimentos';
    end if;
    if v_status <> 'pago' then raise exception 'Este recebimento nao esta baixado'; end if;
  end if;

  if exists (select 1 from public.extrato_transacoes t where t.parcela_id = p_parcela_id) then
    if v_tipo = 'a_pagar' then
      raise exception 'Nao da para estornar: este pagamento esta conciliado. Desfaca a conciliacao primeiro';
    else
      raise exception 'Nao da para estornar: este recebimento esta conciliado. Desfaca a conciliacao primeiro';
    end if;
  end if;

  update public.lancamento_parcelas
    set status = case when v_tipo = 'a_pagar' then 'aprovado' else 'pendente' end,
        -- So o a pagar perde a conta: no a receber ela e o destino escolhido no
        -- cadastro, nao um resto da baixa.
        conta_bancaria_id = case when v_tipo = 'a_pagar' then null else conta_bancaria_id end,
        data_pagamento = null, pago_por = null, pago_em = null,
        desconto = 0, juros = 0, outras_despesas = 0
    where id = p_parcela_id;
  perform public.fn_recalcular_status_lancamento(v_lanc);
end $function$;

CREATE OR REPLACE FUNCTION public.fn_salvar_transferencia(p_id uuid, p_conta_origem_id uuid, p_conta_destino_id uuid, p_data date, p_valor numeric, p_tarifa numeric DEFAULT 0, p_descricao text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text, p_centro_custo_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_acao text := case when p_id is null then 'criar' else 'editar' end;
  v_tarifa numeric(14, 2) := round(coalesce(p_tarifa, 0), 2);
  v_valor numeric(14, 2) := round(coalesce(p_valor, 0), 2);
  v_origem public.contas_bancarias;
  v_destino public.contas_bancarias;
  v_investimento boolean;
  v_antiga public.transferencias_contas;
begin
  if not public.tem_permissao('financeiro.transferencias', v_acao) then
    raise exception 'Sem permissao para % transferencias', v_acao;
  end if;

  if p_conta_origem_id is null or p_conta_destino_id is null then
    raise exception 'Escolha a conta de origem e a de destino';
  end if;
  if p_conta_origem_id = p_conta_destino_id then
    raise exception 'A conta de origem e a de destino precisam ser diferentes';
  end if;
  if p_data is null then
    raise exception 'Informe a data da transferencia';
  end if;
  if v_valor <= 0 then
    raise exception 'O valor da transferencia precisa ser maior que zero';
  end if;
  if v_tarifa < 0 then
    raise exception 'A tarifa nao pode ser negativa';
  end if;

  select * into v_origem from public.contas_bancarias where id = p_conta_origem_id;
  select * into v_destino from public.contas_bancarias where id = p_conta_destino_id;

  if not v_origem.ativo or not v_destino.ativo then
    raise exception 'Conta bancaria inativa nao pode receber nem enviar transferencia';
  end if;

  v_investimento := v_origem.tipo = 'investimento' or v_destino.tipo = 'investimento';

  if v_investimento then
    if coalesce(v_origem.conta_pai_id, v_origem.id) <> coalesce(v_destino.conta_pai_id, v_destino.id) then
      raise exception 'A subconta de investimentos so recebe e devolve dinheiro da propria conta';
    end if;
    if p_centro_custo_id is null then
      raise exception 'Escolha a aplicacao (CDB, fundo) desta movimentacao';
    end if;
    if not exists (
      select 1 from public.centros_custo e
      join public.centros_custo raiz on raiz.id = e.pai_id
      where e.id = p_centro_custo_id and e.nivel = 2 and raiz.tipo = 'investimento'
    ) then
      raise exception 'A aplicacao escolhida nao e uma aplicacao do centro de investimentos';
    end if;
  elsif p_centro_custo_id is not null then
    raise exception 'Transferencia entre contas correntes nao tem aplicacao';
  end if;

  -- O lado novo e, na edicao, o lado antigo: mover de um mes fechado ou para
  -- ele muda o saldo do mes fechado.
  perform public.fn_conciliacao_exigir_data_aberta(p_conta_origem_id, p_data);
  perform public.fn_conciliacao_exigir_data_aberta(p_conta_destino_id, p_data);
  if p_id is not null then
    select * into v_antiga from public.transferencias_contas where id = p_id;
    perform public.fn_conciliacao_exigir_data_aberta(v_antiga.conta_origem_id, v_antiga.data_transferencia);
    perform public.fn_conciliacao_exigir_data_aberta(v_antiga.conta_destino_id, v_antiga.data_transferencia);
  end if;

  if p_id is null then
    insert into public.transferencias_contas (
      numero, conta_origem_id, conta_destino_id, data_transferencia,
      valor, tarifa, descricao, observacoes, centro_custo_id
    )
    values (
      public.proximo_numero_documento('TRF'),
      p_conta_origem_id, p_conta_destino_id, p_data,
      v_valor, v_tarifa,
      nullif(btrim(coalesce(p_descricao, '')), ''),
      nullif(btrim(coalesce(p_observacoes, '')), ''),
      p_centro_custo_id
    )
    returning id into v_id;
  else
    update public.transferencias_contas
    set conta_origem_id = p_conta_origem_id,
        conta_destino_id = p_conta_destino_id,
        data_transferencia = p_data,
        valor = v_valor,
        tarifa = v_tarifa,
        descricao = nullif(btrim(coalesce(p_descricao, '')), ''),
        observacoes = nullif(btrim(coalesce(p_observacoes, '')), ''),
        centro_custo_id = p_centro_custo_id
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Transferencia nao encontrada';
    end if;
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_excluir_transferencia(p_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_dados jsonb;
begin
  if not public.tem_permissao('financeiro.transferencias', 'excluir') then
    raise exception 'Sem permissao para excluir transferencias';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da exclusao';
  end if;

  select to_jsonb(t) into v_dados
  from public.transferencias_contas t where t.id = p_id;

  if v_dados is null then
    raise exception 'Transferencia nao encontrada';
  end if;

  if exists (select 1 from public.extrato_transacoes t where t.transferencia_id = p_id) then
    raise exception 'Nao da para excluir: esta transferencia esta conciliada. Desfaca a conciliacao primeiro';
  end if;
  perform public.fn_conciliacao_exigir_data_aberta((v_dados->>'conta_origem_id')::uuid, (v_dados->>'data_transferencia')::date);
  perform public.fn_conciliacao_exigir_data_aberta((v_dados->>'conta_destino_id')::uuid, (v_dados->>'data_transferencia')::date);

  insert into public.lixeira (tabela, registro_id, dados, motivo, excluido_por)
  values ('transferencias_contas', p_id::text, v_dados, p_motivo, (select auth.uid()));

  delete from public.transferencias_contas where id = p_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_salvar_posicao_aplicacao(p_aplicacao_id uuid, p_data date, p_saldo_liquido numeric, p_saldo_bruto numeric DEFAULT NULL::numeric, p_ir numeric DEFAULT NULL::numeric, p_iof numeric DEFAULT NULL::numeric, p_observacoes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conta uuid; v_id uuid; v_abertura date;
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
begin
  if not public.tem_permissao('financeiro.aplicacoes', 'editar') then
    raise exception 'Sem permissao para gravar posicao de aplicacao';
  end if;

  select a.conta_bancaria_id into v_conta
  from public.aplicacoes a where a.id = p_aplicacao_id for update;
  if v_conta is null then
    raise exception 'Aplicacao nao encontrada';
  end if;
  if not public.fn_pode_ver_saldo(v_conta) then
    raise exception 'Sem permissao para ver o saldo desta conta';
  end if;

  if p_data is null then raise exception 'Informe a data da posicao'; end if;
  if p_data > v_hoje then raise exception 'A posicao nao pode ter data futura'; end if;
  perform public.fn_conciliacao_exigir_data_aberta(v_conta, p_data);
  if p_saldo_liquido is null or p_saldo_liquido < 0 then
    raise exception 'Informe o saldo liquido da posicao';
  end if;
  if round(p_saldo_liquido, 2) <> p_saldo_liquido then
    raise exception 'Saldo liquido com mais de duas casas';
  end if;

  select p.data into v_abertura
  from public.aplicacao_posicoes p
  where p.aplicacao_id = p_aplicacao_id and p.e_abertura and p.excluido_em is null;
  if v_abertura is not null and p_data < v_abertura then
    raise exception 'A posicao nao pode ser anterior a abertura (%)', to_char(v_abertura, 'DD/MM/YYYY');
  end if;

  select p.id into v_id
  from public.aplicacao_posicoes p
  where p.aplicacao_id = p_aplicacao_id and p.data = p_data and p.excluido_em is null;

  if v_id is null then
    insert into public.aplicacao_posicoes
      (aplicacao_id, data, saldo_liquido, saldo_bruto, ir, iof, observacoes)
    values
      (p_aplicacao_id, p_data, p_saldo_liquido, p_saldo_bruto, p_ir, p_iof, nullif(btrim(p_observacoes), ''))
    returning id into v_id;
  else
    update public.aplicacao_posicoes
       set saldo_liquido = p_saldo_liquido, saldo_bruto = p_saldo_bruto, ir = p_ir, iof = p_iof,
           observacoes = nullif(btrim(p_observacoes), '')
     where id = v_id;
  end if;

  perform public.fn_aplicacao_recalcular(p_aplicacao_id, p_data);
  return v_id;
end;
$function$;
