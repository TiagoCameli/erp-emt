-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-14. Este arquivo é o
-- registro versionado do que foi aplicado; NÃO rode `supabase db push` neste
-- projeto (ver docs/decisoes.md).
--
-- Bloco 8b / Task 3: SÓ COMENTÁRIO. Nenhuma linha de corpo de função muda. Esta
-- migration não tem `create or replace function`, só `comment on function`, e a
-- trava `do $$` no fim confere os dois md5:
--   fn_aprovar_folha  a1261a1ccbff886980f0991da47a2446  (a que é comentada aqui,
--                     md5 de ANTES desta frente: o corpo dela não muda no Bloco 8b)
--   fn_gerar_folha    0705f9c753f84e16f411ef4e35ec9b9c  (md5 PÓS-PROVISÃO, o da
--                     Task 2 / migration 20260814160831, 15840 chars. NÃO é o
--                     29c33b2d43a50af321f0ee2f7b7e5728 do plano, que é pré-Task 2)
--
-- POR QUE. A Task 2 somou a provisão de 13º e férias ao `folhas.custo_total` sem
-- contrapartida em lançamento (provisão é custo sem caixa), e a conferência
-- gravada no `obj_description` da `fn_aprovar_folha` ficou MENTINDO em dois pontos
-- ao mesmo tempo:
--
-- 1. A ÁLGEBRA. A identidade gravada somava três termos (líquidos + guias +
--    adiantamento descontado) contra o `custo_total`. Medido em transação
--    revertida, extraindo a consulta do próprio `obj_description` e executando,
--    com 2 colaboradores (3.000,00 e 4.500,00), 1 encargo ativo de 20% com grupo
--    (e um de 8% inativo), 1 provisão ativa de 8,333% (e férias de 11,111%
--    inativa) e só o grupo do INSS configurado:
--
--      liquidos 6.622,50 · guias 2.175,00 · custo_total 9.749,98
--      residuo -952,48 · retidos_sem_grupo 202,50 · explicado -749,98
--
--    `explicado = -749,98 = -folhas.valor_provisoes`, ao centavo. E o próprio
--    texto gravado manda, com estas palavras, "se explicado NÃO der 0.00, aí sim
--    é bug e deve ser reportado". Ou seja: a ferramenta que o contador abre para
--    separar bug de configuração faltando passou a acusar bug em folha CERTA,
--    sempre que houver provisão. Com o quarto termo, a mesma folha dá
--    `explicado = 0,00`.
--
-- 2. A ORIENTAÇÃO, que é o pior dos dois. O texto descrevia 13º e férias como
--    "encargo ativo sem grupo_recolhimento" e dizia que esse era "o desenho que
--    13º e férias usam". Era o desenho ANTERIOR a esta frente. Quem seguisse a
--    orientação hoje cadastraria 13º como encargo ativo sem grupo E teria a
--    provisão de 13º em `folha_provisoes`, contando o MESMO custo duas vezes
--    (`folha_item_encargos` e `folha_item_provisoes`), e o `explicado` fecha
--    0,00 nas duas contagens, porque encargo sem grupo é causa declarada e
--    provisão passou a ser termo. A duplicidade não apareceria nesta consulta:
--    apareceria no custo da obra. A frase saiu, não foi complementada.
--
-- O QUE NÃO MUDOU, DE PROPÓSITO: as PRÉ-CONDIÇÕES continuam DUAS e os TERMOS
-- EXPLICATIVOS da conta do `explicado` continuam TRÊS (encargo sem grupo, líquido
-- não positivo, retido sem grupo). Provisão não virou uma quarta causa de
-- resíduo: virou termo da identidade. Contar a provisão nos dois lugares faria a
-- consulta acusar de novo, com o sinal trocado.
--
-- MEDIDO nos cinco estados, sempre em transação revertida e sempre com a consulta
-- EXTRAÍDA do `obj_description` gravado (o que importa é que o texto gravado
-- roda). Produção tem zero colaborador, folha, encargo, provisão, parâmetro,
-- faixa e adiantamento, e continua assim. Em todos, `explicado` = 0,00 e
-- `consolidado_fecha` = 0,00:
--
--   1. sem provisão, config completa ......... residuo     0,00  provisoes   0,00
--   2. com provisão, config completa ......... residuo     0,00  provisoes 749,98
--   3. com provisão + encargo sem grupo ...... residuo  -375,00  provisoes 781,23
--   4. com provisão + folha_parametros VAZIA . residuo  -951,38  provisoes 749,98
--   5. PARCIAL: 1 provisão ativa de 2, só o
--      grupo do INSS configurado ............. residuo  -202,50  provisoes 749,98
--
-- O caso 5 é o que esta base já errou duas vezes por só testar os extremos: uma
-- provisão ativa entre duas e um só dos dois grupos de retido, ou seja a folha
-- gera guia E deixa resíduo ao mesmo tempo. No caso 3 o encargo novo sem grupo
-- entra em `v_pct_total`, então a provisão sobe junto (781,23 em vez de 749,98):
-- as duas causas somam e continuam independentes.
--
-- A coluna nova `consolidado_fecha` compara a soma de `folha_itens.provisoes` (o
-- termo da identidade) com `folhas.valor_provisoes` (o número que a tela da folha
-- mostra). Tem que dar 0,00: se divergir, o consolidado e a soma dos itens
-- brigaram, e isso é bug, não configuração.
--
-- Rollback: reaplicar o texto da 20260813221243 (que volta a ter a identidade de
-- três termos, a consulta que devolve -valor_provisoes e a orientação morta de
-- fazer 13º como encargo), ou
--   comment on function public.fn_aprovar_folha(uuid) is null;
comment on function public.fn_aprovar_folha(uuid) is
$c$Aprova a folha e gera as contas a pagar: um a_pagar por colaborador com o valor liquido (origem 'folha', origem_id = folha_itens.id) e um a_pagar por grupo de recolhimento com a guia (origem 'folha_guia', origem_id = folha_guias.id).

