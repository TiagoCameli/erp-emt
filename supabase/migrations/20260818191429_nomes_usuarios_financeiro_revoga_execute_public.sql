-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-18, versão
-- 20260818191429 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- CREATE FUNCTION concede EXECUTE a PUBLIC por padrão. As duas funções irmãs
-- (nomes_usuarios_auditoria, nomes_usuarios_compras) não têm esse grant;
-- nomes_usuarios_financeiro tinha até aqui. Revoga para o proacl bater com
-- as irmãs: {postgres=X, authenticated=X}, sem PUBLIC.
revoke execute on function public.nomes_usuarios_financeiro(uuid[]) from public;
