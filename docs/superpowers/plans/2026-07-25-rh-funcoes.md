# Tabela de salário por função (#11) — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, tarefa a tarefa. Passos usam checkbox (`- [ ]`).

**Goal:** Cadastro de funções (nome, salário base, CBO, ativo) + ligar `colaboradores.funcao` (texto) à função por FK, sugerir o salário ao escolher a função, e mover o CBO pra função. Sem inventar regra fiscal.

**Architecture:** Tabela nova `funcoes` (padrão de cadastro: RLS/grants/auditoria/soft delete/import) + recurso `cadastros.funcoes`. Expand-contract em `colaboradores`: adiciona `funcao_id` FK + backfill do texto; código migra pra `funcao_id` (queries fazem join e seguem entregando o nome pro display); no fim dropa `funcao` texto e `cbo`. Migrations via MCP no projeto vivo `vsesgvqjgqpapoxhnbqx`, lendo o cadastro-modelo vivo antes.

**Tech Stack:** Next.js 16 (TS strict), Supabase (RLS) via MCP, RHF+Zod, Vitest, canônicos (DataTable/FormDrawer/Combobox/ImportDialog/MoneyText/SecaoDetalhe). Branch: `feat-rh-funcoes`.

Spec: `docs/superpowers/specs/2026-07-25-rh-funcoes-design.md`.

## Global Constraints
- **Expand-contract**: NÃO dropar `colaboradores.funcao` nem `colaboradores.cbo` enquanto o código ainda os usa. Drop só na Task 4, depois que tudo migrou pra `funcao_id` e o CBO vem da função.
- RLS 100% + grants explícitos (anon sem DML); permissão tripla (`cadastros.funcoes` no banco/action/UI). Auditoria universal + soft delete no padrão dos cadastros. Todo cadastro tem importação por planilha.
- Não inventar regra fiscal: salário base é referência editável; sugere ao TROCAR a função, não sobrescreve no load.
- Dinheiro NUMERIC(14,2) com MoneyText/tabular-nums; Combobox canônico em todo select; toda rota nova tem `loading.tsx`. Ambiente: limpar `.next` dup antes do typecheck.
- Portão por tarefa: typecheck/lint/build verdes; testes existentes verdes; sem any novo, sem console.log. Commit termina com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 1: DB — tabela `funcoes` + recurso/seed + `funcao_id` FK + backfill (expand)

**Files:** Create `supabase/migrations/<ts>_funcoes.sql`, `supabase/migrations/<ts>_colaborador_funcao_id.sql`, `supabase/migrations/<ts>_perm_funcoes.sql`; Modify `src/config/recursos.ts`, `src/lib/database.types.ts` (regen).

**Interfaces:**
- Produces: tabela `funcoes` (id, nome, salario_base, cbo, ativo, timestamps); `colaboradores.funcao_id uuid` FK→funcoes; recurso `cadastros.funcoes`.

- [ ] **Step 1: Ler o cadastro-modelo vivo** (MCP execute_sql) — escolher um cadastro simples de tabela única (ex.: `unidades` OU `categorias`) e ler: policies (`pg_policies where tablename='unidades'`), grants (`information_schema.role_table_grants`), triggers (`pg_trigger` — auditoria/created_by/updated_at), e como o soft delete funciona (a tabela tem coluna de soft delete? ou usa `fn_excluir_cadastro(p_tabela,...)`/lixeira? confirmar). Ler também como `cadastros.unidades` está semeada em `perfil_permissoes`/`usuario_permissoes`.

- [ ] **Step 2: Migration `funcoes`** — criar `public.funcoes` (id uuid pk default gen_random_uuid(); nome text not null unique; salario_base numeric(14,2); cbo text; ativo boolean not null default true; created_at/updated_at/created_by no padrão do modelo). RLS on; 4 policies por `cadastros.funcoes` (ver/criar/editar/excluir) espelhando o modelo; grants explícitos ao authenticated (sem DML pro anon); triggers de auditoria/created_by/updated_at iguais ao modelo; soft delete no MESMO mecanismo do modelo (se for lixeira via `fn_excluir_cadastro`, garantir que `funcoes` é aceita por ela; se for coluna, adicionar). Aplicar via `apply_migration`; rollback = drop table.

- [ ] **Step 3: Recurso + seed** — em `config/recursos.ts`, adicionar `{ id: "cadastros.funcoes", nome: "Funções", modulo: "cadastros", rota: "/cadastros/funcoes", acoes: CRUD }` (posição coerente no bloco de cadastros). Migration `_perm_funcoes.sql`: semear `cadastros.funcoes` (todas as ações) nos MESMOS perfis que têm `cadastros.unidades`, sincronizando `usuario_permissoes`. Idempotente `on conflict do nothing`; rollback documentado. Aplicar; verificar contagens batendo com o cadastro-modelo.

