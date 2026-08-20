-- Fecha as tres funcoes que o advisor de seguranca aponta como executaveis pelo
-- role `anon` (anon_security_definer_function_executable), achadas rodando os
-- advisors depois das migrations de formas da OC.
--
-- Por que acontece: no Postgres, funcao nova ja vem com EXECUTE para PUBLIC. So
-- `grant execute ... to authenticated` nao fecha nada -- quem fecha e o
-- `revoke ... from public`. Nas tres o revoke faltou, e o ACL mostra isso:
-- `=X/postgres` e justamente o PUBLIC podendo executar.
--
-- fn_definir_parcelas_lancamento(uuid, jsonb, text): a versao de 2 argumentos
-- tinha o revoke (20260728180001); a de 3, criada em 19/08 junto com o motivo
-- obrigatorio, nasceu sem ele. Exploracao real e limitada -- dentro dela
-- `tem_permissao` com auth.uid() nulo recusa --, mas SECURITY DEFINER que mexe em
-- parcela de dinheiro nao fica aberto para anonimo por causa de um default.
--
-- fn_audit_senha_provisoria e fn_total_oc_cabecalho sao funcoes de TRIGGER: nao
-- precisam de EXECUTE para ninguem (o trigger as chama pelo dono da tabela), e
-- revogar do public nao afeta trigger nenhum.

revoke all on function public.fn_definir_parcelas_lancamento(uuid, jsonb, text) from public;
revoke all on function public.fn_definir_parcelas_lancamento(uuid, jsonb, text) from anon;
grant execute on function public.fn_definir_parcelas_lancamento(uuid, jsonb, text) to authenticated;

revoke all on function public.fn_audit_senha_provisoria() from public;
revoke all on function public.fn_audit_senha_provisoria() from anon;

revoke all on function public.fn_total_oc_cabecalho() from public;
revoke all on function public.fn_total_oc_cabecalho() from anon;
