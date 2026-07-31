-- Observacoes no lancamento.
--
-- A ordem de compra ja tem ordens_compra.observacoes e uma area para escrever no
-- fim do formulario dela. O lancamento nao tinha onde guardar o combinado (quem
-- pediu, qual acordo, o que a nota nao diz), e isso acabava na descricao, que e
-- o texto curto que aparece na lista e nos relatorios.
--
-- Coluna nullable e sem default: lancamento sem observacao continua valido e
-- nenhum lancamento existente precisa de backfill.

alter table public.lancamentos
  add column observacoes text;

comment on column public.lancamentos.observacoes is
  'Texto livre do lancamento (o combinado, o que a nota nao diz). Nao aparece na lista, so no detalhe. Ate 2000 caracteres, limite validado no schema da aplicacao.';

-- fn_salvar_lancamento recriada INTEIRA de novo (a versao vigente e a da
-- 20260731120001, que trouxe condicao_pagamento_id), agora tambem com
-- observacoes no INSERT e no UPDATE. Nada do corpo anterior foi removido:
-- seguem valendo a validacao de permissao, valor, data da compra, soma das
-- parcelas, soma do rateio, competencia aberta, guarda de origem manual, guarda
-- de parcela paga, guarda de mudanca de mes com pagamento aprovado, a regravacao
-- de parcelas e rateios e o recalculo da regra de pagamento.
--
-- btrim antes do nullif pelo mesmo motivo da descricao da OC: um textarea com
-- espacos e enter viraria uma observacao "em branco" gravada como se fosse
-- conteudo.
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
