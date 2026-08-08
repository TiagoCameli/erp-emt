-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-08, versão
-- 20260808221920 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Onda única de correção do review amplo do Bloco 8a, Important 2 e 3.
--
-- O bloco fechou `fn_salvar_lancamento` e `fn_excluir_lancamento` para as origens
-- novas ('folha', 'folha_guia', 'adiantamento') e deixou duas funções de escrita
-- do Financeiro abertas. O revisor executou os dois ataques, como usuário do
-- Financeiro, sem nenhuma permissão de RH:
--
-- 1. `fn_definir_parcelas_lancamento`: moveu o vencimento da guia de INSS de
--    2026-12-20 para 2027-06-30 e dividiu em duas parcelas. O total é preservado,
--    então a identidade de conferência continua reportando `explicado = 0.00` e a
--    tela da folha não mostra nada. Guia de imposto tem prazo legal.
-- 2. `fn_alterar_mes_competencia`: moveu um lançamento de salário para 2027-03
--    enquanto `folhas.competencia` seguia 2026-11, e a identidade AINDA reportou
--    `explicado 0.00`, porque ela agrupa por `folha_id` e não por mês.
--
-- A guarda espelha o critério e a forma de mensagem que a `fn_excluir_lancamento`
-- já usa desde a 20260808165352: `in ('folha', 'folha_guia')` numa mensagem e
-- `= 'adiantamento'` em outra, cada uma dizendo onde a pessoa resolve.
--
-- `diaria` NÃO entrou na guarda (fica registrado no relatório da onda como gap do
-- mesmo tipo, pré-existente e fora do escopo deste bloco): a `fn_excluir_lancamento`
-- barra `diaria`, mas as duas funções desta migration seguem aceitando origem
-- `diaria`. Acrescentar é uma linha em cada, e é decisão do coordenador.
--
-- Recriação CIRÚRGICA a partir da `pg_get_functiondef`, com o md5 da versão viva
-- fixado e o replace reverso provando que o resto ficou byte a byte igual, mesmo
-- método da 20260808165352. Rodar de novo aborta no md5: é registro do que rodou,
-- não fonte de reaplicação.
--
-- Diff conferido na aplicação:
--   fn_definir_parcelas_lancamento   89 -> 105 linhas   2583 -> 3533 caracteres
--   fn_alterar_mes_competencia       77 ->  92 linhas   2624 -> 3547 caracteres
-- e o reverso devolve db1763d6fad03bcad095661a10480f39 e
-- c5ecf6599d0b65e8d469a6efa7455917, os md5 das originais.

