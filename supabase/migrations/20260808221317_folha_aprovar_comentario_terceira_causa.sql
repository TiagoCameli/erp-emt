-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-08, versão
-- 20260808221317 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Onda única de correção do review amplo do Bloco 8a, Important 1:
-- SÓ COMENTÁRIO, nenhuma linha do corpo muda (a trava de md5 no fim garante).
--
-- A identidade de conferência tinha uma TERCEIRA pré-condição que nenhum texto
-- declarava, e ela dá falso sinal de bug exatamente no estado atual de produção.
--
-- `folha_parametros` está vazia em produção (zero linha, medido em 2026-08-08).
-- Nesse estado a folha aprova sem erro, mas `grupo_recolhimento_inss` e
-- `grupo_recolhimento_irrf` chegam nulos na `fn_aprovar_folha`, e as duas linhas
-- da fonte da guia que dependem deles (`where ... v_grupo_inss is not null` e
-- `v_grupo_irrf is not null`) não produzem nada: o INSS e o IRRF retidos do
-- trabalhador NÃO viram conta a pagar. O desconto continua no holerite e no
-- líquido; a guia que a empresa deve recolher não existe no Financeiro.
--
-- Efeito na auto-conferência, medido em transação com rollback no cenário de 5
-- colaboradores (2 adiantamentos, 4 encargos ativos sendo 1 sem grupo, 1 item
-- com líquido negativo, 1 colaborador sem centro de custo) e `folha_parametros`
-- vazia, que é o estado de produção:
--
--   consulta gravada hoje (2 causas):  residuo -4860.72  explicado -3649.31
--   consulta desta migration (3):      residuo -4860.72  explicado      0.00
--                                      retidos_sem_grupo 3649.31
--
-- E 3649.31 é exatamente `sum(inss) + sum(irrf)` dos itens (2062.10 + 1587.21).
-- Ou seja: o texto dizia "se `explicado` NÃO der 0.00, aí sim é bug", e a
-- ferramenta de diagnóstico ia acusar bug no primeiro dia de uso, onde só falta
-- configuração. Agora ela explica a diferença inteira.
--
-- Conferido nos quatro estados de configuração, todos com `explicado` = 0.00:
--
--   INSS e IRRF configurados .............. residuo -1211.41  retidos     0
--   só o INSS configurado (o parcial) ..... residuo -2798.62  retidos 1587.21
--   folha_parametros VAZIA (produção) ..... residuo -4860.72  retidos 3649.31
--
-- Decisões que este comentário registra e que NÃO mudam:
--
-- 1. A aprovação continua NÃO recusando por falta de configuração. "Config vazia
--    é deploy seguro" é premissa do bloco, e o dono do sistema pode querer a
--    folha só como custo gerencial por um tempo. O aviso é na tela do detalhe da
--    folha (`folha-detalhe.tsx`), sem bloquear.
-- 2. `data_vencimento` nulo com `folha_parametros` vazia segue aceitável e já
--    estava documentado.
--
-- Detalhe de leitura da consulta: a terceira causa é medida contra a
-- configuração ATUAL de `folha_parametros`, não contra um snapshot do momento da
-- aprovação (não existe snapshot do grupo do retido; só o do encargo patronal,
-- em `folha_item_encargos.grupo_recolhimento`). Isso está dito no texto: se
-- alguém configurar os grupos DEPOIS de aprovar, tem que desaprovar e reaprovar
-- para a folha e a consulta voltarem a casar.
comment on function public.fn_aprovar_folha(uuid) is
$c$Aprova a folha e gera as contas a pagar: um a_pagar por colaborador com o valor liquido (origem 'folha', origem_id = folha_itens.id) e um a_pagar por grupo de recolhimento com a guia (origem 'folha_guia', origem_id = folha_guias.id).

CONFERENCIA (para quem bate custo_total contra o contas a pagar):

  soma(liquidos) + soma(guias) + soma(adiantamentos) = folhas.custo_total

Essa igualdade fecha no centavo QUANDO, e somente quando, as tres condicoes valem:
  1. todo encargo ativo tem grupo_recolhimento preenchido;
  2. todo item da folha tem valor_liquido > 0; e
  3. folha_parametros (linha id = 1) existe e tem grupo_recolhimento_inss e grupo_recolhimento_irrf preenchidos.

Quando uma das tres nao vale, a diferenca NAO e arredondamento: ela e explicada no centavo pelas tres causas. Chamando

  residuo = soma(liquidos) + soma(guias) + soma(adiantamentos) - folhas.custo_total

vale sempre, em folha aprovada:

  residuo + soma(encargos sem grupo) + soma(valor_liquido <= 0) + soma(retidos sem grupo) = 0

