-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-13, versão
-- 20260813150339 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Task 4 do adiantamento parcelado: SÓ COMENTÁRIO. Nenhuma linha de corpo de
-- função muda. Esta migration não tem `create or replace function`, só
-- `comment on function`, e a trava `do $$` no fim confere os dois md5:
--   fn_aprovar_folha  a1261a1ccbff886980f0991da47a2446  (a que é comentada aqui)
--   fn_gerar_folha    08413ddc2c86c8658371ebd3603a3cfd  (a que garante o líquido)
--
-- POR QUE. A identidade de conferência da folha mudou de DEFINIÇÃO por causa do
-- parcelamento, e o texto que a explica tem que acompanhar na mesma entrega.
-- Duas coisas mudaram:
--
-- 1. O TERMO DO ADIANTAMENTO. Antes era "soma dos adiantamentos concedidos
--    naquela competência", medida por `rh_adiantamentos.folha_id`. Agora é a soma
--    de `rh_adiantamento_parcelas.valor_descontado` das parcelas com `folha_id`
--    daquela folha. A álgebra continua fechando item por item:
--    (salário − inss − irrf − descontado) + (encargos + inss + irrf)
--      + descontado = salário + encargos = custo_total.
--
-- 2. UMA PRÉ-CONDIÇÃO CAIU. Eram três; são duas. A que caiu é "todo item tem
--    valor_liquido > 0": a Task 3 limitou o desconto ao disponível, então
--    líquido NEGATIVO ficou inalcançável por construção. Líquido ZERO continua
--    alcançável e continua não gerando lançamento, mas item de líquido zero soma
--    zero nos DOIS lados da identidade e não desloca nada. Por isso a causa não
--    foi apagada do texto nem da consulta: a condição saiu da lista, o
--    comportamento não. O termo `liquidos_nao_positivos` fica na conta como
--    DETECTOR de regressão do limite (hoje vale 0.00 por construção; se vier
--    diferente, líquido negativo voltou).
--
-- A CONSULTA GRAVADA ESTAVA QUEBRADA, não só desatualizada. A Task 2 dropou
-- `rh_adiantamentos.folha_id` (migration 20260812215337), e a consulta de
-- diagnóstico do comentário lia exatamente essa coluna. Medido antes desta
-- migration, extraindo a consulta do próprio `obj_description` e executando:
--
--   FALHOU: 42703 / column "folha_id" does not exist
--
-- Ou seja: a ferramenta que o contador usa para decidir "isto é bug ou é
-- configuração faltando" não rodava. Ela volta a rodar aqui, e a trava desta
-- migration extrai a consulta do comentário GRAVADO e executa, para nunca mais
-- passar uma consulta que não roda.
--
-- MEDIDO em transação revertida, com a consulta EXTRAÍDA do `obj_description`,
-- nos quatro estados pedidos mais o parcial (produção tem zero colaborador,
-- folha, adiantamento e parcela, e continua assim). Cenário rico: 4
-- colaboradores (um com parcela que cabe integral, um com adiantamento maior que
-- o salário, dois em cascata no mesmo mês, um sem adiantamento), FGTS com grupo
-- e uma provisão de 13º sem grupo. Em TODOS, `explicado` = 0.00:
--
--   1. sem parcelamento, config completa ..... resíduo     0.00  retidos    0
--   2. parcelamento com desconto integral .... resíduo     0.00  retidos    0
--   3. parcela que NÃO cabe (empurrão) ....... resíduo     0.00  retidos    0
--   5a. só o INSS configurado (PARCIAL) ...... resíduo −1272.34  retidos  312.89
--   5b. só o IRRF configurado (PARCIAL) ...... resíduo −1993.54  retidos 1034.09
--   4. folha_parametros VAZIA (produção) ..... resíduo −2352.22  retidos 1392.77
--   4b. VAZIA + todo encargo COM grupo ....... resíduo −1392.77  retidos 1392.77
--
-- O 4b é o caso em que o retido sem grupo é a ÚNICA causa possível, e ali
-- `residuo = -retidos_sem_grupo` no centavo: a causa responde pela diferença
-- inteira. Entre 4 e 4b o `custo_total` cai de 13398.89 para 12439.44, porque a
-- provisão de 13º sai do custo do empregador junto com o encargo, e é por isso
-- que o resíduo encolhe exatamente os 959.45 dela. As duas causas são
-- independentes e somam.
--
-- O caso 3 é o que a Task 3 mudou de verdade: a parcela de 3.000,00 sobre
-- disponível de 1.404,15 desconta 1.404,15, deixa o líquido em 0,00, empurra
-- 1.595,85 para 09/2026, o item NÃO gera lançamento de salário (zero lançamento
-- origem 'folha') e o resíduo continua ZERO. Antes da Task 3 o mesmo cenário
-- dava líquido −1.595,85 e precisava da causa "líquido negativo" para fechar.
--
-- Os casos 5a e 5b (parcial) são o que esta base já errou duas vezes por só
-- testar os extremos: com UM dos dois grupos configurado a folha gera guia E
-- deixa resíduo ao mesmo tempo, e `retidos_sem_grupo` soma só o imposto que
-- ficou de fora. Confere nos dois sentidos, com soma(inss) = 1034.09 e
-- soma(irrf) = 312.89 no cenário: 5a deixa de fora o IRRF (312.89, e as guias
-- geradas são fgts + INSS), 5b deixa de fora o INSS (1034.09, guias fgts +
-- IRRF), e o estado 4 deixa de fora os dois (1392.77 = 1034.09 + 358.68, com o
-- IRRF maior ali porque sem linha em folha_parametros as deduções do IRRF
-- chegam zeradas no cálculo). Em todos, `encargos_sem_grupo` = 959.45 (a
-- provisão de 13º) e `explicado` = 0.00.
--
-- Rollback: reaplicar o texto da 20260808221317 (que volta a ter três causas e
-- a consulta que não roda), ou
--   comment on function public.fn_aprovar_folha(uuid) is null;
comment on function public.fn_aprovar_folha(uuid) is
$c$Aprova a folha e gera as contas a pagar: um a_pagar por colaborador com o valor liquido (origem 'folha', origem_id = folha_itens.id) e um a_pagar por grupo de recolhimento com a guia (origem 'folha_guia', origem_id = folha_guias.id).