- [ ] **Step 4: `funcao_id` + backfill (expand)** — migration `_colaborador_funcao_id.sql`: `alter table public.colaboradores add column funcao_id uuid references public.funcoes(id);`. Backfill: `insert into funcoes(nome) select distinct funcao from colaboradores where funcao is not null and funcao <> '' on conflict (nome) do nothing;` depois `update colaboradores c set funcao_id = f.id from funcoes f where f.nome = c.funcao and c.funcao_id is null;`. **NÃO dropar `funcao` nem `cbo`** (contract é Task 4). Aplicar; `get_advisors` (security) e confirmar que `funcoes` NÃO fica em `rls_enabled_no_policy`. Verificar: colaborador de teste ficou com `funcao_id` setado.

- [ ] **Step 5: Regen tipos + portão** — `generate_typescript_types` → atualizar `database.types.ts`. Limpar `.next` dup; `typecheck` (pode haver erro se algo tipar em cima da coluna — resolver só o mínimo; a migração de código é Task 3). `recursos.test.ts` verde. Commit: `feat(db): tabela funcoes + funcao_id em colaboradores`.

---

## Task 2: Cadastro de funções — backend + aba

**Files:** Create `src/modules/cadastros/funcoes/{schemas,queries,actions,importacao}.ts` (+ testes), `src/app/(app)/cadastros/funcoes/{page,loading}.tsx`, `src/modules/cadastros/funcoes/components/{funcoes-tabela,funcao-form-drawer}.tsx`.

**Interfaces:**
- Consumes: tabela `funcoes` + recurso `cadastros.funcoes` (Task 1).
- Produces: `listarFuncoes()` (todas, p/ a aba), `listarFuncoesAtivas()` (id, nome, salarioBase, cbo — p/ o Combobox do colaborador na Task 3), `salvarFuncao`/`removerFuncao` (gated `cadastros.funcoes`), `funcaoSchema`.

- [ ] **Step 1: Ler** um cadastro simples existente ponta a ponta (ex.: `cadastros/unidades` ou `categorias`): `{schemas,queries,actions,importacao}.ts` + a aba (`page.tsx`, tabela, form-drawer, import). Copiar o padrão (permissão, soft delete/lixeira, import).

- [ ] **Step 2: Zod (falha primeiro)** — `funcaoSchema`: `nome` obrigatório (min 2); `salarioBase` dinheiro opcional 2 casas (reusar o validador de dinheiro do projeto, ex. o `dinheiroOpcionalSchema` de colaboradores); `cbo` texto opcional; `ativo` boolean default true. Teste Vitest (nome vazio falha; salário 3 casas falha; salário vazio = null; ativo default). Rodar → FAIL → implementar → PASS.

- [ ] **Step 3: queries/actions/import** — `listarFuncoes()` e `listarFuncoesAtivas()` (server-only); `salvarFuncao` (criar/editar, `exigirPermissao("cadastros.funcoes", id?"editar":"criar")`), `removerFuncao` (soft delete no padrão do modelo, `exigirPermissao(...,"excluir")`); `importacao.ts` no padrão do cadastro-modelo (modelo p/ download, validação linha a linha, prévia, confirmação, log). Espelhar retorno/erro (ResultadoAcao).

- [ ] **Step 4: Aba** — `page.tsx` (checa `cadastros.funcoes` ver; `listarFuncoes`) + `loading.tsx` (SkeletonPagina). `funcoes-tabela.tsx` (`DataTable`: nome, salário base `MoneyText`, CBO, ativo/StatusBadge; ações editar/excluir gated). `funcao-form-drawer.tsx` (`FormDrawer` canônico: nome, salarioBase, cbo, ativo). `ImportDialog`. Combobox onde houver select.

- [ ] **Step 5: Portão + commit** — `typecheck/lint/test/build`. Commit: `feat(cadastros): aba e cadastro de funções`.

---

## Task 3: Integração no colaborador — funcao_id + salário sugerido + CBO da função

**Files:** Modify `src/modules/cadastros/colaboradores/{schemas,queries,actions,importacao,ficha}.ts`, `components/{colaboradores-form-drawer,colaboradores-tabela,ficha-colaborador}.tsx`; Modify as queries de RH que expõem colaborador: `src/modules/rh/_shared/queries.ts`, `rh/folha/queries.ts`, `rh/apontamentos/queries.ts` (e qualquer outra que leia `colaboradores.funcao`/`cbo` — grep antes). Create `src/modules/cadastros/colaboradores/funcao-salario.ts` (+ teste) p/ a lógica pura de sugerir salário.

**Interfaces:**
- Consumes: `listarFuncoesAtivas()` (Task 2); `funcao_id` (Task 1).
- Produces: `salarioSugerido(funcaoAtual, funcaoNova, funcoes): number | null` (pura) — devolve o salarioBase da função nova quando o usuário TROCA a função; null quando não deve sugerir.

- [ ] **Step 1: Mapear TODOS os usos** — `grep -rn "\.funcao\b|colaboradores.*funcao|\.cbo\b" src/` pra achar todo lugar que lê `colaboradores.funcao`/`cbo` (queries e componentes). Listar no relatório. Ler `funcao-salario` não existe ainda; ler as queries de colaborador e de RH.

