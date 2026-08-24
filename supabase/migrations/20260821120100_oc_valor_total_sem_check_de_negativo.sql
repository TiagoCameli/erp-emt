-- Tira o CHECK `valor_total >= 0` criado minutos antes na migration
-- 20260821120000. Ele parecia uma boa ultima linha de defesa e na verdade
-- QUEBRA a edicao de qualquer OC com desconto.
--
-- O motivo: `valor_total` e calculado por trigger, e existe um estado
-- intermediario legitimo em que ele fica negativo. A action de editar troca os
-- itens apagando todos e inserindo os novos; no instante entre o delete e o
-- insert a ordem tem ZERO itens, e a trigger recalcula
--
--   0 (sem itens) + frete + outras + impostos - desconto
--
-- que e negativo sempre que ha desconto. O mesmo vale para qualquer caminho que
-- grave o cabecalho antes dos itens -- e foi assim que o CHECK apareceu: a
-- primeira prova em transacao desfeita estourou nele antes de chegar no que
-- queria provar.
--
-- Quem impede desconto maior que a ordem passa a ser a aplicacao: o schema Zod
-- recusa no formulario e na Server Action, com mensagem em portugues. O CHECK de
-- ajuste NAO-NEGATIVO continua, porque esse nao tem estado intermediario: um
-- desconto negativo nunca e legitimo em momento nenhum.

alter table public.ordens_compra
  drop constraint if exists ordens_compra_valor_total_nao_negativo;
