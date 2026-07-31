-- Condicao de pagamento no lancamento.
--
-- Ate aqui so a ordem de compra tinha condicao de pagamento. O lancamento
-- avulso (origem 'manual') nao tinha de onde tirar a divisao das parcelas: o
-- "Gerar pela condicao" do detalhe do lancamento lia a condicao da ORDEM de
-- origem, e por isso recusava lancamento avulso. O formulario de lancamento
-- passa a ter o mesmo par da OC (campo de condicao + gerar parcelas por ela), e
-- para isso a condicao precisa ficar gravada no proprio lancamento.
--
-- A coluna e NULLABLE de proposito: lancamento sem condicao continua valido
-- (parcela unica digitada na mao e o caso mais comum) e todo lancamento que ja
-- existe fica null, sem backfill nenhum.
--
-- Lancamento de origem 'oc' continua lendo a condicao da ordem: a condicao
-- pertence ao documento de origem e nao e duplicada aqui.

alter table public.lancamentos
  add column condicao_pagamento_id uuid references public.condicoes_pagamento(id);

comment on column public.lancamentos.condicao_pagamento_id is
  'Condicao de pagamento do lancamento manual, base do "Gerar pela condicao". Null = parcelas definidas na mao. Em origem oc a condicao vive na ordem de compra.';

-- Indice na FK porque o advisor de performance cobra FK sem indice, e o filtro
-- por condicao passa por aqui.
create index idx_lancamentos_condicao_pagamento_id
  on public.lancamentos (condicao_pagamento_id);

-- fn_salvar_lancamento recriada INTEIRA (nada removido do corpo anterior), com
-- condicao_pagamento_id no INSERT e no UPDATE. O resto e identico: validacao de
-- permissao, valor, data da compra, soma das parcelas, soma do rateio,
-- competencia aberta, guarda de origem manual, guarda de parcela paga, guarda de
-- mudanca de mes com pagamento aprovado, regravacao de parcelas e rateios e o
-- recalculo da regra de pagamento.
create or replace function public.fn_salvar_lancamento(p_id uuid, p_dados jsonb, p_parcelas jsonb, p_rateios jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid := p_id; v_acao text; v_valor numeric(14,2);
  v_soma_parc numeric(14,2); v_soma_rat numeric(14,2); v_origem text; p jsonb; r jsonb;
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
    insert into public.lancamentos (tipo, origem, fornecedor_id, categoria_id, forma_pagamento_id, condicao_pagamento_id, descricao, valor, status, data_compra, mes_competencia, data_vencimento, created_by)
    values (
      coalesce(p_dados->>'tipo','a_pagar'), 'manual',
      nullif(p_dados->>'fornecedor_id','')::uuid, nullif(p_dados->>'categoria_id','')::uuid,
      nullif(p_dados->>'forma_pagamento_id','')::uuid,
      nullif(p_dados->>'condicao_pagamento_id','')::uuid,
      p_dados->>'descricao', v_valor, 'a_pagar',
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
      data_compra = v_compra,
      mes_competencia = v_mes,
      data_vencimento = nullif(p_dados->>'data_vencimento','')::date
    where id = v_id;
    delete from public.lancamento_parcelas where lancamento_id = v_id;
    delete from public.lancamento_rateios where lancamento_id = v_id;
  end if;

  for p in select * from jsonb_array_elements(p_parcelas) loop
    insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
    values (v_id, coalesce((p->>'numero_parcela')::smallint, 1), (p->>'valor')::numeric, nullif(p->>'data_vencimento','')::date, 'pendente', (select auth.uid()));
  end loop;
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
