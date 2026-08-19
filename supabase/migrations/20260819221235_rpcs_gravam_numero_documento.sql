-- Quem DIGITA passa a gravar o número do documento:
--   criar OC          -> grava o que foi digitado no formulário
--   salvar lançamento -> grava o que foi digitado (criar e editar)
--
-- Quem CARREGA o número adiante (aprovar a OC e registrar o recebimento) está na
-- migration seguinte.
--
-- Assinatura de nenhuma delas muda: CREATE OR REPLACE preserva os grants.

create or replace function public.fn_criar_ordem_compra(p_cabecalho jsonb, p_itens jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_oc_id uuid;
  v_total numeric(14, 2);
  v_qtd_itens int;
  v_cotacao uuid;
  v_data_compra date;
  v_mes date;
  v_descricao text;
  v_categoria uuid;
begin
  if not public.tem_permissao('compras.ordens', 'criar') then
    raise exception 'Sem permissao para criar ordens de compra';
  end if;
  select count(*) into v_qtd_itens from jsonb_array_elements(p_itens);
  if v_qtd_itens = 0 then
    raise exception 'Adicione ao menos um item a ordem de compra';
  end if;
  select coalesce(sum(((item ->> 'quantidade')::numeric(14, 3)) * ((item ->> 'preco_unitario')::numeric(14, 2))), 0)
  into v_total from jsonb_array_elements(p_itens) as item;

  v_cotacao := nullif(p_cabecalho ->> 'cotacao_id', '')::uuid;

  -- Descricao sem espaco nas pontas: e ela que vira a descricao do lancamento,
  -- e ' ' passando por nullif viraria uma descricao em branco no financeiro.
  v_descricao := nullif(btrim(p_cabecalho ->> 'descricao'), '');
  v_categoria := nullif(p_cabecalho ->> 'categoria_id', '')::uuid;

  v_data_compra := coalesce(
    (nullif(p_cabecalho ->> 'data_compra', ''))::date,
    (now() at time zone 'America/Rio_Branco')::date
  );
  v_mes := date_trunc('month', coalesce(
    (nullif(p_cabecalho ->> 'mes_competencia', ''))::date,
    v_data_compra
  ))::date;

  perform public.fn_exigir_competencia_aberta(v_mes, 'ordem_compra', null);

  perform set_config('oc.recalc_suprimido', '1', true);
  insert into public.ordens_compra (
    fornecedor_id, condicao_pagamento_id, forma_pagamento_id, cotacao_id,
    data_compra, mes_competencia, observacoes, status, valor_total,
    descricao, categoria_id, numero_documento
  )
  values (
    (p_cabecalho ->> 'fornecedor_id')::uuid,
    (p_cabecalho ->> 'condicao_pagamento_id')::uuid,
    nullif(p_cabecalho ->> 'forma_pagamento_id', '')::uuid,
    v_cotacao,
    v_data_compra,
    v_mes,
    nullif(p_cabecalho ->> 'observacoes', ''),
    'rascunho',
    v_total,
    v_descricao,
    v_categoria,
    -- btrim antes do nullif: ' ' viraria um numero de documento em branco, que
    -- passa no "tem numero?" da tela e nao identifica documento nenhum.
    nullif(btrim(p_cabecalho ->> 'numero_documento'), '')
  )
  returning id into v_oc_id;
  insert into public.oc_itens (ordem_compra_id, insumo_id, quantidade, preco_unitario, centro_custo_id)
  select v_oc_id, (item ->> 'insumo_id')::uuid, (item ->> 'quantidade')::numeric, (item ->> 'preco_unitario')::numeric, (item ->> 'centro_custo_id')::uuid
  from jsonb_array_elements(p_itens) as item;
  perform set_config('oc.recalc_suprimido', '0', true);

  if v_cotacao is not null then
    perform public.fn_propagar_anexos('cotacao', v_cotacao, 'ordem_compra', v_oc_id);
  end if;

  return v_oc_id;
end;
$function$;

create or replace function public.fn_salvar_lancamento(p_id uuid, p_dados jsonb, p_parcelas jsonb, p_rateios jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id uuid := p_id; v_acao text; v_valor numeric(14,2);
  v_soma_parc numeric(14,2); v_soma_rat numeric(14,2); v_origem text; r jsonb;
  v_compra date; v_mes date; v_mes_atual date;
  v_numero_documento text;
begin
  v_acao := case when p_id is null then 'criar' else 'editar' end;
  if not public.tem_permissao('financeiro.lancamentos', v_acao) then
    raise exception 'Sem permissao para % lancamentos', v_acao;
  end if;

  v_valor := (p_dados->>'valor')::numeric;
  if v_valor is null or v_valor < 0 then raise exception 'Valor invalido'; end if;

  v_numero_documento := nullif(btrim(p_dados->>'numero_documento'), '');

  v_compra := nullif(p_dados->>'data_compra','')::date;
  if v_compra is null then
    raise exception 'Informe a data da compra ou do documento';
  end if;
  v_mes := date_trunc('month', coalesce(nullif(p_dados->>'mes_competencia','')::date, v_compra))::date;

  select coalesce(sum(round((x->>'valor')::numeric, 2)), 0) into v_soma_parc from jsonb_array_elements(coalesce(p_parcelas,'[]'::jsonb)) x;
  if v_soma_parc <> round(v_valor, 2) then
    raise exception 'A soma das parcelas (R$ %) deve ser igual ao valor do lancamento (R$ %)', v_soma_parc, v_valor;
  end if;
  if jsonb_array_length(coalesce(p_rateios,'[]'::jsonb)) = 0 then
    raise exception 'Escolha o centro de custo: nenhum custo existe sem centro de custo';
  end if;
  if true then
    select coalesce(sum(round((x->>'valor')::numeric, 2)), 0) into v_soma_rat from jsonb_array_elements(p_rateios) x;
    if v_soma_rat <> round(v_valor, 2) then
      raise exception 'A soma do rateio (R$ %) deve ser igual ao valor do lancamento (R$ %)', v_soma_rat, v_valor;
    end if;
  end if;

  perform public.fn_exigir_competencia_aberta(v_mes, 'lancamento', v_id);

  if v_acao = 'criar' then
    insert into public.lancamentos (tipo, origem, fornecedor_id, categoria_id, forma_pagamento_id, condicao_pagamento_id, descricao, observacoes, valor, status, data_compra, mes_competencia, data_vencimento, numero_documento, created_by)
    values (
      coalesce(p_dados->>'tipo','a_pagar'), 'manual',
      nullif(p_dados->>'fornecedor_id','')::uuid, nullif(p_dados->>'categoria_id','')::uuid,
      nullif(p_dados->>'forma_pagamento_id','')::uuid,
      nullif(p_dados->>'condicao_pagamento_id','')::uuid,
      p_dados->>'descricao', nullif(btrim(p_dados->>'observacoes'),''), v_valor, 'a_pagar',
      v_compra, v_mes, nullif(p_dados->>'data_vencimento','')::date, v_numero_documento, (select auth.uid())
    ) returning id into v_id;
  else
    select origem, mes_competencia into v_origem, v_mes_atual
    from public.lancamentos where id = v_id;
    if v_origem is null then raise exception 'Lancamento nao encontrado'; end if;
    if v_origem <> 'manual' then
      raise exception 'Lancamento de origem % e somente-leitura aqui. Edite na origem.', v_origem;
    end if;
    if exists (select 1 from public.lancamento_parcelas where lancamento_id = v_id and status = 'pago') then
      raise exception 'Nao da para editar um lancamento com parcela ja paga';
    end if;
    -- Editar aprovado e proibido: desaprova, edita, reaprova. A edicao regrava as
    -- parcelas do zero, entao deixar passar aqui apagaria a aprovacao (aprovado_por,
    -- aprovado_em, data_programada, data_programada_origem, conta_bancaria_id) sem
    -- dizer nada a quem aprovou. Nao ha edicao parcial a salvar: ou desaprova, ou
    -- nao edita.
    if exists (select 1 from public.lancamento_parcelas where lancamento_id = v_id and status = 'aprovado') then
      raise exception 'Nao da para editar um lancamento com pagamento aprovado. Desaprove o pagamento em Financeiro > Aprovacao de pagamentos, edite e aprove de novo.';
    end if;
    if exists (
      select 1 from public.lancamento_parcelas
      where lancamento_id = v_id and status in ('aprovado', 'pago')
    ) and v_mes_atual <> v_mes then
      raise exception 'O mes de referencia nao muda com pagamento aprovado ou pago. Desaprove ou estorne o pagamento antes.';
    end if;
    perform public.fn_exigir_competencia_aberta(v_mes_atual, 'lancamento', v_id);
    update public.lancamentos set
      tipo = coalesce(p_dados->>'tipo', tipo),
      fornecedor_id = nullif(p_dados->>'fornecedor_id','')::uuid,
      categoria_id = nullif(p_dados->>'categoria_id','')::uuid,
      forma_pagamento_id = nullif(p_dados->>'forma_pagamento_id','')::uuid,
      condicao_pagamento_id = nullif(p_dados->>'condicao_pagamento_id','')::uuid,
      descricao = p_dados->>'descricao', valor = v_valor,
      observacoes = nullif(btrim(p_dados->>'observacoes'),''),
      data_compra = v_compra,
      mes_competencia = v_mes,
      data_vencimento = nullif(p_dados->>'data_vencimento','')::date,
      numero_documento = v_numero_documento
    where id = v_id;
    delete from public.lancamento_parcelas where lancamento_id = v_id;
    delete from public.lancamento_rateios where lancamento_id = v_id;
  end if;

  -- O numero da parcela sai do VENCIMENTO, nao da ordem em que as linhas foram
  -- digitadas: parcela 1 e a que vence primeiro. Criterio identico ao de
  -- fn_salvar_parcelas_oc e fn_definir_parcelas_lancamento, incluindo o
  -- desempate por valor, para o mesmo lancamento nao mudar de numeracao
  -- conforme o caminho que gravou. numero_parcela que venha no jsonb e
  -- ignorado de proposito.
  --
  -- nulls last porque aqui, ao contrario dos outros dois caminhos, a parcela
  -- pode nao ter vencimento: sem data ela cai no fim e nao rouba o numero 1.
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
  select
    v_id,
    row_number() over (
      order by nullif(x->>'data_vencimento','')::date nulls last, x->>'valor'
    )::smallint,
    (x->>'valor')::numeric,
    nullif(x->>'data_vencimento','')::date,
    'pendente',
    (select auth.uid())
  from jsonb_array_elements(coalesce(p_parcelas,'[]'::jsonb)) x;

  for r in select * from jsonb_array_elements(coalesce(p_rateios,'[]'::jsonb)) loop
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    values (v_id, (r->>'centro_custo_id')::uuid, (r->>'valor')::numeric, (select auth.uid()));
  end loop;

  perform public.fn_aplicar_regra_pagamento(v_id);

  return v_id;
end;
$function$;
