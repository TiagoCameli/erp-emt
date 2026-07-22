-- Task 7 (QA item 3): criação transacional da OC — cabeçalho + itens + total
-- final na mesma transação, pra a trilha de auditoria registrar UM "criado"
-- com o valor_total certo, sem "editado" logo em seguida (e sem o total
-- passar por zero no meio do caminho).
--
-- Triggers vivos lidos ao vivo (MCP, 2026-07-22) antes de mexer:
--   ordens_compra: trg_audit_ordens_compra (AFTER INSERT/UPDATE/DELETE FOR
--   EACH ROW -> fn_audit: grava audit_log com to_jsonb(new) inteiro,
--   inclusive valor_total); trg_ordens_compra_numero (BEFORE INSERT -> numera
--   via proximo_numero_documento); trg_set_created_by (BEFORE INSERT);
--   trg_ordens_compra_updated_at (BEFORE UPDATE).
--   oc_itens: trg_audit_oc_itens (AFTER I/U/D -> fn_audit: um "criado" por
--   item, legítimo, mantido); trg_recalcular_total_oc (AFTER I/U/D FOR EACH
--   ROW -> fn_recalcular_total_oc: UPDATE incondicional em
--   ordens_compra.valor_total com a soma de oc_itens NAQUELE momento da
--   transação); trg_set_created_by.
--
-- Bug de hoje: criarOrdem insere o cabeçalho com valor_total=0 (default) ->
-- fn_audit grava "criado (total 0)". Depois insere os N itens numa segunda
-- chamada; cada INSERT em oc_itens dispara trg_recalcular_total_oc FOR EACH
-- ROW — no Postgres, triggers AFTER ROW (não-constraint) disparam
-- imediatamente após cada linha ser processada, não no fim do statement —
-- então cada disparo faz um UPDATE em ordens_compra com a soma PARCIAL vista
-- até aquele item (só convergindo pro total final no último). Cada UPDATE
-- dispara trg_audit_ordens_compra -> N linhas "editado" no audit_log, com
-- totais intermediários errados até o último bater o total certo. Testar só
-- gravar o total certo no insert do cabeçalho NÃO resolve sozinho: os UPDATEs
-- do recalculo ainda disparariam (com somas parciais divergentes do total já
-- gravado), passando por valores errados no meio.
--
-- Estratégia: fn_criar_ordem_compra calcula o valor_total final a partir do
-- jsonb de itens (mesma conta que fn_recalcular_total_oc faria:
-- sum(quantidade * preco_unitario), mesmo arredondamento numeric(14,2) por
-- ser a mesma operação sobre os mesmos valores) e grava ele JÁ no insert do
-- cabeçalho -> fn_audit grava um único "criado" com o total certo. Pra
-- inserir os itens em seguida sem o trigger de recálculo gerar "editado"
-- espúrios (com somas parciais), suprimimos a recalculação com uma GUC de
-- transação (mesmo padrão já usado em orcamentos_calc.sql: 'orcamento.recalc'),
-- consultada em fn_recalcular_total_oc. set_config(..., true) = SET LOCAL:
-- reverte sozinho em commit/rollback; resetamos também no fim da função por
-- clareza, seguindo o padrão existente.
--
-- editarOrdem (fora de escopo) continua igual: não liga a GUC, então
-- fn_recalcular_total_oc recalcula normalmente ao substituir os itens (o
-- comportamento de "editado" ao trocar itens numa OC existente não muda).
--
-- Rollback:
--   drop function if exists public.fn_criar_ordem_compra(jsonb, jsonb);
--   create or replace function public.fn_recalcular_total_oc()
--   returns trigger language plpgsql security definer set search_path to ''
--   as $function$
--   declare v_oc uuid := coalesce(new.ordem_compra_id, old.ordem_compra_id);
--   begin
--     update public.ordens_compra o
--     set valor_total = coalesce((select sum(i.quantidade * i.preco_unitario) from public.oc_itens i where i.ordem_compra_id = v_oc), 0)
--     where o.id = v_oc;
--     return null;
--   end $function$;

-- Step 1: guarda de supressão em fn_recalcular_total_oc (mesmo padrão de
-- orcamento.recalc). No-op quando a GUC de transação 'oc.recalc_suprimido'
-- está '1'.
create or replace function public.fn_recalcular_total_oc()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_oc uuid := coalesce(new.ordem_compra_id, old.ordem_compra_id);
begin
  if coalesce(current_setting('oc.recalc_suprimido', true), '') = '1' then
    return null;
  end if;

  update public.ordens_compra o
  set valor_total = coalesce((select sum(i.quantidade * i.preco_unitario) from public.oc_itens i where i.ordem_compra_id = v_oc), 0)
  where o.id = v_oc;
  return null;
end $function$;

-- Step 2: fn_criar_ordem_compra — cabeçalho + itens + total na mesma
-- transação, devolve o id da OC criada.
-- p_cabecalho: {fornecedor_id, condicao_pagamento_id, cotacao_id?,
-- data_emissao, observacoes?}. p_itens: array de {insumo_id, quantidade,
-- preco_unitario, centro_custo_id}. RLS de ordens_compra/oc_itens cobre
-- inserts diretos do client; esta função só existe pra fechar cabeçalho +
-- itens + total numa transação única (o client não tem transação no
-- supabase-js), por isso o mesmo check de permissão da policy é repetido
-- aqui (mesmo padrão de fn_aprovar_ordem_compra/fn_registrar_recebimento).
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
  -- preco_unitario) sobre os itens da OC), calculada aqui a partir do jsonb
  -- pra já gravar certa no insert do cabeçalho.
  select coalesce(sum(
    (item ->> 'quantidade')::numeric * (item ->> 'preco_unitario')::numeric
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
