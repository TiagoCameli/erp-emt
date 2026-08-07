-- Rollback de 20260807150000_auditoria_folha_encargos_formas_pagamento_senha_provisoria.
--
-- LEIA ANTES DE RODAR: isto DESLIGA trilha de auditoria e viola a regra de ouro 6
-- do CLAUDE.md. Depois de rodar, alterar um encargo de folha, mudar o tipo de uma
-- forma de pagamento (que decide se o dinheiro sai direto ou passa pela fila de
-- autorização) ou gerar/apagar senha provisória volta a não deixar rastro nenhum.
--
-- Só faz sentido se algum trigger estiver quebrando uma operação legítima. Nesse
-- caso derrube SÓ o trigger culpado, não os três.

drop trigger if exists trg_audit_folha_item_encargos on public.folha_item_encargos;
drop trigger if exists trg_audit_formas_pagamento on public.formas_pagamento;
drop trigger if exists trg_audit_usuario_senha_provisoria on public.usuario_senha_provisoria;
drop function if exists public.fn_audit_senha_provisoria();

-- ATENÇÃO ao recriar: usuario_senha_provisoria NÃO pode usar a fn_audit padrão.
-- Ela grava `to_jsonb(new)` inteiro e a coluna `senha` é texto em claro — a senha
-- iria parar no audit_log, que tem outros leitores e é permanente. Use sempre uma
-- função que faça `to_jsonb(new) - 'senha'`.