CONFERENCIA (para quem bate custo_total contra o contas a pagar):

  soma(liquidos) + soma(guias) + soma(adiantamento DESCONTADO nesta folha) + soma(provisoes) = folhas.custo_total

O QUARTO TERMO NASCEU em 14/08/2026, com a provisao mensal de 13o e ferias. PROVISAO E CUSTO SEM CAIXA: ela entra no folhas.custo_total (pela coluna folha_itens.provisoes, discriminada em folha_item_provisoes) e de proposito NAO gera lancamento, NAO gera guia e NAO toca o liquido do colaborador, porque neste mes nao existe nada a pagar a ninguem por causa dela. E exatamente por nao ter contrapartida no contas a pagar que ela precisa aparecer na identidade como termo PROPRIO: sem ela do lado esquerdo, a soma dos lancamentos fica MENOR que o custo total em exatamente folhas.valor_provisoes.

PROVISAO NAO E UMA QUARTA CAUSA DE RESIDUO. Ela e termo EXPLICITO da igualdade, igual ao liquido e a guia: somando os quatro termos, fecha no centavo. As causas de diferenca legitima continuam TRES, as mesmas de sempre (encargo sem grupo, retido sem grupo, liquido zero), e a conta do "explicado" mais abaixo continua com TRES termos explicativos, nao quatro. Se alguem contar a provisao duas vezes, uma como termo da identidade e outra como causa de residuo, o "explicado" volta a acusar bug em folha certa, agora com o sinal trocado.

O TERCEIRO TERMO MUDOU DE DEFINICAO em 13/08/2026, com o adiantamento parcelado. Ele NAO e mais "os adiantamentos concedidos nesta competencia": e a soma de rh_adiantamento_parcelas.valor_descontado das parcelas com folha_id = esta folha, ou seja o que esta folha de fato amortizou. O vinculo antigo era rh_adiantamentos.folha_id, coluna que NAO EXISTE MAIS (foi dropada quando a tabela de parcelas nasceu), e por isso a consulta gravada aqui nas versoes anteriores parou de rodar, falhando com 'column "folha_id" does not exist'.