CONFERENCIA (para quem bate custo_total contra o contas a pagar):

  soma(liquidos) + soma(guias) + soma(adiantamento DESCONTADO nesta folha) = folhas.custo_total

O TERCEIRO TERMO MUDOU DE DEFINICAO em 13/08/2026, com o adiantamento parcelado. Ele NAO e mais "os adiantamentos concedidos nesta competencia": e a soma de rh_adiantamento_parcelas.valor_descontado das parcelas com folha_id = esta folha, ou seja o que esta folha de fato amortizou. O vinculo antigo era rh_adiantamentos.folha_id, coluna que NAO EXISTE MAIS (foi dropada quando a tabela de parcelas nasceu), e por isso a consulta gravada aqui nas versoes anteriores parou de rodar, falhando com 'column "folha_id" does not exist'.

POR QUE O TERMO E O DESCONTADO, E NAO O CONCEDIDO. Com parcelamento o desembolso e o desconto ficam em COMPETENCIAS DIFERENTES, de proposito: 3.000,00 concedidos em agosto podem ser amortizados 1.000,00 em agosto, 1.000,00 em setembro e 1.000,00 em outubro. O caixa ve a despesa na CONCESSAO (o adiantamento gera o proprio lancamento a_pagar, origem 'adiantamento', no ato da concessao); a folha ve o custo na AMORTIZACAO, mes a mes. Somar o concedido na identidade de agosto faria agosto responder por dinheiro que nao descontou, e setembro e outubro nao responderiam por nada. A consulta abaixo traz concedido_no_mes so para essa comparacao: ela NAO entra na identidade, e concedido_no_mes diferente de adiantamentos_descontados e o NORMAL quando existe parcelamento, nao e erro.

A algebra fecha item por item: (salario - inss - irrf - descontado) + (encargos + inss + irrf) + descontado = salario + encargos = custo_total.

Essa igualdade fecha no centavo QUANDO, e somente quando, as duas condicoes valem:
  1. todo encargo ativo tem grupo_recolhimento preenchido; e
  2. folha_parametros (linha id = 1) existe e tem grupo_recolhimento_inss e grupo_recolhimento_irrf preenchidos.

