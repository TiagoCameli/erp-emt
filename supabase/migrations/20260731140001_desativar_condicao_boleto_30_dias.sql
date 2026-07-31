-- Desativa a condicao de pagamento "Boleto 30 dias", a pedido do Tiago.
--
-- Desativacao e NAO exclusao, de proposito. condicoes_pagamento e referenciada
-- por quatro lugares: ordens_compra.condicao_pagamento_id,
-- cotacao_fornecedores.condicao_pagamento_id, lancamentos.condicao_pagamento_id e
-- condicao_parcelas.condicao_id (a divisao em parcelas da propria condicao).
-- Apagar a linha quebraria a referencia de qualquer documento que ja tivesse
-- escolhido essa condicao e levaria o historico junto, que e justamente o que
-- ninguem quer explicar depois.
--
-- Com ativo = false ela sai de TODOS os dropdowns sem mais nenhuma mudanca de
-- codigo: as consultas que alimentam os comboboxes (Compras > Ordens,
-- Compras > Cotacoes, Financeiro > Lancamentos, cadastro de condicoes) filtram
-- ativo = true. Ja a leitura do historico junta por id e nao filtra por ativo,
-- entao documento antigo continua mostrando "Boleto 30 dias" normalmente.
--
-- Conferido no banco antes de aplicar: hoje essa condicao nao e referenciada por
-- nenhuma ordem de compra (0), nenhuma cotacao (0) e nenhum lancamento (0). Vai
-- por desativacao mesmo assim, porque a diferenca entre "nao tem referencia hoje"
-- e "nunca vai ter" nao vale o risco de uma exclusao por elegancia.
--
-- Busca pela descricao exata: o id e dado, nao schema, e nao se fixa id gerado em
-- migration.
--
-- Mexe so na coluna ativo, igual ao que a tela de cadastro faria por
-- salvar_condicao (que tambem nao toca em updated_at nesta tabela). O trigger
-- trg_audit_condicoes_pagamento grava o antes e o depois no audit_log.
update public.condicoes_pagamento
set ativo = false
where descricao = 'Boleto 30 dias'
  and ativo;