- [ ] **Step 2: Schema + lógica pura (falha primeiro)** — em `colaboradores/schemas.ts`: trocar `funcao: textoOpcional` por `funcaoId: z.uuid().nullable()`; remover `cbo`. `funcao-salario.ts`: `salarioSugerido(...)` puro. Teste Vitest: trocar função → sugere o salarioBase da nova; mesma função (load) → null; função sem salarioBase → null. Rodar → FAIL → implementar → PASS.

- [ ] **Step 3: Queries/actions/ficha do colaborador** — `queries.ts`/`ficha.ts`: SELECT com join `funcoes(nome, cbo, salario_base)`; expor `funcao` (= funcoes.nome, pro display atual continuar), `funcaoId`, `cbo` (= funcoes.cbo, derivado), e `funcaoSalarioBase`. `actions.ts` (`paraLinhaBanco`): gravar `funcao_id` (não mais `funcao`/`cbo`). `importacao.ts`: mapear a coluna de função da planilha pra `funcao_id` (casar por nome; criar a função se não existir — documentar). NÃO ler mais `colaboradores.funcao`/`cbo` cru.

- [ ] **Step 4: Queries de RH** — em `rh/_shared/queries.ts`, `rh/folha/queries.ts`, `rh/apontamentos/queries.ts` (e outras achadas no Step 1): trocar o select de `colaboradores.funcao` por join `funcoes(nome)` entregando `funcao` (nome) com o MESMO nome de campo, pra os componentes de display não mudarem. Confirmar que nenhum lê `colaboradores.cbo`.

- [ ] **Step 5: UI** — `colaboradores-form-drawer.tsx`: campo função vira `Combobox` das `listarFuncoesAtivas()` (buscadas no server e passadas); `onValorChange` chama `salarioSugerido` e faz `form.setValue("salario", ...)` só na troca ativa (não no load). Remover o campo CBO do form; mostrar o CBO da função read-only (informativo, atualiza ao trocar a função). `ficha-colaborador.tsx`/`colaboradores-tabela.tsx`: exibem `funcao` (nome) e CBO (da função) — ajustar se liam o campo antigo.

- [ ] **Step 6: Portão + commit** — limpar `.next` dup; `typecheck/lint/test/build`; `npm run dev` (criar função, ligar colaborador, ver o salário sugerir). Confirmar via grep que nada mais lê `colaboradores.funcao`/`cbo` cru (só via join alias). Commit: `feat(rh): colaborador usa funcao_id, salário sugerido e CBO da função`.

---

## Task 4: Contract (drop colunas antigas) + verificação final + preview

**Files:** Create `supabase/migrations/<ts>_colaborador_drop_funcao_cbo.sql`; Modify `src/lib/database.types.ts` (regen).

- [ ] **Step 1: Guard + Contract** — confirmar por grep que NENHUM código lê `colaboradores.funcao` ou `colaboradores.cbo` cru (só `funcoes.nome as funcao` via join e `funcoes.cbo`). Só então: migration `alter table public.colaboradores drop column funcao; alter table public.colaboradores drop column cbo;`. Aplicar via `apply_migration`; rollback documentado (re-add colunas). Regenerar tipos → `database.types.ts`.
- [ ] **Step 2: Portão final** (limpar `.next`) `typecheck/lint/test/build` verde; `get_advisors` sem novo (fora o esperado; `funcoes` NÃO em `rls_enabled_no_policy`).
- [ ] **Step 3: Preview** push; roteiro: criar 2 funções com piso; abrir a aba /cadastros/funcoes; num colaborador, escolher a função e ver o salário preencher (e ajustar); ver o CBO vindo da função; abrir a ficha; conferir uma tela de RH que mostra a função do colaborador (ainda aparece o nome).
- [ ] **Step 4: Merge após OK do Tiago** `git checkout main && git merge --no-ff feat-rh-funcoes ... && git push origin main`.

---

## Self-review (feito ao escrever)
- **Cobertura do spec:** tabela funcoes + recurso/seed + funcao_id/backfill (T1); cadastro de funções backend+aba+import (T2); colaborador usa funcao_id, salário sugerido, CBO da função, e as queries de RH fazem join (T3); contract drop + verificação (T4). Fora de escopo (faixa, validação CBO, histórico) não entra. Coberto.
- **Placeholders:** cadastro-modelo vivo e o grep de usos têm "ler/mapear antes"; `<ts>` = timestamp. Sem TODO solto.
- **Consistência:** `funcoes`/`funcao_id` (T1) consumidos por listarFuncoesAtivas/queries (T2/T3); `cadastros.funcoes` (T1) gate do cadastro (T2); `salarioSugerido` (T3) definido e usado na T3; expand (T1) → migração de código (T3) → contract (T4) na ordem certa (drop só depois do grep-guard); o join entrega `funcao` (nome) com o mesmo nome de campo pra não quebrar display.