ERAM TRES CONDICOES. A que caiu era "todo item da folha tem valor_liquido > 0". O desconto do adiantamento passou a ser limitado ao disponivel (least(valor_previsto, greatest(disponivel - ja_descontado, 0)), com disponivel = greatest(salario - inss - irrf, 0)), entao valor_liquido NEGATIVO ficou inalcancavel por construcao. Liquido ZERO continua alcancavel e continua NAO gerando lancamento, mas item de liquido zero soma zero nos DOIS lados da identidade e por isso nao desloca nada. A condicao saiu da lista; o comportamento nao saiu, e esta descrito abaixo.

Quando uma das duas nao vale, a diferenca NAO e arredondamento: ela e explicada no centavo. Chamando

  residuo = soma(liquidos) + soma(guias) + soma(descontado) - folhas.custo_total

vale sempre, em folha aprovada:

  residuo + soma(encargos sem grupo) + soma(valor_liquido <= 0) + soma(retidos sem grupo) = 0

O termo soma(valor_liquido <= 0) segue na conta de proposito, mesmo valendo 0.00 hoje por construcao: ele e o DETECTOR de regressao do limite do desconto. Se ele vier diferente de 0.00, liquido negativo voltou a ser alcancavel, e isso E bug mesmo que "explicado" feche.

Nao precisa raciocinar sinal: a consulta abaixo devolve os dois lados e ja faz essa conta na coluna "explicado", que tem que dar 0.00 sempre. Se "explicado" NAO der 0.00, ai sim e bug e deve ser reportado.

As duas causas de residuo sao comportamento desejado, nao erro:

  - Encargo ativo sem grupo_recolhimento e PROVISAO: entra no custo do empregador (folhas.custo_total) e de proposito nao gera guia, porque nao existe para onde recolher. E o desenho que 13o e ferias usam.
  - Retido sem grupo de recolhimento: quando folha_parametros nao tem linha (o estado de producao em 13/08/2026) ou quando grupo_recolhimento_inss / grupo_recolhimento_irrf estao nulos, o INSS e o IRRF descontados do trabalhador NAO viram conta a pagar. O desconto continua no holerite e no liquido, mas a guia que a empresa precisa recolher nao aparece no Financeiro, e o residuo fica negativo exatamente nesse valor. Nao e bug: e configuracao que falta, e a aprovacao NAO recusa por isso de proposito (config vazia e deploy seguro, e a folha pode servir so como custo gerencial). Para o valor virar guia, preencha os dois grupos em RH > Parametros da Folha (rota /rh/parametros-folha) e depois desaprove e reaprove a folha, que a desaprovacao apaga os lancamentos e a aprovacao recria. A tela do detalhe da folha avisa disso sem bloquear. CUIDADO com o caso PARCIAL: com so UM dos dois grupos configurado a folha gera guia E deixa residuo ao mesmo tempo, e retidos_sem_grupo soma so o imposto que ficou de fora.

E um comportamento que NAO e causa de residuo, mas surpreende quem confere nome por nome:

  - Item com valor_liquido = 0 nao gera lancamento nenhum: o adiantamento do mes consumiu o disponivel inteiro, e lancamento de R$ 0 e sujeira na tela (lancamentos tem check valor >= 0). O colaborador SEGUE na folha, com o holerite completo e o liquido 0,00 visivel no item; ele so nao tem conta a pagar de salario. Logo contar colaboradores da folha contra lancamentos de origem 'folha' pode dar diferente, e estar certo.

ATENCAO na leitura do retido: ele e medido contra a configuracao ATUAL de folha_parametros, nao contra um snapshot do momento da aprovacao (existe snapshot do grupo do encargo patronal, em folha_item_encargos.grupo_recolhimento, mas nao do grupo do retido). Se os grupos foram configurados DEPOIS de a folha ser aprovada, a consulta vai medir retidos_sem_grupo = 0 e o residuo antigo continua la: desaprove e reaprove antes de concluir que e bug.

