-- Uma ordem de compra gera no maximo UM lancamento.
--
-- O defeito: fn_rel_custo_por_grupo (painel de Gestao e Financeiro > Relatorios)
-- soma oc_itens ligando a OC ao lancamento por
-- `oc_itens oi on oi.ordem_compra_id = l.origem_id`. Se a mesma OC tiver dois
-- lancamentos, cada item entra uma vez POR LANCAMENTO e o custo do grupo dobra.
-- Vale igual para fn_rel_custo_por_subcategoria e fn_rel_custo_por_insumo, que
-- sao o drill-down do mesmo bloco.
--
-- Por que o conserto e aqui e nao na consulta: o lancamento duplicado tambem
-- duplica os rateios (fn_aprovar_ordem_compra grava um rateio por centro de
-- custo a cada aprovacao), entao dobram JUNTO o custo por centro de custo, a
-- serie por mes e o DRE. Medido: os quatro cortes vao de R$ 3.600,00 para
-- R$ 7.200,00. Deduplicar so o corte por grupo deixaria ele certo e os irmaos
-- dobrados, ou seja, criaria a contradicao que o painel promete nao ter. O
-- estado errado e "duas linhas em lancamentos para a mesma OC", e e ele que tem
-- de deixar de existir.
--
-- Por que da para acontecer hoje: sequencialmente o 1 para 1 se sustenta
-- (fn_aprovar_ordem_compra so insere com a OC em 'pendente_aprovacao', e
-- fn_desaprovar_ordem_compra apaga o lancamento antes de devolver a OC para
-- 'pendente_aprovacao'). O que nao se sustenta e que `authenticated` tem UPDATE
-- em ordens_compra e a policy ordens_compra_update nao trava a transicao de
-- status: quem tem compras.ordens:editar devolve a OC aprovada para
-- 'pendente_aprovacao' direto na tabela, pulando o fn_desaprovar que apagaria o
-- lancamento, e aprova de novo. Reproduzido com as RPCs reais em
-- supabase/provas/uma_oc_um_lancamento.sql.
--
-- Indice PARCIAL, so para origem = 'oc'. 'diaria' repete origem_id de proposito
-- (origem_id e o colaborador, um lancamento por competencia) e 'manual' nao usa
-- origem_id: um indice sem o filtro quebraria o fechamento de diarias.
--
-- Rollback: drop index public.uq_lancamentos_oc_origem_id;
create unique index if not exists uq_lancamentos_oc_origem_id
  on public.lancamentos (origem_id)
  where origem = 'oc' and origem_id is not null;

comment on index public.uq_lancamentos_oc_origem_id is
  'Uma OC gera no maximo um lancamento. Sem isso, custo por grupo, por centro de custo e por mes contam a mesma compra duas vezes.';
