# Encargos discriminados na folha (#7) — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, tarefa a tarefa. Passos usam checkbox (`- [ ]`).

**Goal:** Config editável de encargos (nome + %) + a folha discriminar (calcular cada encargo × salário, guardar a quebra por item) no lugar do % global único; o detalhe da folha mostra a quebra. Sem inventar alíquota (o Tiago cadastra).

**Architecture:** `folha_encargos` (cadastro config, RLS/grants/audit/soft-delete, recurso `rh.encargos`) + `folha_item_encargos` (quebra por item, escrita só pela `fn_gerar_folha` definer, select por `rh.folha`). `fn_gerar_folha` passa a ler a config ativa e discriminar. Aba `/rh/encargos` (espelha funcoes/jornadas) + detalhe da folha mostra a quebra. Migrations via MCP no projeto vivo `vsesgvqjgqpapoxhnbqx`, lendo o vivo antes.

**Tech Stack:** Next.js 16 (TS strict), Supabase (RLS) via MCP, RHF+Zod, Vitest, canônicos. Branch: `feat-rh-encargos`.

Spec: `docs/superpowers/specs/2026-07-27-rh-encargos-design.md`.

## Global Constraints
- **Não inventar alíquota** — nenhum seed de taxa; o Tiago cadastra. Base = salário. Config substitui o % global.
- **Dinheiro:** a mudança em `fn_gerar_folha` só troca a ORIGEM dos encargos (config no lugar do pct) e passa a gravar a quebra — nada mais; preservar custo=salário+encargos, líquido=salário-adiant (Bloco 4), permissão, competência, adiantamentos, centro de custo, somatórios; `fn_fechar_folha`/`fn_reabrir_folha` intactas. Ler a fn viva e testar em banco (begin/rollback) antes.
- RLS 100% + grants explícitos (anon sem DML). `folha_item_encargos`: escrita só pela definer (sem grant DML pro authenticated), select por `rh.folha`. Permissão tripla no cadastro (`rh.encargos`). Auditoria + soft delete no cadastro (via `fn_excluir_cadastro`; estender o dispatcher).
- NUMERIC: percentual `numeric(6,3)` (0..100); valores `numeric(14,2)`. Combobox canônico; loading.tsx. Ambiente: limpar `.next` dup antes do typecheck.
- Portão por tarefa: typecheck/lint/build verdes; testes existentes verdes; sem any novo, sem console.log. Commit termina com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 1: DB — `folha_encargos` + recurso/seed + `folha_item_encargos`

**Files:** Create `supabase/migrations/<ts>_folha_encargos.sql`, `supabase/migrations/<ts>_perm_encargos.sql`, `supabase/migrations/<ts>_folha_item_encargos.sql`; Modify `src/config/recursos.ts`, `src/lib/database.types.ts` (regen).

**Interfaces:**
- Produces: `folha_encargos` (id, nome unique, percentual numeric(6,3), ativo, timestamps); `folha_item_encargos` (id, folha_item_id FK cascade, nome, percentual, valor); recurso `rh.encargos`.

- [ ] **Step 1: Ler o vivo** — espelhar `funcoes`/`jornadas` (policies/grants/triggers/soft-delete + dispatcher `fn_recurso_do_cadastro`). Ler as policies/grants de `folha_itens` (pra `folha_item_encargos` seguir o mesmo gate `rh.folha`). Ver como `rh.folha` está semeada em perfil/usuario_permissoes.

- [ ] **Step 2: `folha_encargos`** — `public.folha_encargos` (id uuid pk default gen_random_uuid(); nome text not null unique; percentual numeric(6,3) not null check (percentual >= 0 and percentual <= 100); ativo boolean not null default true; created_at/updated_at/created_by no padrão). RLS on; policies por `rh.encargos` (ver/criar/editar espelhando funcoes; sem DELETE = soft delete via lixeira); grants explícitos (authenticated SELECT/INSERT/UPDATE, anon sem DML); triggers auditoria/created_by/updated_at; `create or replace` do `fn_recurso_do_cadastro` ADICIONANDO `folha_encargos → 'rh.encargos'` (preservar todos). **Sem seed de taxa.** Aplicar via apply_migration; rollback = drop table + reverter dispatcher.

- [ ] **Step 3: Recurso + seed permissão** — `config/recursos.ts`: `{ id: "rh.encargos", nome: "Encargos da folha", modulo: "rh", rota: "/rh/encargos", acoes: CRUD }` (perto de rh.folha). Migration `_perm_encargos.sql`: semear `rh.encargos` (todas as ações) aos MESMOS perfis que têm `rh.folha`, sync usuario_permissoes, idempotente. Verificar contagens.