ATENCAO no termo do adiantamento: ele le rh_adiantamento_parcelas, que a fn_gerar_folha reescreve a cada regeracao. Folha aprovada nao e regerada (a maquina de status exige rascunho), entao em folha aprovada o termo e estavel. Mas regerar uma folha ANTERIOR da cadeia mexe em parcelas de meses seguintes: se a consulta acusar residuo numa folha aprovada logo depois de alguem regerar mes anterior, leia o obj_description da fn_gerar_folha (secao REGERAR FORA DE ORDEM) antes de concluir que e bug de dinheiro.

DIAGNOSTICO, copy-paste-and-run no MCP execute_sql ou no editor SQL do Supabase. Troque SO a data da segunda linha pela competencia da folha (sempre o dia 1 do mes). Zero linha na resposta = nao existe folha nessa competencia:

  with f as (
    select id, competencia, custo_total from public.folhas where competencia = '2026-08-01'
  ), p as (
    select nullif(btrim(coalesce(grupo_recolhimento_inss, '')), '') as grupo_inss,
           nullif(btrim(coalesce(grupo_recolhimento_irrf, '')), '') as grupo_irrf
    from public.folha_parametros where id = 1
  ), partes as (
    select
      f.custo_total,
      coalesce((select sum(l.valor) from public.lancamentos l
                  join public.folha_itens fi on fi.id = l.origem_id
                 where l.origem = 'folha' and fi.folha_id = f.id), 0)      as liquidos,
      coalesce((select sum(l.valor) from public.lancamentos l
                  join public.folha_guias g on g.id = l.origem_id
                 where l.origem = 'folha_guia' and g.folha_id = f.id), 0)  as guias,
      coalesce((select sum(pa.valor_descontado) from public.rh_adiantamento_parcelas pa
                 where pa.folha_id = f.id), 0)                             as adiantamentos_descontados,
      coalesce((select sum(fie.valor) from public.folha_item_encargos fie
                  join public.folha_itens fi on fi.id = fie.folha_item_id
                 where fi.folha_id = f.id and fie.grupo_recolhimento is null), 0) as encargos_sem_grupo,
      coalesce((select sum(valor_liquido) from public.folha_itens
                 where folha_id = f.id and valor_liquido <= 0), 0)         as liquidos_nao_positivos,
      coalesce((select sum(fi.inss) from public.folha_itens fi
                 where fi.folha_id = f.id and fi.inss > 0
                   and (select grupo_inss from p) is null), 0)
      + coalesce((select sum(fi.irrf) from public.folha_itens fi
                 where fi.folha_id = f.id and fi.irrf > 0
                   and (select grupo_irrf from p) is null), 0)             as retidos_sem_grupo,
      coalesce((select sum(a.valor) from public.rh_adiantamentos a
                 where a.competencia = f.competencia), 0)                  as concedido_no_mes
    from f
  )
  select liquidos, guias, adiantamentos_descontados, custo_total,
         liquidos + guias + adiantamentos_descontados - custo_total        as residuo,
         encargos_sem_grupo, liquidos_nao_positivos, retidos_sem_grupo,
         (liquidos + guias + adiantamentos_descontados - custo_total)
           + encargos_sem_grupo + liquidos_nao_positivos
           + retidos_sem_grupo                                            as explicado,
         concedido_no_mes
  from partes;

RATEIO: o rateio da guia e exato, nao proporcional (cada centavo nasce ligado a um item, e o item tem centro de custo), mas item com centro_custo_id nulo fica de fora do rateio. Nesse caso soma(rateios) < valor do lancamento, espalhado por todas as guias, e o custo nao chega a centro de custo nenhum. Ver docs/decisoes.md, entrada de 2026-08-08.$c$;

