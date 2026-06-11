-- Fase 0 / Migration 5: higiene de permissao de funcao
-- rls_auto_enable() e um event trigger da plataforma (liga RLS em
-- tabela nova). Nao deve ser executavel via RPC por nenhum papel.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
