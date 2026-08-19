-- =============================================================
-- Grafia correta no restante do dado semeado
--
-- Varredura em paralelo do app (6 agentes) achou que as STRINGS DE
-- INTERFACE estao corretas: src/components/ e src/modules/rh/
-- voltaram zero achado. O que nasceu sem acento foi o DADO semeado
-- nas migrations, que aparece na tela como nome de registro.
--
-- As migrations antigas NAO sao editadas: estao aplicadas e sao
-- historico. A correcao e do dado, aqui.
--
-- O update casa pelo valor ANTIGO exato, de proposito: se o Tiago ja
-- renomeou algum desses a mao, nao sobrescrevemos a escolha dele.
-- Por isso tambem e idempotente (rodar de novo nao acha nada).
--
-- Compatibilidade conferida antes de renomear:
--   categorias_financeiras -> a importacao BR-364 casa por
--     fn_chave_nome (sem acento), logo planilha antiga continua
--     casando. Confirmado na 20260804140000, linha 453.
--   unidades_medida -> a importacao de insumos casa por SIGLA, nao
--     por nome (insumos/actions.ts, linha 309). Sigla intacta.
--   formas_pagamento -> nome so e lido para exibir (joins em
--     compras/ordens e financeiro/aprovacao-pagamentos). Catalogo
--     livre, nome nao e chave.
-- =============================================================

-- Plano de contas (aparece em todo lancamento e no BI)
update public.categorias_financeiras set nome = 'Medições de obra'
  where nome = 'Medicoes de obra';
update public.categorias_financeiras set nome = 'Materiais de construção'
  where nome = 'Materiais de construcao';
update public.categorias_financeiras set nome = 'Combustíveis e lubrificantes'
  where nome = 'Combustiveis e lubrificantes';
update public.categorias_financeiras set nome = 'Manutenção de equipamentos'
  where nome = 'Manutencao de equipamentos';
update public.categorias_financeiras set nome = 'Serviços e fretes'
  where nome = 'Servicos e fretes';
update public.categorias_financeiras set nome = 'Escritório e administrativo'
  where nome = 'Escritorio e administrativo';

-- Unidades de medida (aparecem em insumo, item de OC e medicao)
update public.unidades_medida set nome = 'Metro cúbico'
  where nome = 'Metro cubico';
update public.unidades_medida set nome = 'Quilômetro'
  where nome = 'Quilometro';

-- Formas de pagamento (aparecem na OC e na fila de pagamento)
update public.formas_pagamento set nome = 'Transferência'
  where nome = 'Transferencia';
update public.formas_pagamento set nome = 'Cartão'
  where nome = 'Cartao';
