# Registro de decisões - ERP-EMT

Decisões estruturais tomadas durante a construção. Formato: data, contexto, decisão, consequência.

---

## 2026-06-11 - Next.js 16 em vez de 15

**Contexto:** O plano mestre cita Next.js 15 (era a versão estável quando o plano foi escrito). Ao iniciar o projeto, a versão estável corrente do create-next-app é a 16.2.x, com App Router idêntico e suporte ativo.

**Decisão:** Partir direto do Next.js 16.2.9. Evita migração futura e mantém o projeto na linha de suporte mais longa.

**Consequência:** Nenhuma mudança de arquitetura. Server Components, Server Actions e App Router seguem como no plano.

## 2026-06-11 - Projeto Supabase já criado pelo Tiago

**Contexto:** Projeto `erp-emt` (ref `vsesgvqjgqpapoxhnbqx`, região sa-east-1, Postgres 17) criado manualmente no dashboard em 11/06/2026, org EMT Construtora.

**Decisão:** Usar esse projeto como ambiente de produção da Fase 0. Migrations versionadas em `supabase/migrations/` e aplicadas via MCP/CLI, nunca pelo dashboard.

**Consequência:** O ref do projeto fica registrado em `supabase/config.toml` e nos env vars. Chave service role só em variável de ambiente do servidor.

## 2026-06-12 - Decisões da revisão adversarial da Fase 0

**Bootstrap do primeiro usuário como Admin.** O primeiro usuário criado em auth.users recebe a matriz completa do perfil Admin via trigger. Sem trava de identidade por decisão: sistema single-tenant, o projeto Supabase nasce vazio e o primeiro login é do dono. A janela de risco é zero na prática (o convite público não existe; só o service role cria usuários).

**Permissão administracao.usuarios editar equivale a root.** Quem edita a matriz de qualquer usuário consegue se dar qualquer permissão. É o desenho do sistema (matriz administrada por admins). Mitigação: a trava de auto-lockout impede remover a própria permissão de editar usuários, e toda mudança de matriz fica no audit_log com antes/depois.

**Desativar usuário = ativo false + ban na auth.** O RLS e o getUsuarioLogado cortam o acesso na request seguinte; o ban (876000h) impede login novo e renovação de sessão. Token de acesso já emitido vale por no máximo 1h, sempre filtrado pelo ativo nas policies.

**Template de email do convite.** O fluxo /auth/confirm aceita token_hash+type (template customizado, recomendado pela doc do @supabase/ssr) E code (template padrão do Supabase, PKCE). Com o template padrão funciona sem customização; quando o SMTP próprio for configurado, customizar o template de convite para {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite é o caminho mais robusto.

**Matriz e permissões de perfil em RPC transacional.** salvar_matriz_usuario e salvar_permissoes_perfil fazem delete+insert numa transação só no Postgres. O padrão de duas requests do PostgREST podia deixar o usuário sem permissão nenhuma se o insert falhasse.

**Numeração de documentos sem RPC direto.** proximo_numero_documento não é mais executável por authenticated via API. Os módulos das próximas fases chamam por dentro das próprias funções security definer.

## 2026-06-12 - Grants explícitos em toda migration

**Contexto:** As tabelas criadas pelas migrations da Fase 0 nasceram sem GRANT pro papel authenticated (o caminho de criação via management API não herdou os default privileges do projeto). Resultado: o Postgres negava todo acesso com "permission denied" antes mesmo do RLS avaliar, e o app mostrava "Conta desativada" pra qualquer usuário.

**Decisão:** Toda migration que cria tabela declara os grants explicitamente (migration 7 corrigiu as existentes). Só se concede o que as policies permitem: tabela sem policy de DELETE não recebe grant de DELETE. anon não recebe nada. Tabelas de acesso exclusivo por função (documento_sequencias) não recebem grant nenhum.

**Consequência:** Camada dupla: o grant define o teto, o RLS decide linha a linha. Verificado com simulação de JWT: usuário sem permissão não vê nenhuma linha e não muta nada; admin enxerga o que a matriz autoriza.
