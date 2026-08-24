-- A criacao da OC passa a aceitar os quatro ajustes do rodape: frete, outras
-- despesas, impostos e desconto.
--
-- ## O que ja existia
--
-- As quatro colunas existem em `ordens_compra` desde a carga do Mais Controle,
-- com default 0. `fn_total_da_oc` ja faz a conta certa
--
--   round(soma(qtd x preco) + frete + outras + impostos - desconto, 2)
--
-- e a trigger `trg_total_oc_cabecalho` ja recalcula o total quando qualquer uma
-- delas muda. A EDICAO da OC ja funcionava, porque a action faz update direto no
-- cabecalho e a trigger pega.
--
-- O que faltava era so a CRIACAO: `fn_criar_ordem_compra` nunca leu esses
-- campos do cabecalho, entao toda OC nascia com os quatro em zero e nao havia
-- como criar uma ordem ja com desconto.
--
-- ## O desconto ja e proporcional, e isso nao muda aqui
--
-- Quem distribui e `fn_aprovar_ordem_compra`, que rateia cada fatia
-- (centro de custo + categoria) por
--
--   round(bruto_da_fatia * valor_total / soma_dos_brutos, 2)
--
-- Como `valor_total` ja vem com o desconto subtraido, cada centro de custo
-- absorve a parte do desconto proporcional ao que ele representa na ordem. A
-- sobra de arredondamento vai para a maior fatia. Nada disso precisou mudar --
-- e por isso este arquivo nao toca na funcao de aprovar.
--
-- ## Por que os quatro, e nao so o desconto
--
-- O Tiago pediu o desconto e, perguntado, mandou liberar os quatro: a conta e a
-- mesma, e a nota que vem com frete cobrado a parte tinha o mesmo problema.

create or replace function public.fn_criar_ordem_compra(p_cabecalho jsonb, p_itens jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_oc_id uuid;
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
    descricao, categoria_id, numero_documento,
    frete, outras_despesas, impostos, desconto
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
    -- Nasce zero de proposito: o total sai de fn_total_da_oc logo abaixo, quando
    -- os itens ja existem. Enquanto esta funcao calculava o proprio total, ela
    -- arredondava o PRECO antes de multiplicar e inflava a ordem.
    0,
    v_descricao,
    v_categoria,
    -- btrim antes do nullif: ' ' viraria um numero de documento em branco, que
    -- passa no "tem numero?" da tela e nao identifica documento nenhum.
    nullif(btrim(p_cabecalho ->> 'numero_documento'), ''),
    -- Os quatro ajustes do rodape. `coalesce` para 0 porque a coluna e NOT NULL
    -- e cabecalho antigo (ou de outro chamador) nao manda esses campos: sem ele
    -- a criacao passaria a estourar para quem nao mudou nada.
    round(coalesce((p_cabecalho ->> 'frete')::numeric, 0), 2),
    round(coalesce((p_cabecalho ->> 'outras_despesas')::numeric, 0), 2),
    round(coalesce((p_cabecalho ->> 'impostos')::numeric, 0), 2),
    round(coalesce((p_cabecalho ->> 'desconto')::numeric, 0), 2)
  )
  returning id into v_oc_id;
  insert into public.oc_itens (ordem_compra_id, insumo_id, quantidade, preco_unitario, centro_custo_id)
  select v_oc_id, (item ->> 'insumo_id')::uuid, (item ->> 'quantidade')::numeric, (item ->> 'preco_unitario')::numeric, (item ->> 'centro_custo_id')::uuid
  from jsonb_array_elements(p_itens) as item;
  perform set_config('oc.recalc_suprimido', '0', true);

  -- UM update, com os itens ja gravados: o total sai da funcao canonica, a mesma
  -- que o trigger usa em toda edicao de item. Ela le os quatro ajustes da
  -- propria linha, entao o desconto ja entra aqui.
  update public.ordens_compra o
     set valor_total = public.fn_total_da_oc(
           o.id, o.frete, o.outras_despesas, o.impostos, o.desconto)
   where o.id = v_oc_id;

  if v_cotacao is not null then
    perform public.fn_propagar_anexos('cotacao', v_cotacao, 'ordem_compra', v_oc_id);
  end if;

  return v_oc_id;
end;
$function$;

-- Ajuste NEGATIVO nunca e legitimo, em momento nenhum: o desconto e guardado
-- positivo e quem subtrai e fn_total_da_oc.
alter table public.ordens_compra
  drop constraint if exists ordens_compra_ajustes_nao_negativos;
alter table public.ordens_compra
  add constraint ordens_compra_ajustes_nao_negativos
  check (frete >= 0 and outras_despesas >= 0 and impostos >= 0 and desconto >= 0);

-- NAO existe CHECK de `valor_total >= 0`. Ele foi tentado e removido na
-- migration seguinte: a edicao apaga todos os itens antes de inserir os novos, e
-- nesse instante a ordem tem zero itens -- o total fica negativo por um momento
-- legitimo sempre que ha desconto. Quem recusa desconto maior que a ordem e a
-- aplicacao (schema Zod), com mensagem em portugues.

comment on column public.ordens_compra.desconto is
  'Desconto do rodape da OC, sempre POSITIVO: quem subtrai e fn_total_da_oc. Distribuido proporcionalmente entre os centros de custo na aprovacao, porque o rateio usa bruto_da_fatia * valor_total / soma_dos_brutos.';