POR QUE O TERMO E O DESCONTADO, E NAO O CONCEDIDO. Com parcelamento o desembolso e o desconto ficam em COMPETENCIAS DIFERENTES, de proposito: 3.000,00 concedidos em agosto podem ser amortizados 1.000,00 em agosto, 1.000,00 em setembro e 1.000,00 em outubro. O caixa ve a despesa na CONCESSAO (o adiantamento gera o proprio lancamento a_pagar, origem 'adiantamento', no ato da concessao); a folha ve o custo na AMORTIZACAO, mes a mes. Somar o concedido na identidade de agosto faria agosto responder por dinheiro que nao descontou, e setembro e outubro nao responderiam por nada. A consulta abaixo traz concedido_no_mes so para essa comparacao: ela NAO entra na identidade, e concedido_no_mes diferente de adiantamentos_descontados e o NORMAL quando existe parcelamento, nao e erro.

A algebra fecha item por item: (salario - inss - irrf - descontado) + (encargos + inss + irrf) + descontado + provisoes = salario + encargos + provisoes = custo_total.

Essa igualdade fecha no centavo QUANDO, e somente quando, as duas condicoes valem:
  1. todo encargo ativo tem grupo_recolhimento preenchido; e
  2. folha_parametros (linha id = 1) existe e tem grupo_recolhimento_inss e grupo_recolhimento_irrf preenchidos.

A provisao NAO entra nessas condicoes e nao acrescenta nenhuma. Ela nao depende de configuracao de recolhimento, porque nunca vira guia: com provisao ou sem, ativa ou inativa, cadastrada ou nao, a igualdade fecha igual.

ERAM TRES CONDICOES. A que caiu era "todo item da folha tem valor_liquido > 0". O desconto do adiantamento passou a ser limitado ao disponivel (least(valor_previsto, greatest(disponivel - ja_descontado, 0)), com disponivel = greatest(salario - inss - irrf, 0)), entao valor_liquido NEGATIVO ficou inalcancavel por construcao. Liquido ZERO continua alcancavel e continua NAO gerando lancamento, mas item de liquido zero soma zero nos DOIS lados da identidade e por isso nao desloca nada. A condicao saiu da lista; o comportamento nao saiu, e esta descrito abaixo.

Quando uma das duas nao vale, a diferenca NAO e arredondamento: ela e explicada no centavo. Chamando

  residuo = soma(liquidos) + soma(guias) + soma(descontado) + soma(provisoes) - folhas.custo_total

vale sempre, em folha aprovada:

  residuo + soma(encargos sem grupo) + soma(valor_liquido <= 0) + soma(retidos sem grupo) = 0

O termo soma(valor_liquido <= 0) segue na conta de proposito, mesmo valendo 0.00 hoje por construcao: ele e o DETECTOR de regressao do limite do desconto. Se ele vier diferente de 0.00, liquido negativo voltou a ser alcancavel, e isso E bug mesmo que "explicado" feche.

Nao precisa raciocinar sinal: a consulta abaixo devolve os dois lados e ja faz essa conta na coluna "explicado", que tem que dar 0.00 sempre. Se "explicado" NAO der 0.00, ai sim e bug e deve ser reportado.

ARMADILHA HISTORICA, se voce estiver conferindo com uma copia velha da consulta: entre 14/08/2026 e a correcao deste texto a consulta gravada aqui somava so TRES termos, ignorava a provisao e devolvia explicado = -folhas.valor_provisoes em folha PERFEITA (medido: -749,98 numa folha com 749,98 de provisao). Se o seu "explicado" bater exatamente com -folhas.valor_provisoes, o defeito esta na consulta que voce colou, nao na folha: use a de baixo.

