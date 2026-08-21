-- Rollback de 20260821230000: devolve a `fn_criar_ordem_compra` à aritmética
-- própria dela.
--
-- Cópia literal do que `pg_get_functiondef` devolvia em 21/08/2026 (md5
-- 599a8f8e9010dc21851bb9acef1b6f4d), INCLUSIVE o defeito: os casts
-- `numeric(14,3)` e `numeric(14,2)` arredondam quantidade e preço ANTES de
-- multiplicar, então toda OC com preço de 3 ou 4 casas nasce com total inflado e
-- as parcelas não fecham com ele.
--
-- O REPARO DE DADO NÃO É DESFEITO, de propósito. As 14 OCs corrigidas passaram a
-- ter o total que a função canônica (`fn_total_da_oc`) calcula, que é o mesmo que
-- qualquer edição de item nelas produziria. Reinflar um total de dinheiro para
-- voltar a um número que nunca foi certo não é rollback: é criar um segundo
-- defeito. Se o motivo de voltar for outro, o caminho é corrigir
-- `fn_total_da_oc`, que é a fonte que a tela e o trigger também usam.

create or replace function public.fn_criar_ordem_compra(p_cabecalho jsonb, p_itens jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

revoke all on function public.fn_criar_ordem_compra(jsonb, jsonb) from public;
grant execute on function public.fn_criar_ordem_compra(jsonb, jsonb) to authenticated;