- [ ] **Step 4: `folha_item_encargos`** — `public.folha_item_encargos` (id uuid pk default gen_random_uuid(); folha_item_id uuid not null references public.folha_itens(id) on delete cascade; nome text not null; percentual numeric(6,3) not null; valor numeric(14,2) not null). RLS on; **policy select** gateada por `rh.folha` ver (join/subselect coerente com como folha_itens gateia — ler a policy viva de folha_itens e espelhar); **sem** policies/grants de insert/update/delete pro authenticated (a `fn_gerar_folha` definer escreve; o cascade limpa). grant SELECT ao authenticated só. Aplicar; `get_advisors` — confirmar que NENHUMA das 2 tabelas novas fica em rls_enabled_no_policy. Rollback = drop table.

- [ ] **Step 5: Regen tipos + portão** — `generate_typescript_types` → `database.types.ts`. Limpar `.next` dup; `typecheck`; `recursos.test.ts` verde. Commit: `feat(db): folha_encargos (config) + folha_item_encargos (quebra)`.

---

## Task 2: Cadastro de encargos — backend + aba `/rh/encargos`

**Files:** Create `src/modules/rh/encargos/{schemas,queries,actions,importacao}.ts` (+ teste), `src/app/(app)/rh/encargos/{page,loading}.tsx`, `src/modules/rh/encargos/components/{encargos-tabela,encargo-form-drawer}.tsx`.

**Interfaces:**
- Produces: `listarEncargos()` (aba), `listarEncargosAtivos()` (se útil), `salvarEncargo`/`removerEncargo` (gated `rh.encargos`), `encargoSchema`.

- [ ] **Step 1: Ler** o cadastro `jornadas` (Bloco 4) ou `funcoes` ponta a ponta — o modelo. Copiar o padrão (permissão, lixeira, import, canônicos).

- [ ] **Step 2: Zod (falha primeiro)** — `encargoSchema`: `nome` min 2; `percentual` número 0..100, ≤3 casas (reusar/adaptar um validador numérico do projeto); `ativo` boolean default true. Teste Vitest (nome vazio falha; 101 falha; negativo falha; 4 casas falha; ativo default). FAIL → implementar → PASS.

- [ ] **Step 3: queries/actions/import** — `listarEncargos()`/`listarEncargosAtivos()` (server-only); `salvarEncargo` (criar/editar, `exigirPermissao("rh.encargos", ...)`); `removerEncargo` (soft delete via `fn_excluir_cadastro('folha_encargos', ...)`); `importacao.ts` (colunas nome + percentual + ativo).

- [ ] **Step 4: Aba** — `page.tsx` (checa `rh.encargos` ver; `listarEncargos`) + `loading.tsx`. `encargos-tabela.tsx` (DataTable: nome, percentual (formatado "20,000%" ou "20%"), ativo StatusBadge; editar/excluir gated). `encargo-form-drawer.tsx` (FormDrawer: nome + percentual + ativo, com ajuda citando exemplos de nomes SEM valores). ImportDialog.

- [ ] **Step 5: Portão + commit** — `typecheck/lint/test/build`. Commit: `feat(rh): aba e cadastro de encargos da folha`.

---

## Task 3: `fn_gerar_folha` discrimina pela config (DINHEIRO)

**Files:** Create `supabase/migrations/<ts>_folha_discrimina_encargos.sql`; Modify `src/modules/rh/folha/{actions,schemas}.ts` e o form de gerar folha (parar de passar o % global).

- [ ] **Step 1: Ler a fn viva** — `pg_get_functiondef('public.fn_gerar_folha')` (copiar o corpo inteiro). Ler a `actions.ts`/o form da folha pra ver como `p_encargos_pct` é passado hoje e onde o usuário digita os 40%.

