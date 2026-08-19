-- =============================================================
-- Grafia correta no dado que nao veio de seed
--
-- Os agentes varreram o CODIGO. Conferindo o banco vivo depois,
-- sobraram erros de grafia em linhas que nao estao em nenhuma
-- migration: foram cadastradas depois, pela tela ou pela importacao.
-- Varredura de codigo nao acha isso, so olhar o dado acha.
--
-- Tudo aqui e nome exibido, nao chave:
--   unidades_medida  -> a importacao de insumos casa por SIGLA
--                       (insumos/actions.ts), e a sigla nao muda.
--   formas_pagamento -> nome so e lido para exibir.
--
-- Casa pelo valor antigo exato: se o Tiago tiver renomeado algo a
-- mao, nao sobrescrevemos. Idempotente.
-- =============================================================

update public.unidades_medida set nome = 'Centímetro' where nome = 'Centimetro';
update public.unidades_medida set nome = 'Mês' where nome = 'Mes';
update public.unidades_medida set nome = 'Tonelada-quilômetro'
  where nome = 'Tonelada-quilometro';

update public.formas_pagamento set nome = 'Cartão de Crédito'
  where nome = 'Cartão de Credito';
