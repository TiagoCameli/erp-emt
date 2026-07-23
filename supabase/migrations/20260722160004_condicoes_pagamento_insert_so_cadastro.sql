-- Fecha o buraco achado no review final da feat-condicoes-vencimento:
-- a policy de INSERT de condicoes_pagamento ainda liberava quem cria/edita
-- OC ou cotação (compras.ordens / compras.cotacoes) a inserir uma condição
-- de pagamento DIRETO ali, sem parcela nenhuma (era o caminho do módulo
-- órfão src/modules/compras/condicoes-pagamento, removido nesta mesma
-- leva). Isso deixava passar uma condição "vazia" que só quebra depois,
-- no recebimento da OC, quando ele tenta gerar as parcelas do a_pagar
-- a partir da condição (condicao_parcelas vazia).
--
-- Hoje a OC e a cotação só SELECIONAM uma condição já cadastrada (ver
-- migrations 20260722150001+ e caa2ba4/d55fdb3 no histórico); quem cria
-- condição de pagamento de verdade é exclusivamente a tela de cadastro
-- (recurso cadastros.condicoes-pagamento, módulo
-- src/modules/cadastros/condicoes-pagamento), que sempre grava as
-- parcelas junto (condicao_parcelas). Não há mais motivo pra
-- compras.ordens/compras.cotacoes autorizarem INSERT nesta tabela.
--
-- Checado no banco vivo antes desta migration (MCP execute_sql,
-- 2026-07-22): policy condicoes_pagamento_insert com with_check
--   tem_permissao('compras.ordens','criar') OR tem_permissao('compras.ordens','editar')
--   OR tem_permissao('compras.cotacoes','criar') OR tem_permissao('compras.cotacoes','editar')
--   OR tem_permissao('cadastros.condicoes-pagamento','criar')
-- O SELECT (policy condicoes_pagamento_select) continua liberado pros
-- três recursos (compras.ordens/compras.cotacoes/cadastros.condicoes-pagamento)
-- de propósito: OC e cotação precisam listar as condições ativas no
-- Combobox, só não podem mais criar uma nova por ali. Não mexemos nela.
--
-- Rollback (reabre o buraco, não usar exceto pra reverter esta migration):
--   drop policy if exists condicoes_pagamento_insert on public.condicoes_pagamento;
--   create policy condicoes_pagamento_insert on public.condicoes_pagamento
--     for insert to authenticated
--     with check (
--       (select public.tem_permissao('compras.ordens', 'criar'))
--       or (select public.tem_permissao('compras.ordens', 'editar'))
--       or (select public.tem_permissao('compras.cotacoes', 'criar'))
--       or (select public.tem_permissao('compras.cotacoes', 'editar'))
--       or (select public.tem_permissao('cadastros.condicoes-pagamento', 'criar'))
--     );

drop policy if exists condicoes_pagamento_insert on public.condicoes_pagamento;

create policy condicoes_pagamento_insert on public.condicoes_pagamento
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.condicoes-pagamento', 'criar')));