A segunda soma e negativa (sao liquidos negativos), por isso entra somando. Nao precisa raciocinar sinal: a consulta abaixo devolve os dois lados e ja faz essa conta na coluna "explicado", que tem que dar 0.00 sempre. Se "explicado" NAO der 0.00, ai sim e bug e deve ser reportado.

As tres causas sao comportamento desejado, nao erro:

  - Encargo ativo sem grupo_recolhimento e PROVISAO: entra no custo do empregador (folhas.custo_total) e de proposito nao gera guia, porque nao existe para onde recolher. E o desenho que 13o e ferias usam.
  - Item com valor_liquido <= 0 nao gera lancamento: o adiantamento do mes ja consumiu o salario, e lancamento de R$ 0 ou negativo e impossivel (lancamentos tem check valor >= 0). O colaborador segue na folha, com o liquido negativo visivel no item.
  - Retido sem grupo de recolhimento: quando folha_parametros nao tem linha (o estado de producao em 08/08/2026) ou quando grupo_recolhimento_inss / grupo_recolhimento_irrf estao nulos, o INSS e o IRRF descontados do trabalhador NAO viram conta a pagar. O desconto continua no holerite e no liquido, mas a guia que a empresa precisa recolher nao aparece no Financeiro, e o residuo fica negativo exatamente nesse valor. Nao e bug: e configuracao que falta, e a aprovacao NAO recusa por isso de proposito (config vazia e deploy seguro, e a folha pode servir so como custo gerencial). Para o valor virar guia, preencha os dois grupos em RH > Parametros da Folha (rota /rh/parametros-folha) e depois desaprove e reaprove a folha, que a desaprovacao apaga os lancamentos e a aprovacao recria. A tela do detalhe da folha avisa disso sem bloquear.

ATENCAO na leitura da terceira causa: ela e medida contra a configuracao ATUAL de folha_parametros, nao contra um snapshot do momento da aprovacao (existe snapshot do grupo do encargo patronal, em folha_item_encargos.grupo_recolhimento, mas nao do grupo do retido). Se os grupos foram configurados DEPOIS de a folha ser aprovada, a consulta vai medir retidos_sem_grupo = 0 e o residuo antigo continua la: desaprove e reaprove antes de concluir que e bug.

DIAGNOSTICO, copy-paste-and-run no MCP execute_sql ou no editor SQL do Supabase. Troque SO a data da segunda linha pela competencia da folha (sempre o dia 1 do mes). Zero linha na resposta = nao existe folha nessa competencia:

  with f as (
    select id, custo_total from public.folhas where competencia = '2026-08-01'
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
      coalesce((select sum(valor) from public.rh_adiantamentos
                 where folha_id = f.id), 0)                               as adiantamentos,
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
                   and (select grupo_irrf from p) is null), 0)             as retidos_sem_grupo
    from f
  )
  select liquidos, guias, adiantamentos, custo_total,
         liquidos + guias + adiantamentos - custo_total                    as residuo,
         encargos_sem_grupo, liquidos_nao_positivos, retidos_sem_grupo,
         (liquidos + guias + adiantamentos - custo_total)
           + encargos_sem_grupo + liquidos_nao_positivos
           + retidos_sem_grupo                                             as explicado
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

  -- A terceira pre-condicao tem que estar declarada junto das outras duas, com o
  -- que fazer (a rota da tela), e a terceira causa tem que estar na consulta.
  if v_txt not like '%as tres condicoes valem%' then
    raise exception 'o comentario nao declara a TERCEIRA pre-condicao da identidade';
  end if;
  if v_txt not like '%retidos_sem_grupo%' then
    raise exception 'a consulta de diagnostico nao tem a terceira causa (retido sem grupo)';
  end if;
  if v_txt not like '%/rh/parametros-folha%' then
    raise exception 'o comentario nao diz onde configurar o grupo de recolhimento dos retidos';
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
  -- falha se o que ficou gravado nao rodar. Antes essa prova era manual, rodada
  -- depois de aplicar (ver rodape da 20260808174840).
  v_q := substring(v_txt from 'with f as \(.*from partes;');
  if v_q is null then
    raise exception 'nao achei a consulta de diagnostico no comentario';
  end if;
  v_q := rtrim(btrim(v_q), ';');
  execute 'select count(*) from (' || v_q || ') x' into v_n;

  -- O corpo nao pode ter mudado: md5 da versao aplicada na 20260808165314.
  if md5((select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'fn_aprovar_folha'))
     <> 'a1261a1ccbff886980f0991da47a2446' then
    raise exception 'o corpo da fn_aprovar_folha mudou: esta migration e so de comentario';
  end if;
end $$;

-- Rollback: reaplicar o texto da 20260808174840 (com duas causas em vez de tres), ou
--   comment on function public.fn_aprovar_folha(uuid) is null;