do $$
declare v_txt text; v_q text; v_n integer;
begin
  v_txt := obj_description('public.fn_aprovar_folha(uuid)'::regprocedure, 'pg_proc');

  if coalesce(length(v_txt), 0) = 0 then
    raise exception 'fn_aprovar_folha ficou sem comentario';
  end if;
  if v_txt not like '%somente quando%' then
    raise exception 'o comentario da fn_aprovar_folha nao declara a condicao da identidade';
  end if;

  -- A identidade agora tem DUAS pre-condicoes, nao tres: a de liquido positivo
  -- caiu porque liquido negativo ficou inalcancavel. Se o texto voltar a dizer
  -- "as tres condicoes", alguem reaplicou uma versao velha por cima.
  if v_txt not like '%as duas condicoes valem%' then
    raise exception 'o comentario nao declara as DUAS pre-condicoes da identidade';
  end if;
  if v_txt like '%as tres condicoes valem%' then
    raise exception 'o comentario voltou a declarar TRES pre-condicoes: versao velha reaplicada';
  end if;

  -- O termo do adiantamento tem que ser o DESCONTADO por parcela, nao o concedido.
  if v_txt not like '%rh_adiantamento_parcelas.valor_descontado%' then
    raise exception 'o comentario nao define o termo do adiantamento como valor_descontado da parcela';
  end if;
  if v_txt not like '%adiantamentos_descontados%' then
    raise exception 'a consulta de diagnostico nao usa o termo novo (adiantamentos_descontados)';
  end if;

  -- As duas causas de residuo continuam declaradas, com o que fazer (a rota da tela).
  if v_txt not like '%encargos_sem_grupo%' then
    raise exception 'a consulta de diagnostico nao tem a causa do encargo sem grupo';
  end if;
  if v_txt not like '%retidos_sem_grupo%' then
    raise exception 'a consulta de diagnostico nao tem a causa do retido sem grupo';
  end if;
  if v_txt not like '%/rh/parametros-folha%' then
    raise exception 'o comentario nao diz onde configurar o grupo de recolhimento dos retidos';
  end if;

  -- O termo do liquido nao positivo NAO foi apagado: liquido ZERO segue
  -- alcancavel, e o termo e o detector de regressao do limite do desconto.
  if v_txt not like '%liquidos_nao_positivos%' then
    raise exception 'a consulta perdeu o termo do liquido nao positivo (detector de regressao)';
  end if;
  if v_txt not like '%Liquido ZERO continua alcancavel%' then
    raise exception 'o comentario nao diz que liquido ZERO segue alcancavel';
  end if;

  -- Nenhum placeholder estilo :nome pode sobrar, senao a consulta nao roda colada
  -- (foi o bug da 20260808173430, corrigido na 20260808174840).
  if v_txt ~ ':[a-zA-Z_]' then
    raise exception 'o comentario ainda tem placeholder :nome, que nao e sintaxe SQL valida';
  end if;

  -- E a consulta tem que estar na forma executavel (CTE por competencia).
  if v_txt not like '%with f as (%' or v_txt not like '%as explicado%' then
    raise exception 'o comentario nao tem a consulta de diagnostico executavel';
  end if;

  -- A consulta e EXTRAIDA do proprio comentario e executada aqui: a migration
  -- falha se o que ficou gravado nao rodar. Foi exatamente esta trava que faltou
  -- valer no tempo: a consulta da 20260808221317 passou por aqui, mas depois a
  -- Task 2 do parcelamento dropou rh_adiantamentos.folha_id e a consulta gravada
  -- passou a falhar com 'column "folha_id" does not exist', em silencio, porque
  -- ninguem mais a executou.
  v_q := substring(v_txt from 'with f as \(.*from partes;');
  if v_q is null then
    raise exception 'nao achei a consulta de diagnostico no comentario';
  end if;
  v_q := rtrim(btrim(v_q), ';');
  execute 'select count(*) from (' || v_q || ') x' into v_n;

  -- O corpo da funcao comentada nao pode ter mudado: md5 da versao aplicada na
  -- 20260808165314.
  if md5((select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'fn_aprovar_folha'))
     <> 'a1261a1ccbff886980f0991da47a2446' then
    raise exception 'o corpo da fn_aprovar_folha mudou: esta migration e so de comentario';
  end if;

  -- E o corpo da fn_gerar_folha tambem nao: o texto acima AFIRMA que liquido
  -- negativo e inalcancavel, e essa garantia e propriedade do corpo DELA (o
  -- least/greatest do desconto). Garantia falsa em comentario e pior que
  -- comentario nenhum, porque quem confia nela para de checar. Se este md5
  -- divergir, releia o corpo antes de confiar no texto.
  if md5((select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'fn_gerar_folha'))
     <> '08413ddc2c86c8658371ebd3603a3cfd' then
    raise exception 'o corpo da fn_gerar_folha mudou: a garantia de liquido nao negativo deste texto precisa ser reconferida';
  end if;
end $$;
