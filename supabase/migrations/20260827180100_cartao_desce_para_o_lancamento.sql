-- O cartão escolhido na OC/no lançamento chega às tabelas, e desce na aprovação.
--
-- Complemento de 20260827180000_cartoes_de_credito.sql, que criou a coluna
-- `cartao_id` em `oc_formas` e `lancamento_formas`. Sem esta migration a coluna
-- existe e ninguém a preenche: as três funções que escrevem bloco de forma
-- listam as colunas na mão.
--
-- COMO AS FUNÇÕES SÃO ALTERADAS: elas são grandes e outra frente pode tê-las
-- mudado hoje. Em vez de reescrever o corpo de cabeça, que é como se apaga o
-- trabalho dos outros sem conflito nenhum, cada uma é reescrita A PARTIR DELA
-- MESMA: lê-se a definição viva, aplica-se a alteração no texto e executa-se o
-- resultado. Cada âncora é conferida por CONTAGEM, não só por "mudou": âncora
-- que aparece duas vezes trocaria o lugar errado em silêncio.

do $$
declare
  v_def text;
  v_novo text;
begin
  -- ===================================================================
  -- 1. fn_salvar_parcelas_oc: o cartão entra no bloco da ordem
  -- ===================================================================
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_salvar_parcelas_oc';

  if v_def is null then
    raise exception 'fn_salvar_parcelas_oc nao encontrada';
  end if;

  if position('cartao_id' in v_def) > 0 then
    raise notice 'fn_salvar_parcelas_oc ja grava cartao_id; nada a fazer';
  else
    if (length(v_def) - length(replace(v_def,
         '(ordem_compra_id, forma_pagamento_id, valor, created_by)', '')))
       / length('(ordem_compra_id, forma_pagamento_id, valor, created_by)') <> 1 then
      raise exception 'Ancora 1.1 (colunas do insert em oc_formas) nao aparece exatamente uma vez';
    end if;
    v_novo := replace(v_def,
      '(ordem_compra_id, forma_pagamento_id, valor, created_by)',
      '(ordem_compra_id, forma_pagamento_id, cartao_id, valor, created_by)');
    v_def := v_novo;

    if (length(v_def) - length(replace(v_def,
         'round((x->>''valor'')::numeric, 2), (select auth.uid())', '')))
       / length('round((x->>''valor'')::numeric, 2), (select auth.uid())') <> 1 then
      raise exception 'Ancora 1.2 (values do insert em oc_formas) nao aparece exatamente uma vez';
    end if;
    v_novo := replace(v_def,
      'round((x->>''valor'')::numeric, 2), (select auth.uid())',
      'nullif(x->>''cartao_id'','''')::uuid,' || chr(10) ||
      '         round((x->>''valor'')::numeric, 2), (select auth.uid())');
    v_def := v_novo;

    execute v_def;
  end if;

  -- ===================================================================
  -- 2. fn_salvar_lancamento: o cartão entra no bloco do lançamento
  -- ===================================================================
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_salvar_lancamento';

  if v_def is null then
    raise exception 'fn_salvar_lancamento nao encontrada';
  end if;

  if position('cartao_id' in v_def) > 0 then
    raise notice 'fn_salvar_lancamento ja grava cartao_id; nada a fazer';
  else
    if (length(v_def) - length(replace(v_def,
         '(lancamento_id, forma_pagamento_id, valor, created_by)', '')))
       / length('(lancamento_id, forma_pagamento_id, valor, created_by)') <> 1 then
      raise exception 'Ancora 2.1 (colunas do insert em lancamento_formas) nao aparece exatamente uma vez';
    end if;
    v_novo := replace(v_def,
      '(lancamento_id, forma_pagamento_id, valor, created_by)',
      '(lancamento_id, forma_pagamento_id, cartao_id, valor, created_by)');
    v_def := v_novo;

    if (length(v_def) - length(replace(v_def,
         'round((x->>''valor'')::numeric, 2), (select auth.uid())', '')))
       / length('round((x->>''valor'')::numeric, 2), (select auth.uid())') <> 1 then
      raise exception 'Ancora 2.2 (values do insert em lancamento_formas) nao aparece exatamente uma vez';
    end if;
    v_novo := replace(v_def,
      'round((x->>''valor'')::numeric, 2), (select auth.uid())',
      'nullif(x->>''cartao_id'','''')::uuid,' || chr(10) ||
      '         round((x->>''valor'')::numeric, 2), (select auth.uid())');
    v_def := v_novo;

    execute v_def;
  end if;

  -- ===================================================================
  -- 3. fn_aprovar_ordem_compra: o cartão desce da ordem para o lançamento
  -- ===================================================================
  -- Aqui a lista de colunas aparece DUAS vezes: o ramo que copia os blocos da
  -- ordem e o ramo antigo, que monta um bloco único a partir da forma do
  -- cabeçalho. Só o primeiro tem de onde tirar cartão, então a troca da lista é
  -- ancorada no `select` que vem logo depois.
  --
  -- O ramo antigo fica como está de propósito: OC sem bloco e com cartão no
  -- cabeçalho não existe hoje (0 em 27/08/2026) e, se aparecer, a trigger recusa
  -- a aprovação dizendo para escolher o cartão — que é o que a pessoa precisa
  -- fazer mesmo, editando a ordem.
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_aprovar_ordem_compra';

  if v_def is null then
    raise exception 'fn_aprovar_ordem_compra nao encontrada';
  end if;

  if position('ofo.cartao_id' in v_def) > 0 then
    raise notice 'fn_aprovar_ordem_compra ja desce cartao_id; nada a fazer';
  else
    if (length(v_def) - length(replace(v_def,
         'select v_lanc_id, ofo.forma_pagamento_id, ofo.valor, (select auth.uid())', '')))
       / length('select v_lanc_id, ofo.forma_pagamento_id, ofo.valor, (select auth.uid())') <> 1 then
      raise exception 'Ancora 3.1 (select dos blocos da ordem) nao aparece exatamente uma vez';
    end if;
    v_novo := replace(v_def,
      'select v_lanc_id, ofo.forma_pagamento_id, ofo.valor, (select auth.uid())',
      'select v_lanc_id, ofo.forma_pagamento_id, ofo.cartao_id, ofo.valor, (select auth.uid())');
    v_def := v_novo;

    -- Agora a lista de colunas certa é a que vem imediatamente antes do select
    -- que acabou de ganhar `ofo.cartao_id`. O `\s*` cobre a quebra de linha e a
    -- indentação sem depender delas.
    v_novo := regexp_replace(v_def,
      '\(lancamento_id, forma_pagamento_id, valor, created_by\)(\s*select v_lanc_id, ofo\.forma_pagamento_id, ofo\.cartao_id)',
      '(lancamento_id, forma_pagamento_id, cartao_id, valor, created_by)\1');
    if v_novo = v_def then
      raise exception 'Ancora 3.2 (colunas do insert que copia os blocos) nao encontrada';
    end if;
    v_def := v_novo;

    execute v_def;
  end if;
end;
$$;