-- ===== 1. fn_definir_parcelas_lancamento =====
do $mig$
declare
  v_def text;
  v_novo text;
  v_reverso text;
  -- (a) a variável de origem no declare
  c_dec_antes constant text := $anchor$  v_valor numeric(14, 2);
  v_status text;$anchor$;
  c_dec_depois constant text := $anchor$  v_valor numeric(14, 2);
  v_status text;
  v_origem text;$anchor$;
  -- (b) ler a origem junto com valor e status, no select que já existe
  c_sel_antes constant text := $anchor$  select valor, status into v_valor, v_status
  from public.lancamentos
  where id = p_lanc_id;$anchor$;
  c_sel_depois constant text := $anchor$  select valor, status, origem into v_valor, v_status, v_origem
  from public.lancamentos
  where id = p_lanc_id;$anchor$;
  -- (c) a guarda, depois da trava de parcela aprovada ou paga (mesma ordem
  --     relativa da fn_excluir_lancamento: estado do pagamento primeiro, origem
  --     depois)
  c_grd_antes constant text := $anchor$    raise exception 'Este lancamento ja tem parcela aprovada ou paga: as parcelas nao podem mais ser trocadas';
  end if;$anchor$;
  c_grd_depois constant text := $anchor$    raise exception 'Este lancamento ja tem parcela aprovada ou paga: as parcelas nao podem mais ser trocadas';
  end if;

  -- Guarda de origem: mesmo criterio e mesma forma de mensagem da
  -- fn_excluir_lancamento. Lancamento que veio do RH nao se reparcela pelo
  -- Financeiro: guia de imposto tem prazo legal, e o vencimento sai do dia
  -- configurado em Parametros da Folha. Sem esta guarda dava para mover a guia
  -- de INSS de 2026-12-20 para 2027-06-30 e partir em duas parcelas, com o
  -- total preservado (a identidade de conferencia continua fechando em 0.00) e
  -- sem sinal nenhum na tela da folha.
  if v_origem in ('folha', 'folha_guia') then
    raise exception 'Nao da para trocar as parcelas aqui: este lancamento veio da folha. Mude o dia de vencimento em Parametros da Folha, depois desaprove e reaprove a folha';
  end if;

  if v_origem = 'adiantamento' then
    raise exception 'Nao da para trocar as parcelas aqui: este lancamento veio de um adiantamento. Exclua e recrie o adiantamento pelo RH';
  end if;$anchor$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_definir_parcelas_lancamento';

  if v_def is null then
    raise exception 'fn_definir_parcelas_lancamento nao encontrada';
  end if;

  if md5(v_def) <> 'db1763d6fad03bcad095661a10480f39' then
    raise exception 'fn_definir_parcelas_lancamento viva nao e a lida no review (md5 %, esperado db1763d6fad03bcad095661a10480f39): reler antes de recriar',
      md5(v_def);
  end if;

  if (length(v_def) - length(replace(v_def, c_dec_antes, ''))) / length(c_dec_antes) <> 1
     or (length(v_def) - length(replace(v_def, c_sel_antes, ''))) / length(c_sel_antes) <> 1
     or (length(v_def) - length(replace(v_def, c_grd_antes, ''))) / length(c_grd_antes) <> 1 then
    raise exception 'um dos tres ancoras nao aparece exatamente 1 vez na fn viva';
  end if;

  v_novo := replace(v_def, c_dec_antes, c_dec_depois);
  v_novo := replace(v_novo, c_sel_antes, c_sel_depois);
  v_novo := replace(v_novo, c_grd_antes, c_grd_depois);

  if length(v_novo) - length(v_def) <>
       (length(c_dec_depois) - length(c_dec_antes))
     + (length(c_sel_depois) - length(c_sel_antes))
     + (length(c_grd_depois) - length(c_grd_antes)) then
    raise exception 'a fn nova cresceu % caracteres, fora do esperado pelos tres ancoras',
      length(v_novo) - length(v_def);
  end if;

  execute v_novo;

  -- Prova: desfazer as tres inclusoes devolve, byte a byte, a original.
  select pg_get_functiondef(p.oid) into v_reverso
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_definir_parcelas_lancamento';

  v_reverso := replace(v_reverso, c_grd_depois, c_grd_antes);
  v_reverso := replace(v_reverso, c_sel_depois, c_sel_antes);
  v_reverso := replace(v_reverso, c_dec_depois, c_dec_antes);

  if md5(v_reverso) <> 'db1763d6fad03bcad095661a10480f39' then
    raise exception 'fn_definir_parcelas_lancamento recriada difere da original em algo alem da guarda de origem (md5 reverso %)',
      md5(v_reverso);
  end if;
end $mig$;

-- ===== 2. fn_alterar_mes_competencia =====
do $mig$
declare
  v_def text;
  v_novo text;
  v_reverso text;
  c_dec_antes constant text := $anchor$  v_travadas int;
begin$anchor$;
  c_dec_depois constant text := $anchor$  v_travadas int;
  v_origem text;
