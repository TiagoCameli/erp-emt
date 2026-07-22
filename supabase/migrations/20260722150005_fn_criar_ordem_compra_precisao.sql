-- Task 7 (fix de review): fn_criar_ordem_compra calculava v_total a partir
-- dos valores CRUS do jsonb, com precisão ilimitada
-- ((item->>'quantidade')::numeric * (item->>'preco_unitario')::numeric).
-- Os itens, porém, são gravados em oc_itens.quantidade numeric(14,3) e
-- oc_itens.preco_unitario numeric(14,2) — arredondados pelo cast de coluna.
-- Se a entrada tiver mais casas que a coluna (ex.: quantidade=1.2345 é
-- gravado como 1.235), o cabeçalho ficava com o total da conta crua
-- (1.2345 * 100 = 123.45) enquanto sum(oc_itens) = 1.235 * 100 = 123.50:
-- divergência de dinheiro entre ordens_compra.valor_total e a soma real dos
-- itens gravados. O código antigo (trigger fn_recalcular_total_oc rodando
-- sobre os valores JÁ gravados nas colunas) era imune a isso; a versão
-- transacional da Task 7 introduziu o cálculo prévio e reproduziu o bug.
--
-- Definição viva lida ao vivo (MCP, 2026-07-22) antes deste fix: idêntica ao
-- arquivo supabase/migrations/20260722150004_fn_criar_ordem_compra.sql já no
-- repo (sem drift).
--
-- Fix: castar quantidade e preco_unitario à MESMA precisão das colunas
-- (numeric(14,3) e numeric(14,2)) ANTES de multiplicar, pra bater exatamente
-- com o que fica gravado em oc_itens e com o que fn_recalcular_total_oc
-- calcularia sobre esses mesmos valores já arredondados.
--
-- Rollback: reaplicar a definição anterior, disponível no comentário de
-- rollback de supabase/migrations/20260722150004_fn_criar_ordem_compra.sql
-- (create or replace com
-- sum((item->>'quantidade')::numeric * (item->>'preco_unitario')::numeric)).
create or replace function public.fn_criar_ordem_compra(
  p_cabecalho jsonb,
  p_itens jsonb
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_oc_id uuid;
  v_total numeric(14, 2);
  v_qtd_itens int;
begin
  if not public.tem_permissao('compras.ordens', 'criar') then
    raise exception 'Sem permissao para criar ordens de compra';
  end if;

  select count(*) into v_qtd_itens from jsonb_array_elements(p_itens);
  if v_qtd_itens = 0 then
    raise exception 'Adicione ao menos um item a ordem de compra';
  end if;

  -- Mesma conta que fn_recalcular_total_oc faria (sum(quantidade *
  -- preco_unitario) sobre os itens JÁ GRAVADOS em oc_itens): castamos cada
  -- valor à precisão da coluna correspondente (quantidade numeric(14,3),
  -- preco_unitario numeric(14,2)) antes de multiplicar, pra não divergir do
  -- arredondamento que o insert abaixo vai aplicar de qualquer forma.
  select coalesce(sum(
    ((item ->> 'quantidade')::numeric(14, 3))
    * ((item ->> 'preco_unitario')::numeric(14, 2))
  ), 0)
  into v_total
  from jsonb_array_elements(p_itens) as item;

  perform set_config('oc.recalc_suprimido', '1', true);

  insert into public.ordens_compra (
    fornecedor_id, condicao_pagamento_id, cotacao_id, data_emissao,
    observacoes, status, valor_total
  )
  values (
    (p_cabecalho ->> 'fornecedor_id')::uuid,
    (p_cabecalho ->> 'condicao_pagamento_id')::uuid,
    nullif(p_cabecalho ->> 'cotacao_id', '')::uuid,
    (p_cabecalho ->> 'data_emissao')::date,
    nullif(p_cabecalho ->> 'observacoes', ''),
    'rascunho',
    v_total
  )
  returning id into v_oc_id;

  insert into public.oc_itens (
    ordem_compra_id, insumo_id, quantidade, preco_unitario, centro_custo_id
  )
  select
    v_oc_id,
    (item ->> 'insumo_id')::uuid,
    (item ->> 'quantidade')::numeric,
    (item ->> 'preco_unitario')::numeric,
    (item ->> 'centro_custo_id')::uuid
  from jsonb_array_elements(p_itens) as item;

  perform set_config('oc.recalc_suprimido', '0', true);

  return v_oc_id;
end;
$function$;

revoke all on function public.fn_criar_ordem_compra(jsonb, jsonb) from public, anon;
grant execute on function public.fn_criar_ordem_compra(jsonb, jsonb) to authenticated;
