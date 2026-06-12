-- =============================================================
-- Fase 0 / Migration 7: grants de tabela pro papel authenticated
-- As tabelas nasceram sem GRANT (o caminho de criacao nao herdou
-- os default privileges), entao o Postgres negava ANTES do RLS
-- avaliar: "permission denied for table usuarios" em todo select.
-- Regra daqui pra frente: toda migration que cria tabela declara
-- os grants explicitamente, so do que as policies permitem.
-- anon nao recebe nada em nenhuma tabela.
-- =============================================================

-- usuarios: select/insert/update (sem delete: usuario se desativa)
grant select, insert, update on table public.usuarios to authenticated;

-- perfis: crud completo coberto por policies
grant select, insert, update, delete on table public.perfis to authenticated;

-- perfil_permissoes: matriz e delete+insert (sem update)
grant select, insert, delete on table public.perfil_permissoes to authenticated;

-- usuario_permissoes: matriz e delete+insert (sem update)
grant select, insert, delete on table public.usuario_permissoes to authenticated;

-- configuracoes: leitura geral, escrita por permissao
grant select, insert, update on table public.configuracoes to authenticated;

-- audit_log: somente leitura (a escrita e via trigger definer)
grant select on table public.audit_log to authenticated;

-- lixeira: somente leitura (escrita via funcoes definer dos modulos)
grant select on table public.lixeira to authenticated;

-- documento_sequencias: nenhum grant (acesso so pela funcao definer)