- [ ] **Step 2: Migration `create or replace`** — trocar SÓ o cálculo de encargos:
  - Remover o uso de `p_encargos_pct` como fonte. Após inserir/obter o `folha_item` (id), para cada `folha_encargos` where `ativo` (e não excluído): `v_valor := round(v_colab.salario * fe.percentual / 100.0, 2)`; `insert into folha_item_encargos(folha_item_id, nome, percentual, valor) values (...)`; acumular `v_encargos := v_encargos + v_valor`.
  - `folha_itens.encargos := v_encargos` (soma). `v_custo := salario + v_encargos`; `v_liquido := salario - adiant` (inalterado). `valor_extras` segue 0 (Bloco 4).
  - Como `folha_item_encargos` referencia `folha_item_id`, inserir os encargos DEPOIS do insert do folha_item (ter o id). Ordem: inserir folha_item (com encargos provisório ou calcular antes) — recalcular: some primeiro os encargos do colaborador, insira o folha_item com o total, depois insira as linhas de folha_item_encargos (precisa do id) — use `returning id`.
  - `folhas.encargos_percentual`: não é mais input; setar como a soma dos percentuais ativos (informativo) ou manter 0. Decidir e documentar.
  - **Assinatura:** manter `fn_gerar_folha(competencia date, p_encargos_pct numeric default 0)` e IGNORAR `p_encargos_pct` (comentar que é legado), pra não quebrar o RPC/call. Preservar TODO o resto (permissão, competência, upsert/limpeza — o delete de folha_itens já cascateia folha_item_encargos, confirme; filtro clt/aprovado; adiantamentos; centro de custo; somatórios). Não tocar fechar/reabrir. Rollback = versão anterior colada no cabeçalho.
- [ ] **Step 3: Verificar em banco (begin/rollback)** — cadastrar 2 encargos (ex. 20% e 8%); colaborador CLT salário 3000; ponto aprovado; gerar; conferir: 2 linhas em `folha_item_encargos` (600 e 240), `folha_itens.encargos = 840`, `custo_total = 3840`, `valor_liquido = 3000 - adiant`. Reverter. `get_advisors` sem novo.
- [ ] **Step 4: Action/UI + portão** — a action de gerar folha para de exigir/passar o % (passa 0 ou remove o arg do input; o schema do form perde o campo do %). `typecheck/lint/test/build`. Commit: `feat(rh): folha discrimina encargos pela config`.

---

## Task 4: Detalhe da folha — quebra de encargos

**Files:** Modify a query e o componente de detalhe da folha (`src/modules/rh/folha/queries.ts`, `components/folha-detalhe.tsx` ou equivalente — confirmar nomes).

- [ ] **Step 1: Ler** o detalhe da folha atual (`/rh/folha/[id]`): como carrega os folha_itens e exibe o `encargos`. Ver a policy de `folha_item_encargos` (select por rh.folha).
- [ ] **Step 2: Query** — trazer, por folha_item, as linhas de `folha_item_encargos` (nome, valor). Enxuto.
- [ ] **Step 3: UI** — no detalhe do colaborador na folha, mostrar a **quebra** (cada encargo: nome + `MoneyText`) e o total; onde antes aparecia só "encargos R$ x". Opcional: total por encargo no rodapé da folha. Estados vazios coerentes (folha antiga sem quebra → mostra só o total gravado).
- [ ] **Step 4: Portão + validação local** — limpar `.next` dup; `typecheck/lint/test/build`; `npm run dev`: cadastrar encargos, gerar folha, ver a quebra no detalhe. Commit: `feat(rh): detalhe da folha mostra a quebra de encargos`.

---

## Task 5: Verificação final + preview

- [ ] **Step 1: Portão final** (limpar `.next`) `typecheck/lint/test/build` verde; `get_advisors` sem novo (as 2 tabelas novas NÃO em rls_enabled_no_policy).
- [ ] **Step 2: Preview** push; roteiro: cadastrar encargos (ex. INSS patronal 20, FGTS 8, RAT 3, Terceiros 5.8) em /rh/encargos; gerar a folha de uma competência com colaborador CLT; ver a quebra no detalhe e o total batendo; conferir que a tela de gerar não pede mais o % global.
- [ ] **Step 3: Merge após OK do Tiago** `git checkout main && git merge --no-ff feat-rh-encargos ... && git push origin main`.

---

## Self-review (feito ao escrever)
- **Cobertura do spec:** config folha_encargos + recurso/seed + folha_item_encargos (T1); cadastro de encargos backend+aba (T2); fn_gerar_folha discrimina + para de usar o % global (T3); detalhe mostra a quebra (T4); verificação (T5). Fora de escopo (IRRF/INSS do empregado, desoneração, eSocial) não entra. Coberto.
- **Placeholders:** modelo funcoes/jornadas e a fn viva têm "ler antes"; `<ts>` = timestamp; sem seed de taxa (regra de ouro). Sem TODO solto.
- **Consistência:** `folha_encargos` (T1) alimenta a fn (T3) e o cadastro (T2); `folha_item_encargos` (T1) escrito pela fn (T3) e lido no detalhe (T4); recurso `rh.encargos` (T1) gate do cadastro (T2); dinheiro isolado na T3 (custo=salário+encargos preservado).
