-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-14, versão
-- 20260814160831 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Bloco 8b / Task 2: a folha PROVISIONA 13º e férias como custo do mês.
--
-- O QUE ENTRA NO CUSTO. Para cada item da folha, uma linha por provisão ATIVA em
-- `folha_provisoes`, com principal = round(salário * percentual / 100, 2) e
-- encargos = round(principal * v_pct_total / 100, 2). `v_pct_total` é a soma dos
-- percentuais dos encargos ATIVOS, exatamente a mesma base que os encargos deste
-- mês usaram: a provisão do 13º carrega os encargos que vão incidir quando o 13º
-- for pago, e não faria sentido ela usar uma base diferente da do próprio mês.
-- `folha_itens.provisoes` = soma das linhas, e `custo_total` = salário + encargos
-- + provisões.
--
-- PROVISÃO É CUSTO SEM CAIXA. Não gera lançamento, não gera guia, não mexe em
-- `folha_item_encargos` e NÃO toca o líquido do colaborador: o líquido segue
-- salário − INSS − IRRF − adiantamento descontado. Medido em transação revertida
-- com 2 colaboradores (3.000,00 e 4.500,00), 1 encargo ativo de 20% (e um de 8%
-- desativado) e 1 provisão ativa de 8,333% (e férias de 11,111% DESATIVADA):
--
--   item      salário   encargos   provisões   custo_total   líquido
--   A        3.000,00     600,00      299,99      3.899,99   3.000,00
--   B        4.500,00     900,00      449,99      5.849,99   4.500,00
--
-- O líquido é idêntico ao da mesma folha antes desta migration (3.000,00 e
-- 4.500,00), e o custo subiu exatamente a provisão (3.600,00 → 3.899,99 e
-- 5.400,00 → 5.849,99). Só a provisão ATIVA gerou linha: 1 por item, não 2.
--
-- ARREDONDAMENTO POR LINHA, como no bloco dos encargos: `v_provisoes` é a SOMA
-- das linhas gravadas, pela mesma e única fórmula, então
-- `sum(valor_principal + valor_encargos) == folha_itens.provisoes` por
-- construção, não por sorte. Medido: diferença 0,00 nos dois itens.
--
-- CONFIG VAZIA É DEPLOY SEGURO. Sem provisão ativa o loop não roda,
-- `v_provisoes` fica 0 e `custo_total` volta a ser salário + encargos, igual ao
-- de antes desta migration. Medido: 3.600,00 e 5.400,00, zero linha em
-- `folha_item_provisoes`. Sem encargo ativo, `v_pct_total` = 0 e a provisão nasce
-- só com principal (valor_encargos = 0,00). Por isso dá para aplicar isto antes
-- de cadastrar qualquer provisão.
--
-- SNAPSHOT. Nome, percentual e os dois valores ficam gravados em
-- `folha_item_provisoes` no momento da geração. Desativar ou reajustar uma
-- provisão (ou um encargo) depois NÃO mexe em folha já gerada. Medido: desativar
-- o encargo de 20% depois de gerar deixa as linhas e o custo intactos.
--
-- REGENERAR. O `delete from public.folha_itens` cascateia para
-- `folha_item_provisoes` (FK ON DELETE CASCADE), então regerar N vezes dá o mesmo
-- resultado e não deixa linha órfã. Medido 3 vezes: mesmo custo, mesmas linhas,
-- zero órfã.
--
-- COMO ESTE ARQUIVO ALTERA A FUNÇÃO. A `fn_gerar_folha` está na quinta alteração
-- e é grande (14363 chars antes). Em vez de reescrever o corpo à mão, este
-- arquivo faz o que as quatro alterações anteriores fizeram na bancada: parte da
-- PRÓPRIA definição viva (`pg_get_functiondef`) e aplica `replace()` cirúrgico,
-- agora dentro da migration, com as duas pontas fixadas por md5. São QUATRO
-- edits e nada mais, dois deles só de comentário:
--   1. as variáveis novas, declaradas junto das existentes;
--   2. [comentário] o `-- delete cascateia para folha_item_encargos` passou a
--      dizer as DUAS filhas, porque agora ele também limpa folha_item_provisoes,
--      e é desse cascade que a idempotência da regeneração depende;
--   3. o bloco da provisão, inserido DEPOIS do loop de encargos (portanto depois
--      do `returning id into v_item_id`, de que o insert das linhas depende) e
--      ANTES do fechamento do item, mais `v_custo := salário + encargos +
--      provisões` e o comentário logo acima dele, que dizia
--      "(salario + encargos)" e passaria a MENTIR;
--   4. `valor_provisoes` no `update public.folhas` do fim.
--
-- Cada âncora é conferida por CONTAGEM (tem que aparecer exatamente 1 vez) antes
-- de ser trocada, o pré-estado é fixado em md5(prosrc) =
-- 29c33b2d43a50af321f0ee2f7b7e5728 e o pós-estado em
-- 0705f9c753f84e16f411ef4e35ec9b9c (15840 chars), que é o md5 do texto conferido
-- por diff fora do banco antes de aplicar. Se outra sessão tiver alterado a
-- função, a migration RECUSA em vez de sobrescrever.
--
-- Intactos, conferidos por diff: INSS progressivo com `lag`, IRRF com `least`, o
-- loop de encargos, o desconto de parcela de adiantamento com cascata e empurrão,
-- a trava da regeneração com condição de ordem, a guarda de status e o snapshot
-- do grupo de recolhimento.
--
-- O QUE ESTA MIGRATION DEIXA PENDENTE, DE PROPÓSITO. A conferência gravada no
-- `comment on function public.fn_aprovar_folha` afirma
-- `soma(líquidos) + soma(guias) + soma(descontado) = folhas.custo_total`, com a
-- álgebra `salário + encargos = custo_total`. Com a provisão dentro do
-- `custo_total` e SEM contrapartida em lançamento (é custo sem caixa), a coluna
-- `explicado` daquela consulta passa a valer −soma(provisões) em vez de 0,00. O
-- texto do comentário ainda não sabe disso, e aquele mesmo comentário ainda
-- descreve 13º e férias como "encargo ativo sem grupo_recolhimento", que era o
-- desenho ANTERIOR. Corrigir aquele comentário é a Task 3 deste bloco, não esta
-- migration, e por isso as travas abaixo CONFEREM que a fn_aprovar_folha não foi
-- tocada aqui.