begin$anchor$;
  -- A guarda entra no ramo do lancamento (o ramo da OC nao precisa: o lancamento
  -- que ele acha e sempre origem 'oc' por construcao).
  c_grd_antes constant text := $anchor$    v_lanc_id := p_id;
    select mes_competencia into v_mes_atual from public.lancamentos where id = v_lanc_id;
    if v_mes_atual is null then
      raise exception 'Lancamento nao encontrado';
    end if;$anchor$;
  c_grd_depois constant text := $anchor$    v_lanc_id := p_id;
    select mes_competencia, origem into v_mes_atual, v_origem from public.lancamentos where id = v_lanc_id;
    if v_mes_atual is null then
      raise exception 'Lancamento nao encontrado';
    end if;

    -- Guarda de origem: mesmo criterio e mesma forma de mensagem da
    -- fn_excluir_lancamento. A competencia de um lancamento do RH e a da folha
    -- ou a do adiantamento, nao um campo do contas a pagar. Sem esta guarda
    -- dava para mover o salario de 2026-11 para 2027-03 com folhas.competencia
    -- parada em 2026-11, e a identidade de conferencia NAO acusava, porque ela
    -- agrupa por folha_id e nao por mes.
    if v_origem in ('folha', 'folha_guia') then
      raise exception 'Nao da para mudar o mes de referencia aqui: este lancamento veio da folha. A competencia e a da folha: desaprove a folha, regere na competencia certa e reaprove';
    end if;

    if v_origem = 'adiantamento' then
      raise exception 'Nao da para mudar o mes de referencia aqui: este lancamento veio de um adiantamento. Exclua e recrie o adiantamento na competencia certa';
    end if;$anchor$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_alterar_mes_competencia';

  if v_def is null then
    raise exception 'fn_alterar_mes_competencia nao encontrada';
  end if;

  if md5(v_def) <> 'c5ecf6599d0b65e8d469a6efa7455917' then
    raise exception 'fn_alterar_mes_competencia viva nao e a lida no review (md5 %, esperado c5ecf6599d0b65e8d469a6efa7455917): reler antes de recriar',
      md5(v_def);
  end if;

  if (length(v_def) - length(replace(v_def, c_dec_antes, ''))) / length(c_dec_antes) <> 1
     or (length(v_def) - length(replace(v_def, c_grd_antes, ''))) / length(c_grd_antes) <> 1 then
    raise exception 'um dos dois ancoras nao aparece exatamente 1 vez na fn viva';
  end if;

  v_novo := replace(v_def, c_dec_antes, c_dec_depois);
  v_novo := replace(v_novo, c_grd_antes, c_grd_depois);

  if length(v_novo) - length(v_def) <>
       (length(c_dec_depois) - length(c_dec_antes))
     + (length(c_grd_depois) - length(c_grd_antes)) then
    raise exception 'a fn nova cresceu % caracteres, fora do esperado pelos dois ancoras',
      length(v_novo) - length(v_def);
  end if;

  execute v_novo;

  select pg_get_functiondef(p.oid) into v_reverso
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_alterar_mes_competencia';

  v_reverso := replace(v_reverso, c_grd_depois, c_grd_antes);
  v_reverso := replace(v_reverso, c_dec_depois, c_dec_antes);

  if md5(v_reverso) <> 'c5ecf6599d0b65e8d469a6efa7455917' then
    raise exception 'fn_alterar_mes_competencia recriada difere da original em algo alem da guarda de origem (md5 reverso %)',
      md5(v_reverso);
  end if;
end $mig$;

-- ===== 3. Trava fail-closed: as guardas novas de pé e as antigas intactas =====
do $$
declare v_par text; v_mes text;
begin
  select pg_get_functiondef(p.oid) into v_par
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_definir_parcelas_lancamento';
  select pg_get_functiondef(p.oid) into v_mes
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_alterar_mes_competencia';

  if v_par not like '%''folha'', ''folha_guia''%' or v_par not like '%''adiantamento''%' then
    raise exception 'fn_definir_parcelas_lancamento nao recusa as origens do RH';
  end if;
  if v_mes not like '%''folha'', ''folha_guia''%' or v_mes not like '%''adiantamento''%' then
    raise exception 'fn_alterar_mes_competencia nao recusa as origens do RH';
  end if;

  -- Barreiras antigas de fn_definir_parcelas_lancamento.
  if v_par not like '%Sem permissao para editar lancamentos%'
     or v_par not like '%Lancamento cancelado nao aceita parcelas%'
     or v_par not like '%ja tem parcela aprovada ou paga%'
     or v_par not like '%Informe ao menos uma parcela%'
     or v_par not like '%precisa de um valor maior que zero%'
     or v_par not like '%precisa de uma data de vencimento%'
     or v_par not like '%precisa fechar com o valor do lancamento%'
     or v_par not like '%fn_aplicar_regra_pagamento%' then
    raise exception 'fn_definir_parcelas_lancamento perdeu uma das barreiras antigas';
  end if;

  -- Barreiras antigas de fn_alterar_mes_competencia.
  if v_mes not like '%Documento invalido para alterar mes de referencia%'
     or v_mes not like '%Informe o mes de referencia%'
     or v_mes not like '%Sem permissao para editar ordens de compra%'
     or v_mes not like '%Sem permissao para editar lancamentos%'
     or v_mes not like '%Ordem de compra nao encontrada%'
     or v_mes not like '%ja foi pago. Estorne o pagamento%'
     or v_mes not like '%ja foi aprovado. Desaprove o pagamento%'
     or v_mes not like '%fn_exigir_competencia_aberta%' then
    raise exception 'fn_alterar_mes_competencia perdeu uma das barreiras antigas';
  end if;
end $$;

-- Rollback: os dois blocos com c_*_antes / c_*_depois trocados de lugar, e os md5
-- esperados passando a ser os das versões com guarda (medidos depois de aplicar).
