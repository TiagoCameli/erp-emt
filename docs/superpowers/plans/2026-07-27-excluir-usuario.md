# Excluir usuário (soft delete) — Implementation Plan

**Goal:** Excluir um usuário: some da lista de usuários e perde acesso, mas o registro fica no banco para o nome continuar aparecendo nas ações/auditoria que ele fez.

**Architecture:** Soft delete. Colunas `excluido_em`/`excluido_por` em `usuarios`. RPC `fn_excluir_usuario` (SECURITY DEFINER) checa permissão `excluir`, trava auto-exclusão, marca as colunas, `ativo=false` e apaga a senha provisória. Server action também bane na auth (bloqueia login). Lista filtra `excluido_em is null`. `nomes_usuarios_auditoria` resolve o nome pelo id sem filtrar por ativo/excluído, então o histórico permanece.

**Decisões:** Sem restaurar na tela (soft delete one-way pela UI). Não pode excluir a si mesmo. Registro nunca é apagado de verdade (auditoria + FKs de outras tabelas dependem dele).

**Onde:** branch `feat-admin-usuario-senha-provisoria` (mesmo PR #14).

## Global Constraints

- Projeto Supabase `vsesgvqjgqpapoxhnbqx`, migration via MCP `apply_migration`.
- Permissão tripla: RPC checa `excluir` (RLS/DB), action checa `excluir`, UI só mostra o botão com `excluir`.
- `tsc`, lint, build e vitest passando. Sem `any` novo, sem `console.log`.
- iCloud dup: limpar `.next/*[ ]N.ts(x)` antes do tsc.

---

### Task D1: Migration (colunas + fn_excluir_usuario) + types

- Migration `supabase/migrations/20260727150002_excluir_usuario.sql`: adiciona `excluido_em timestamptz`, `excluido_por uuid references usuarios(id)`, índice em `excluido_em`; cria `fn_excluir_usuario(p_id uuid)` SECURITY DEFINER (checa `excluir`, trava auto-exclusão, seta `excluido_em`/`excluido_por`/`ativo=false`, apaga `usuario_senha_provisoria`). Grant execute a `authenticated`, revoke de `public`/`anon`.
- Aplicar via MCP. Rodar advisors (security). Corrigir apontamento na tabela/coluna nova.
- Atualizar `src/lib/database.types.ts` à mão: colunas em `usuarios` (Row/Insert/Update), relationship `usuarios_excluido_por_fkey`, e `fn_excluir_usuario` em Functions.
- Commit.

### Task D2: Action + query

- `excluirUsuario(id)` em `actions.ts`: `getUsuarioLogado` + `temPermissao(excluir)` + trava auto-exclusão; `rpc("fn_excluir_usuario")`; `admin.auth.admin.updateUserById(id, { ban_duration: "87600h" })`; `revalidatePath`.
- `listarUsuarios` em `queries.ts`: `.is("excluido_em", null)`.
- Typecheck. Commit.

### Task D3: UI

- `page.tsx`: `podeExcluir = temPermissao(usuario, "administracao.usuarios", "excluir")`, passar a `UsuariosTabela`.
- `usuarios-tabela.tsx`: aceitar `podeExcluir`, repassar ao `DetalheUsuarioDrawer`.
- `detalhe-usuario-drawer.tsx`: prop `podeExcluir`; botão vermelho "Excluir usuário" + `ConfirmDialog` variante destrutivo; on success fecha o drawer.
- Typecheck + lint + build. Commit.

### Task D4: Verificação + push

- `tsc`, `eslint`, `vitest`, `build`. Runbook manual: excluir usuário some da lista; login bloqueado; nome continua na auditoria; não deixa excluir a si mesmo. Push (atualiza PR #14).