do $mig$
declare
  v_def text;
  v_ancora text[];
  v_novo text[];
  v_gerar text;
  v_aprovar text;
  v_chars integer;
  v_qtd integer;
  i integer;
begin
  select md5(prosrc) into v_gerar
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';

  select md5(prosrc) into v_aprovar
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_aprovar_folha';

  if v_gerar is distinct from '29c33b2d43a50af321f0ee2f7b7e5728' then
    raise exception 'fn_gerar_folha nao esta na versao que esta migration mediu (esperado 29c33b2d43a50af321f0ee2f7b7e5728, achado %). O replace() cirurgico e o diff foram conferidos contra aquela versao: PARE e recalcule a partir da definicao viva de agora, em vez de sobrescrever alteracao de outra sessao.', coalesce(v_gerar, '(funcao inexistente)');
  end if;

  if v_aprovar is distinct from 'a1261a1ccbff886980f0991da47a2446' then
    raise exception 'fn_aprovar_folha mudou (esperado a1261a1ccbff886980f0991da47a2446, achado %). Ela NAO e desta migration; se mudou, foi em paralelo, e a conferencia gravada no comentario dela precisa ser relida antes de seguir.', coalesce(v_aprovar, '(funcao inexistente)');
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';

  v_ancora := array[
$a1$  v_disponivel numeric; v_par record; v_desc_par numeric; v_trava date;
begin
$a1$,
$a2$    -- delete cascateia para folha_item_encargos (FK ON DELETE CASCADE).
$a2$,
$a3$    -- Fecha o item com o total discriminado e o custo da empresa (salario + encargos).
    -- INSS/IRRF sao desconto do trabalhador: NAO entram no custo da empresa.
    v_custo := v_colab.salario + v_encargos;
$a3$,
$a4$    valor_liquido = coalesce((select sum(valor_liquido) from public.folha_itens where folha_id = v_folha), 0),
$a4$
  ];

  v_novo := array[
$b1$  v_disponivel numeric; v_par record; v_desc_par numeric; v_trava date;
  -- Bloco 8b / Task 2: provisao de 13o e ferias como custo do mes.
  v_prov record; v_prov_principal numeric; v_prov_encargos numeric; v_provisoes numeric;
begin
$b1$,
$b2$    -- delete cascateia para folha_item_encargos e folha_item_provisoes
    -- (as duas FKs sao ON DELETE CASCADE): regerar nao deixa linha orfa.
$b2$,
$b3$    -- Bloco 8b: provisao de 13o e ferias. Custo do mes, SEM caixa: nao gera
    -- lancamento nem guia. Principal + os encargos que vao incidir quando o 13o
    -- e as ferias forem pagos, usando v_pct_total, a MESMA base que os encargos
    -- deste mes usaram. Config vazia => v_provisoes = 0 e custo igual ao de antes.
    -- Arredondamento por LINHA, como no Bloco 6: sum(linhas) == folha_itens.provisoes
    -- por construcao.
    v_provisoes := 0;
    for v_prov in
      select nome, percentual from public.folha_provisoes where ativo order by nome
    loop
      v_prov_principal := round(v_colab.salario * v_prov.percentual / 100.0, 2);
      v_prov_encargos := round(v_prov_principal * v_pct_total / 100.0, 2);

      insert into public.folha_item_provisoes
        (folha_item_id, nome, percentual, valor_principal, valor_encargos)
      values (v_item_id, v_prov.nome, v_prov.percentual, v_prov_principal, v_prov_encargos);

      v_provisoes := v_provisoes + v_prov_principal + v_prov_encargos;
    end loop;

    update public.folha_itens set provisoes = v_provisoes where id = v_item_id;

    -- Fecha o item com o total discriminado e o custo da empresa
    -- (salario + encargos + provisoes).
    -- INSS/IRRF sao desconto do trabalhador: NAO entram no custo da empresa.
    v_custo := v_colab.salario + v_encargos + v_provisoes;
$b3$,
$b4$    valor_liquido = coalesce((select sum(valor_liquido) from public.folha_itens where folha_id = v_folha), 0),
    valor_provisoes = coalesce((select sum(provisoes) from public.folha_itens where folha_id = v_folha), 0),
$b4$
  ];

  for i in 1 .. array_length(v_ancora, 1) loop
    v_qtd := (length(v_def) - length(replace(v_def, v_ancora[i], ''))) / length(v_ancora[i]);
    if v_qtd <> 1 then
      raise exception 'ancora % aparece % vezes na definicao viva da fn_gerar_folha (esperado exatamente 1): edit cirurgico abortado. Primeiros 120 chars da ancora: %', i, v_qtd, left(v_ancora[i], 120);
    end if;
    v_def := replace(v_def, v_ancora[i], v_novo[i]);
  end loop;

  execute v_def;

  select md5(prosrc), length(prosrc) into v_gerar, v_chars
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_gerar_folha';

  if v_gerar is distinct from '0705f9c753f84e16f411ef4e35ec9b9c' then
    raise exception 'o corpo gravado da fn_gerar_folha (% chars, md5 %) nao bate com o texto conferido por diff fora do banco antes de aplicar (esperado 0705f9c753f84e16f411ef4e35ec9b9c, 15840 chars).', v_chars, v_gerar;
  end if;

  select md5(prosrc) into v_aprovar
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_aprovar_folha';

  if v_aprovar is distinct from 'a1261a1ccbff886980f0991da47a2446' then
    raise exception 'fn_aprovar_folha mudou no meio desta migration (esperado a1261a1ccbff886980f0991da47a2446, achado %).', coalesce(v_aprovar, '(funcao inexistente)');
  end if;

  -- Postgres cria funcao plpgsql com SQL embutido INVALIDO sem reclamar: nome de
  -- coluna errado no corpo so estoura na primeira execucao, ou seja na primeira
  -- folha de verdade. Nesta base isso ja aconteceu (um sum(valor) sobre
  -- subconsulta cuja coluna era valor_cc). As quatro referencias novas do bloco
  -- da provisao sao conferidas aqui, no ato, contra o schema de verdade.
  perform 1 from public.folha_provisoes where false;
  perform 1 from public.folha_item_provisoes where false;
  perform provisoes from public.folha_itens where false;
  perform valor_provisoes from public.folhas where false;
end $mig$;