As duas causas de residuo sao comportamento desejado, nao erro:

  - Encargo ativo sem grupo_recolhimento: entra no custo do empregador (folhas.custo_total) e de proposito nao gera guia, porque nao existe para onde recolher. NAO USE ISSO PARA 13o E FERIAS. Ate 14/08/2026 este proprio texto mandava fazer exatamente isso, e a orientacao esta MORTA: 13o e ferias tem cadastro proprio em folha_provisoes, entram pelo quarto termo da identidade e ja trazem embutidos os encargos que vao incidir quando forem pagos. Cadastrar 13o ou ferias TAMBEM como encargo ativo sem grupo hoje conta o mesmo custo DUAS VEZES, uma em folha_item_encargos e outra em folha_item_provisoes, e o "explicado" continua fechando 0.00 nas duas contagens: a duplicidade NAO aparece nesta consulta, aparece no custo da obra e no resultado do mes. Encargo sem grupo segue legitimo para custo patronal que de fato nao tem guia neste sistema; para 13o e ferias, nao.
  - Retido sem grupo de recolhimento: quando folha_parametros nao tem linha (o estado de producao em 14/08/2026) ou quando grupo_recolhimento_inss / grupo_recolhimento_irrf estao nulos, o INSS e o IRRF descontados do trabalhador NAO viram conta a pagar. O desconto continua no holerite e no liquido, mas a guia que a empresa precisa recolher nao aparece no Financeiro, e o residuo fica negativo exatamente nesse valor. Nao e bug: e configuracao que falta, e a aprovacao NAO recusa por isso de proposito (config vazia e deploy seguro, e a folha pode servir so como custo gerencial). Para o valor virar guia, preencha os dois grupos em RH > Parametros da Folha (rota /rh/parametros-folha) e depois desaprove e reaprove a folha, que a desaprovacao apaga os lancamentos e a aprovacao recria. A tela do detalhe da folha avisa disso sem bloquear. CUIDADO com o caso PARCIAL: com so UM dos dois grupos configurado a folha gera guia E deixa residuo ao mesmo tempo, e retidos_sem_grupo soma so o imposto que ficou de fora.

E um comportamento que NAO e causa de residuo, mas surpreende quem confere nome por nome:

  - Item com valor_liquido = 0 nao gera lancamento nenhum: o adiantamento do mes consumiu o disponivel inteiro, e lancamento de R$ 0 e sujeira na tela (lancamentos tem check valor >= 0). O colaborador SEGUE na folha, com o holerite completo e o liquido 0,00 visivel no item; ele so nao tem conta a pagar de salario. Logo contar colaboradores da folha contra lancamentos de origem 'folha' pode dar diferente, e estar certo.

ATENCAO na leitura do retido: ele e medido contra a configuracao ATUAL de folha_parametros, nao contra um snapshot do momento da aprovacao (existe snapshot do grupo do encargo patronal, em folha_item_encargos.grupo_recolhimento, mas nao do grupo do retido). Se os grupos foram configurados DEPOIS de a folha ser aprovada, a consulta vai medir retidos_sem_grupo = 0 e o residuo antigo continua la: desaprove e reaprove antes de concluir que e bug.

ATENCAO na leitura da provisao, que e o OPOSTO do retido: o termo le folha_itens.provisoes, que e SNAPSHOT do momento em que a folha foi gerada (folha_item_provisoes guarda nome, percentual, valor_principal e valor_encargos como estavam, e o valor_encargos usa o percentual total dos encargos ativos daquele mes). Desativar, reajustar ou excluir uma provisao depois NAO mexe em folha ja gerada, entao o termo e estavel e nao precisa de desaprova-e-reaprova para conferir. A coluna consolidado_fecha da consulta compara a soma de folha_itens.provisoes com folhas.valor_provisoes, que e o numero que a tela da folha mostra: tem que dar 0.00, e diferente disso e bug, nao configuracao.

ATENCAO no termo do adiantamento: ele le rh_adiantamento_parcelas, que a fn_gerar_folha reescreve a cada regeracao. Folha aprovada nao e regerada (a maquina de status exige rascunho), entao em folha aprovada o termo e estavel. Mas regerar uma folha ANTERIOR da cadeia mexe em parcelas de meses seguintes: se a consulta acusar residuo numa folha aprovada logo depois de alguem regerar mes anterior, leia o obj_description da fn_gerar_folha (secao REGERAR FORA DE ORDEM) antes de concluir que e bug de dinheiro.

