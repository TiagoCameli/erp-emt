-- O total da OC deixa de ter uma segunda aritmética, e ela era a errada.
--
-- ## O defeito
--
-- `fn_criar_ordem_compra` calculava o total assim:
--
--   sum( (quantidade)::numeric(14,3) * (preco_unitario)::numeric(14,2) )
--
-- Os dois casts ARREDONDAM a taxa antes de multiplicar, e é exatamente o que a
-- regra de ouro do projeto proíbe (ver src/lib/casas-decimais.ts): quantidade e
-- preço unitário são TAXA, com 4 casas, porque diesel é vendido a R$ 6,3947 o
-- litro. Só o dinheiro final tem 2 casas.
--
-- Caso real de hoje (OC-2026-0048 a 0061): 25.000 litros de Diesel S10 a
-- R$ 6,1880, em três itens (15.000 + 5.000 + 5.000).
--
--   conta certa:  20.000 x 6,1880 ... = R$ 154.700,00   <- o que a tela mostrava
--   conta da RPC: preço vira 6,19     = R$ 154.750,00   <- o que ia para o banco
--
-- Aí `fn_salvar_parcelas_oc` comparava a soma das parcelas (R$ 154.700,00, que
-- vem da tela) com o `valor_total` gravado (R$ 154.750,00) e recusava:
--
--   "A ordem foi criada, mas o pagamento não: A soma das formas de pagamento
--    (R$ 154700.00) precisa fechar com o total da ordem (R$ 154750.00)."
--
-- A tela dizia "Fecha com o total da ordem" em verde e o servidor dizia que não
-- fechava. As duas estavam certas sobre a própria conta: eram DUAS contas.
--
-- ## Por que ninguém viu antes
--
-- Preço com 3 ou 4 casas decimais é combustível, e as OCs de combustível
-- passaram a ser lançadas hoje. Com preço de 2 casas os casts não mudam nada, e
-- as duas aritméticas coincidem.
--
-- ## O conserto
--
-- A criação passa a usar `fn_total_da_oc`, que é a função canônica que o trigger
-- `trg_total_oc_cabecalho` já usava em toda edição de item:
--
--   round( sum(quantidade * preco_unitario) + frete + outras + impostos
--          - desconto, 2)
--
-- Sem cast no meio, arredondando só no fim. A criação continua suprimindo o
-- trigger enquanto insere cabeçalho e itens (senão seria um UPDATE por item), e
-- passa a fazer UM update no fim, quando os itens já existem. É o mesmo caminho
-- de sempre, agora com uma conta só.
--
-- ## O dado
--
-- 14 OCs ficaram com o total inflado (R$ 700,00 no total, R$ 50,00 cada), todas
-- em RASCUNHO e nenhuma aprovada: nada vazou para lançamento, parcela ou
-- pagamento. Elas são recalculadas aqui pela função canônica. São as 14
-- tentativas da mesma compra, cada uma parada sem parcela nem forma -- quais
-- delas apagar é decisão do dono, e esta migration não apaga nada.

create or replace function public.fn_criar_ordem_compra(p_cabecalho jsonb, p_itens jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- Nasce zero de proposito: o total sai de fn_total_da_oc logo abaixo, quando
    -- os itens ja existem. Enquanto esta funcao calculava o proprio total, ela
    -- arredondava o PRECO antes de multiplicar e inflava a ordem (R$ 50,00 numa
    -- compra de 25 mil litros de diesel), e o total da tela deixava de fechar
    -- com o do banco.
    0,
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

  -- UM update, com os itens ja gravados: o total sai da funcao canonica, a mesma
  -- que o trigger usa em toda edicao de item. A supressao acima continua valendo
  -- para o cabecalho e os itens, senao cada item disparava um recalculo.
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

revoke all on function public.fn_criar_ordem_compra(jsonb, jsonb) from public;
grant execute on function public.fn_criar_ordem_compra(jsonb, jsonb) to authenticated;

-- =====================================================================
-- Dado: as OCs que nasceram com o total inflado
-- =====================================================================

do $reparo$
declare
  v_antes int;
  v_depois int;
  v_diferenca numeric;
begin
  select count(*), coalesce(sum(o.valor_total - public.fn_total_da_oc(o.id, o.frete, o.outras_despesas, o.impostos, o.desconto)), 0)
    into v_antes, v_diferenca
  from public.ordens_compra o
  where o.valor_total <> public.fn_total_da_oc(o.id, o.frete, o.outras_despesas, o.impostos, o.desconto);

  -- Só rascunho é tocado. Se alguma tiver saído do rascunho, o reparo para: OC
  -- aprovada já desceu valor para o lançamento, e mexer no total dela por baixo
  -- deixaria os dois discordando -- isso precisa de desaprovação, que é decisão
  -- de quem aprova, não de uma migration.
  if exists (
    select 1 from public.ordens_compra o
    where o.valor_total <> public.fn_total_da_oc(o.id, o.frete, o.outras_despesas, o.impostos, o.desconto)
      and o.status <> 'rascunho'
  ) then
    raise exception 'Ha OC com total divergente FORA do rascunho: pare e trate uma por uma.';
  end if;

  update public.ordens_compra o
     set valor_total = public.fn_total_da_oc(
           o.id, o.frete, o.outras_despesas, o.impostos, o.desconto)
   where o.valor_total <> public.fn_total_da_oc(
           o.id, o.frete, o.outras_despesas, o.impostos, o.desconto);

  select count(*) into v_depois
  from public.ordens_compra o
  where o.valor_total <> public.fn_total_da_oc(o.id, o.frete, o.outras_despesas, o.impostos, o.desconto);

  if v_depois <> 0 then
    raise exception 'Reparo nao fechou: ainda ha % OC com total divergente', v_depois;
  end if;

  raise notice 'Reparo: % OC corrigidas, R$ % de inflacao removida', v_antes, v_diferenca;
end $reparo$;
