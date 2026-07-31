-- Editar lancamento com pagamento aprovado passa a ser recusado.
--
-- BUG: no caminho de EDICAO, fn_salvar_lancamento apaga e regrava TODAS as
-- parcelas. As guardas eram duas: recusar se alguma parcela estava 'pago', e
-- recusar mudanca do mes de referencia se alguma estava 'aprovado' ou 'pago'.
-- Sobrava o furo do meio: parcela 'aprovado' com o mes de referencia
-- INALTERADO passava batido. O delete/insert recriava as parcelas como
-- 'pendente' e levava embora, em silencio, aprovado_por, aprovado_em,
-- data_programada, data_programada_origem e conta_bancaria_id. Dinheiro que ja
-- estava autorizado a sair voltava a nao aprovado sem ninguem pedir, e a
-- parcela reaparecia na fila de aprovacao.
--
-- REGRA APLICADA: a da regra 8 da status machine do CLAUDE.md, "editar aprovado
-- e proibido: desaprova, edita, reaprova". Nada novo foi inventado. A guarda de
-- 'pago' ganhou a irma de 'aprovado', com a mensagem dizendo o caminho de volta
-- (desaprovar o pagamento antes de editar). E o mesmo desenho que
-- fn_definir_parcelas_lancamento e fn_excluir_lancamento ja usam, e que a ordem
-- de compra usa desde a 20260728180001 ("depois de aprovada, edite as parcelas
-- no lancamento").
--
-- A guarda de mudanca de mes continua onde estava, mesmo virando redundante para
-- 'aprovado': ela e a que cobre 'pago' com mes diferente e a que da a mensagem
-- especifica do mes. Guarda de dinheiro nao se apaga por economia de linha.
--
-- fn_salvar_lancamento e recriada INTEIRA (a versao vigente era a da
-- 20260731130001, que renumerou as parcelas por vencimento). Fora as 7 linhas da
-- guarda nova, nada mudou: seguem valendo a checagem de permissao, valor, data
-- da compra, soma das parcelas contra o valor, soma do rateio, competencia
-- aberta (fn_exigir_competencia_aberta nas duas datas), guarda de origem manual,
-- guarda de parcela ja paga, guarda de mudanca de mes de referencia com
-- pagamento aprovado, condicao_pagamento_id, observacoes, a renumeracao por
-- vencimento com nulls last, a regravacao de rateios e a chamada final a
-- fn_aplicar_regra_pagamento.
--
-- fn_definir_parcelas_lancamento (o dialogo "Definir parcelas") NAO tem o mesmo
-- furo e nao e tocada aqui: ela ja recusa 'aprovado' e 'pago' juntos, sem
-- depender do mes ("Este lancamento ja tem parcela aprovada ou paga: as parcelas
-- nao podem mais ser trocadas").
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
begin
  v_acao := case when p_id is null then 'criar' else 'editar' end;
  if not public.tem_permissao('financeiro.lancamentos', v_acao) then
    raise exception 'Sem permissao para % lancamentos', v_acao;
  end if;

  v_valor := (p_dados->>'valor')::numeric;
  if v_valor is null or v_valor < 0 then raise exception 'Valor invalido'; end if;

  v_compra := nullif(p_dados->>'data_compra','')::date;
  if v_compra is null then
    raise exception 'Informe a data da compra ou do documento';
  end if;
  v_mes := date_trunc('month', coalesce(nullif(p_dados->>'mes_competencia','')::date, v_compra))::date;

  select coalesce(sum(round((x->>'valor')::numeric, 2)), 0) into v_soma_parc from jsonb_array_elements(coalesce(p_parcelas,'[]'::jsonb)) x;
  if v_soma_parc <> round(v_valor, 2) then
    raise exception 'A soma das parcelas (R$ %) deve ser igual ao valor do lancamento (R$ %)', v_soma_parc, v_valor;
  end if;
  if jsonb_array_length(coalesce(p_rateios,'[]'::jsonb)) > 0 then
    select coalesce(sum(round((x->>'valor')::numeric, 2)), 0) into v_soma_rat from jsonb_array_elements(p_rateios) x;
    if v_soma_rat <> round(v_valor, 2) then
      raise exception 'A soma do rateio (R$ %) deve ser igual ao valor do lancamento (R$ %)', v_soma_rat, v_valor;
    end if;
  end if;

  perform public.fn_exigir_competencia_aberta(v_mes, 'lancamento', v_id);

  if v_acao = 'criar' then
    insert into public.lancamentos (tipo, origem, fornecedor_id, categoria_id, forma_pagamento_id, condicao_pagamento_id, descricao, observacoes, valor, status, data_compra, mes_competencia, data_vencimento, created_by)
    values (
      coalesce(p_dados->>'tipo','a_pagar'), 'manual',
      nullif(p_dados->>'fornecedor_id','')::uuid, nullif(p_dados->>'categoria_id','')::uuid,
      nullif(p_dados->>'forma_pagamento_id','')::uuid,
      nullif(p_dados->>'condicao_pagamento_id','')::uuid,
      p_dados->>'descricao', nullif(btrim(p_dados->>'observacoes'),''), v_valor, 'a_pagar',
      v_compra, v_mes, nullif(p_dados->>'data_vencimento','')::date, (select auth.uid())
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
      data_vencimento = nullif(p_dados->>'data_vencimento','')::date
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

revoke all on function public.fn_salvar_lancamento(uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.fn_salvar_lancamento(uuid, jsonb, jsonb, jsonb) to authenticated;