DIAGNOSTICO, copy-paste-and-run no MCP execute_sql ou no editor SQL do Supabase. Troque SO a data, que e o unico literal de data da consulta, pela competencia da folha (sempre o dia 1 do mes). Zero linha na resposta = nao existe folha nessa competencia:

  -- a linha abaixo e lida por public.fn_verificar_diagnosticos_gravados(): nao remova
  -- DIAGNOSTICO EXECUTAVEL v1
  with f as (
    select id, competencia, custo_total, valor_provisoes from public.folhas where competencia = '2026-08-01'
  ), p as (
    select nullif(btrim(coalesce(grupo_recolhimento_inss, '')), '') as grupo_inss,
           nullif(btrim(coalesce(grupo_recolhimento_irrf, '')), '') as grupo_irrf
    from public.folha_parametros where id = 1
  ), partes as (
    select
      f.custo_total,
      f.valor_provisoes,
      coalesce((select sum(l.valor) from public.lancamentos l
                  join public.folha_itens fi on fi.id = l.origem_id
                 where l.origem = 'folha' and fi.folha_id = f.id), 0)      as liquidos,
      coalesce((select sum(l.valor) from public.lancamentos l
                  join public.folha_guias g on g.id = l.origem_id
                 where l.origem = 'folha_guia' and g.folha_id = f.id), 0)  as guias,
      coalesce((select sum(pa.valor_descontado) from public.rh_adiantamento_parcelas pa
                 where pa.folha_id = f.id), 0)                             as adiantamentos_descontados,
      coalesce((select sum(fi.provisoes) from public.folha_itens fi
                 where fi.folha_id = f.id), 0)                             as provisoes,
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
  select liquidos, guias, adiantamentos_descontados, provisoes, custo_total,
         liquidos + guias + adiantamentos_descontados + provisoes - custo_total as residuo,
         encargos_sem_grupo, liquidos_nao_positivos, retidos_sem_grupo,
         (liquidos + guias + adiantamentos_descontados + provisoes - custo_total)
           + encargos_sem_grupo + liquidos_nao_positivos
           + retidos_sem_grupo                                            as explicado,
         provisoes - valor_provisoes                                      as consolidado_fecha,
         concedido_no_mes
  from partes;

RATEIO: o rateio da guia e exato, nao proporcional (cada centavo nasce ligado a um item, e o item tem centro de custo), mas item com centro_custo_id nulo fica de fora do rateio. Nesse caso soma(rateios) < valor do lancamento, espalhado por todas as guias, e o custo nao chega a centro de custo nenhum. Ver docs/decisoes.md, entrada de 2026-08-08. A provisao nao tem rateio nenhum, e isso e consequencia de nao ter lancamento: o centro de custo dela e o do proprio item (folha_itens.centro_custo_id), entao provisao por centro de custo se soma por folha_itens, nunca por lancamento_rateios.$c$;

do $$
declare
  v_txt text;
  v_q text;
  v_n integer;
  v_marca constant text := '-- DIAGNOSTICO EXECUTAVEL v1';
  v_falhas integer;
  v_primeira text;
begin
  v_txt := obj_description('public.fn_aprovar_folha(uuid)'::regprocedure, 'pg_proc');

  if coalesce(length(v_txt), 0) = 0 then
    raise exception 'fn_aprovar_folha ficou sem comentario';
  end if;

  -- ===== 1. A identidade tem QUATRO termos, e a versao de tres nao pode voltar =====
  if v_txt not like '%+ soma(provisoes) = folhas.custo_total%' then
    raise exception 'a identidade gravada nao tem o quarto termo (soma(provisoes)) do lado esquerdo';
  end if;
  if v_txt like '%soma(adiantamento DESCONTADO nesta folha) = folhas.custo_total%' then
    raise exception 'a identidade gravada voltou a ter TRES termos: versao pre-provisao reaplicada por cima';
  end if;
  if v_txt not like '%soma(descontado) + soma(provisoes) - folhas.custo_total%' then
    raise exception 'a formula do residuo nao inclui a provisao';
  end if;
  if v_txt like '%soma(descontado) - folhas.custo_total%' then
    raise exception 'a formula do residuo voltou a ignorar a provisao';
  end if;
  if v_txt not like '%salario + encargos + provisoes = custo_total%' then
    raise exception 'a algebra item por item nao fecha em salario + encargos + provisoes';
  end if;

  -- ===== 2. Provisao e TERMO, nao quarta causa; e e custo SEM CAIXA =====
  if v_txt not like '%PROVISAO NAO E UMA QUARTA CAUSA DE RESIDUO%' then
    raise exception 'o comentario nao diz que provisao e termo da identidade, nao causa de residuo';
  end if;
  if v_txt not like '%PROVISAO E CUSTO SEM CAIXA%' then
    raise exception 'o comentario nao explica que provisao e custo sem caixa (por isso nao gera lancamento)';
  end if;
  -- A conta do "explicado" continua com TRES termos explicativos. Se a provisao
  -- entrar tambem aqui, ela e contada duas vezes e a consulta volta a acusar
  -- folha certa, com o sinal trocado.
  if v_txt not like '%residuo + soma(encargos sem grupo) + soma(valor_liquido <= 0) + soma(retidos sem grupo) = 0%' then
    raise exception 'a conta do explicado nao esta com os TRES termos explicativos de sempre';
  end if;

  -- ===== 3. A orientacao morta (13o/ferias como encargo sem grupo) nao pode sobrar =====
  -- Era o desenho ANTERIOR ao Bloco 8b. Quem seguisse isso hoje contaria o mesmo
  -- custo em folha_item_encargos e em folha_item_provisoes, e o "explicado"
  -- fecharia 0.00 nas duas contagens: a duplicidade nao aparece na conferencia.
  if v_txt like '%grupo_recolhimento e PROVISAO%' then
    raise exception 'o comentario voltou a descrever 13o/ferias como encargo ativo sem grupo_recolhimento: essa orientacao duplica custo';
  end if;
  if v_txt like '%E o desenho que 13o e ferias usam%' then
    raise exception 'o comentario voltou a mandar fazer 13o e ferias como encargo sem grupo';
  end if;
  if v_txt not like '%NAO USE ISSO PARA 13o E FERIAS%' then
    raise exception 'o comentario nao avisa que encargo sem grupo nao serve para 13o e ferias';
  end if;
  if v_txt not like '%folha_provisoes%' then
    raise exception 'o comentario nao aponta o cadastro proprio da provisao (folha_provisoes)';
  end if;

  -- ===== 4. O que a Task 3 NAO pode ter perdido do texto anterior =====
  if v_txt not like '%somente quando%' then
    raise exception 'o comentario da fn_aprovar_folha nao declara a condicao da identidade';
  end if;
  if v_txt not like '%as duas condicoes valem%' then
    raise exception 'o comentario nao declara as DUAS pre-condicoes da identidade';
  end if;
  if v_txt like '%as tres condicoes valem%' then
    raise exception 'o comentario voltou a declarar TRES pre-condicoes: versao velha reaplicada';
  end if;
  if v_txt not like '%rh_adiantamento_parcelas.valor_descontado%' then
    raise exception 'o comentario nao define o termo do adiantamento como valor_descontado da parcela';
  end if;
  if v_txt not like '%adiantamentos_descontados%' then
    raise exception 'a consulta de diagnostico nao usa o termo do adiantamento descontado';
  end if;
  if v_txt not like '%encargos_sem_grupo%' then
    raise exception 'a consulta de diagnostico nao tem a causa do encargo sem grupo';
  end if;
  if v_txt not like '%retidos_sem_grupo%' then
    raise exception 'a consulta de diagnostico nao tem a causa do retido sem grupo';
  end if;
  if v_txt not like '%liquidos_nao_positivos%' then
    raise exception 'a consulta perdeu o termo do liquido nao positivo (detector de regressao)';
  end if;
  if v_txt not like '%Liquido ZERO continua alcancavel%' then
    raise exception 'o comentario nao diz que liquido ZERO segue alcancavel';
  end if;
  if v_txt not like '%/rh/parametros-folha%' then
    raise exception 'o comentario nao diz onde configurar o grupo de recolhimento dos retidos';
  end if;

  -- ===== 5. A consulta roda COLADA, sem placeholder, e a marca esta la uma vez =====
  if v_txt ~ ':[a-zA-Z_]' then
    raise exception 'o comentario tem placeholder :nome, que nao e sintaxe SQL valida fora do psql';
  end if;
  if v_txt not like '%with f as (%' or v_txt not like '%as explicado%' then
    raise exception 'o comentario nao tem a consulta de diagnostico executavel';
  end if;
  v_n := (length(v_txt) - length(replace(v_txt, v_marca, ''))) / length(v_marca);
  if v_n <> 1 then
    raise exception 'a marca % aparece % vezes no comentario (esperado exatamente 1): a varredura roda uma consulta por marca', v_marca, v_n;
  end if;

  -- ===== 6. A consulta e EXTRAIDA do comentario GRAVADO e executada =====
  -- Nao basta o texto conter as palavras: as quatro colunas que a conferencia le
  -- sao resolvidas contra o schema de verdade aqui, no ato. Esta base ja deixou
  -- passar consulta gravada que nao rodava (a que lia rh_adiantamentos.folha_id,
  -- dropada, quebrada em silencio por varias tarefas).
  v_q := substring(v_txt from 'with f as \(.*from partes;');
  if v_q is null then
    raise exception 'nao achei a consulta de diagnostico no comentario';
  end if;
  v_q := rtrim(btrim(v_q), ';');
  execute 'select count(*) from (select provisoes, explicado, consolidado_fecha, residuo from ('
          || v_q || ') x) y' into v_n;

  -- ===== 7. Os dois corpos nao mudaram =====
  -- fn_aprovar_folha: md5 de ANTES desta frente. Esta task e so de comentario, e o
  -- Bloco 8b inteiro nao toca o corpo dela.
  if md5((select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'fn_aprovar_folha'))
     <> 'a1261a1ccbff886980f0991da47a2446' then
    raise exception 'o corpo da fn_aprovar_folha mudou: esta migration e so de comentario';
  end if;

  -- fn_gerar_folha: md5 POS-PROVISAO, medido depois da migration 20260814160831
  -- (15840 chars). NAO e o 29c33b2d43a50af321f0ee2f7b7e5728 do plano, que e o de
  -- antes da Task 2. O texto acima AFIRMA que a provisao entra no custo_total sem
  -- gerar lancamento e que liquido negativo e inalcancavel: as duas garantias sao
  -- propriedade do corpo DELA. Garantia falsa em comentario e pior que comentario
  -- nenhum, porque quem confia nela para de checar.
  if md5((select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'fn_gerar_folha'))
     <> '0705f9c753f84e16f411ef4e35ec9b9c' then
    raise exception 'o corpo da fn_gerar_folha mudou: as garantias deste texto (provisao no custo_total, liquido nao negativo) precisam ser reconferidas';
  end if;

  -- ===== 8. A varredura das consultas gravadas continua limpa =====
  -- Ela roda `explain` em toda consulta marcada do banco: pega SQL que deixou de
  -- ser valido, e e cega para identidade semantica errada (foi por isso que ela
  -- NAO acusou o explicado = -valor_provisoes que esta migration conserta). Aqui
  -- ela vale como regressao de sintaxe, nao como aceite.
  select count(*), min(objeto || ' / ' || erro) into v_falhas, v_primeira
  from public.fn_verificar_diagnosticos_gravados();
  if v_falhas <> 0 then
    raise exception 'fn_verificar_diagnosticos_gravados() acusou % consulta(s) gravada(s); a primeira: %', v_falhas, v_primeira;
  end if;
end $$;
