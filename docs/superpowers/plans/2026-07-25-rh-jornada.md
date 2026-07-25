# Jornada/escala de trabalho (#10) — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, tarefa a tarefa. Passos usam checkbox (`- [ ]`).

**Goal:** Cadastro de jornadas (horas por dia da semana) + jornada por colaborador; o ponto lança o total e separa normal/extra (produtividade) e sugere falta; e a folha gerencial para de pagar extra (salário fechado). Sem inventar regra fiscal.

**Architecture:** Tabela `jornadas` (padrão de cadastro: RLS/grants/auditoria/soft delete/import) + recurso `cadastros.jornadas` + seed "Padrão EMT" (8/8/8/8/8/5/0). `colaboradores.jornada_id` FK (expand-only). Lógica pura de split (jornadaDoDia/separaHoras/sugereFalta) testada. Apontamento: total → split editável + falta. Ajuste na `fn_gerar_folha` (extra=0, encargos sobre salário). Migrations via MCP no projeto vivo `vsesgvqjgqpapoxhnbqx`, lendo o vivo antes.

**Tech Stack:** Next.js 16 (TS strict), Supabase (RLS) via MCP, RHF+Zod, Vitest, canônicos. Branch: `feat-rh-jornada`.

Spec: `docs/superpowers/specs/2026-07-25-rh-jornada-design.md`.

## Global Constraints
- Não inventar regra fiscal/trabalhista além do que o Tiago definiu (jornada 8/5/0; extra = produtividade; folha para de pagar extra). Pagamento de extra e taxas diferenciadas ficam pro Bloco 7.
- RLS 100% + grants explícitos (anon sem DML); permissão tripla (`cadastros.jornadas`). Soft delete via lixeira. Auditoria. Todo cadastro tem import.
- **Dinheiro:** o ajuste da `fn_gerar_folha` muda custo/líquido — ler a fn viva, mudar só o cálculo de extra/encargos, testar em banco (begin/rollback) antes; rollback documentado; não mexer em fechar/reabrir.
- Horas NUMERIC com check 0..24; Combobox canônico; loading.tsx; sem TZ shift (America/Rio_Branco) no dia da semana. Ambiente: limpar `.next` dup antes do typecheck.
- Portão por tarefa: typecheck/lint/build verdes; testes existentes verdes; sem any novo, sem console.log. Commit termina com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 1: DB — tabela `jornadas` + recurso/seed + seed Padrão EMT + `jornada_id`

**Files:** Create `supabase/migrations/<ts>_jornadas.sql`, `supabase/migrations/<ts>_perm_jornadas.sql`, `supabase/migrations/<ts>_colaborador_jornada_id.sql`; Modify `src/config/recursos.ts`, `src/lib/database.types.ts` (regen).

**Interfaces:**
- Produces: tabela `jornadas` (id, nome, horas_segunda…horas_domingo, ativo, timestamps); linha "Padrão EMT" (8/8/8/8/8/5/0); recurso `cadastros.jornadas`; `colaboradores.jornada_id` FK.

- [ ] **Step 1: Ler o cadastro-modelo vivo** — espelhar `funcoes` (Bloco 3), que já é a cópia de `unidades_medida`: policies (`pg_policies where tablename='funcoes'`), grants, triggers, e a extensão do dispatcher `fn_recurso_do_cadastro` (adicionar o case `jornadas → 'cadastros.jornadas'`, preservando todos os existentes). Ler como `cadastros.funcoes` foi semeada.

- [ ] **Step 2: Migration `jornadas`** — `public.jornadas` (id uuid pk default gen_random_uuid(); nome text not null unique; horas_segunda/terca/quarta/quinta/sexta/sabado/domingo numeric(4,2) not null default 0, cada uma `check (col >= 0 and col <= 24)`; ativo boolean not null default true; created_at/updated_at/created_by no padrão). RLS on; policies por `cadastros.jornadas`; grants explícitos (authenticated, anon sem DML); triggers auditoria/created_by/updated_at; estender `fn_recurso_do_cadastro` pra `jornadas`. **Seed:** `insert into public.jornadas (nome, horas_segunda, horas_terca, horas_quarta, horas_quinta, horas_sexta, horas_sabado, horas_domingo) values ('Padrão EMT', 8,8,8,8,8,5,0);`. Aplicar via `apply_migration`; rollback = drop table (+ reverter dispatcher).

- [ ] **Step 3: Recurso + seed de permissão** — `config/recursos.ts`: `{ id: "cadastros.jornadas", nome: "Jornadas", modulo: "cadastros", rota: "/cadastros/jornadas", acoes: CRUD }`. Migration `_perm_jornadas.sql`: semear nos mesmos perfis de `cadastros.funcoes`, sync usuario_permissoes, idempotente. Verificar contagens.

- [ ] **Step 4: `jornada_id`** — migration `_colaborador_jornada_id.sql`: `alter table public.colaboradores add column jornada_id uuid references public.jornadas(id);`. (Opcional: backfill `update colaboradores set jornada_id = (select id from jornadas where nome='Padrão EMT') where jornada_id is null;`.) Aplicar; `get_advisors` e confirmar `jornadas` NÃO em rls_enabled_no_policy.

- [ ] **Step 5: Regen tipos + portão** — `generate_typescript_types` → `database.types.ts`. Limpar `.next` dup; `typecheck`; `recursos.test.ts` verde. Commit: `feat(db): tabela jornadas (Padrão EMT) + jornada_id em colaboradores`.

---

## Task 2: Cadastro de jornadas — backend + aba

**Files:** Create `src/modules/cadastros/jornadas/{schemas,queries,actions,importacao}.ts` (+ teste), `src/app/(app)/cadastros/jornadas/{page,loading}.tsx`, `src/modules/cadastros/jornadas/components/{jornadas-tabela,jornada-form-drawer}.tsx`.

**Interfaces:**
- Produces: `listarJornadas()`, `listarJornadasAtivas()` (id, nome, as 7 horas — p/ o Combobox e o split), `salvarJornada`/`removerJornada` (gated `cadastros.jornadas`), `jornadaSchema`.

- [ ] **Step 1: Ler** o cadastro `funcoes` (Bloco 3) ponta a ponta — é o modelo mais recente (schema/queries/actions/importacao + aba). Copiar o padrão (permissão, lixeira, import, canônicos).

- [ ] **Step 2: Zod (falha primeiro)** — `jornadaSchema`: `nome` min 2; `horasSegunda…horasDomingo` número 0..24 (reusar o validador de horas do apontamento se servir, ou um numérico 0..24); `ativo` boolean default true. Teste Vitest (nome vazio falha; hora 25 falha; hora vazia = 0 ou erro conforme decidir; ativo default). FAIL → implementar → PASS.

- [ ] **Step 3: queries/actions/import** — `listarJornadas()` e `listarJornadasAtivas()` (server-only); `salvarJornada` (criar/editar, `exigirPermissao("cadastros.jornadas", ...)`); `removerJornada` (soft delete via `fn_excluir_cadastro('jornadas', ...)`); `importacao.ts` (colunas nome + as 7 horas + ativo).

- [ ] **Step 4: Aba** — `page.tsx` (checa ver; `listarJornadas`) + `loading.tsx`. `jornadas-tabela.tsx` (DataTable: nome, as horas resumidas — ex. "Seg-Sex 8h · Sáb 5h", ativo StatusBadge; editar/excluir gated). `jornada-form-drawer.tsx` (FormDrawer: nome + 7 horas + ativo). ImportDialog.

- [ ] **Step 5: Portão + commit** — `typecheck/lint/test/build`. Commit: `feat(cadastros): aba e cadastro de jornadas`.

---

## Task 3: Colaborador — `jornada_id` no cadastro e na ficha

**Files:** Modify `src/modules/cadastros/colaboradores/{schemas,queries,actions,ficha}.ts`, `components/{colaboradores-form-drawer,ficha-colaborador}.tsx`.

- [ ] **Step 1: Ler** o padrão de FK já usado no colaborador (funcaoId do Bloco 3 — Combobox das `listarFuncoesAtivas`) pra espelhar com `listarJornadasAtivas`.

- [ ] **Step 2: Schema + backend** — `schemas.ts`: `jornadaId: z.uuid().nullable()`. `queries.ts`/`ficha.ts`: SELECT com join `jornadas(nome)`; expor `jornadaId` e `jornadaNome`. `actions.ts` (`paraLinhaBanco`): gravar `jornada_id`.

- [ ] **Step 3: UI** — `colaboradores-form-drawer.tsx`: campo Jornada vira `Combobox` das `listarJornadasAtivas()` (buscar no server e passar; vazio = Padrão EMT, deixar claro no placeholder/ajuda). `ficha-colaborador.tsx`: mostrar a jornada (nome) na seção de cadastro.

- [ ] **Step 4: Portão + commit** — `typecheck/lint/test/build`. Commit: `feat(rh): jornada do colaborador no cadastro e na ficha`.

---

## Task 4: Lógica pura do split + apontamento (total → normal/extra + falta)

**Files:** Create `src/modules/rh/apontamentos/jornada-horas.ts` (+ teste); Modify `src/modules/rh/apontamentos/{queries}.ts` (trazer a jornada dos colaboradores do ponto), `components/apontamento-form-drawer.tsx`.

**Interfaces:**
- Produces: `jornadaDoDia(jornada, dataISO): number`; `separaHoras(total, jornadaHoras): {horasNormais, horasExtras}`; `sugereFalta(total, jornadaHoras): boolean`.

- [ ] **Step 1: Teste da lógica pura (falha primeiro)** — `jornada-horas.test.ts`: `jornadaDoDia` (cada dia da semana pega a coluna certa; sem TZ shift — passar datas ISO conhecidas: um sábado→horas_sabado, um domingo→horas_domingo); `separaHoras` (dia útil 10h/j8→8+2; sáb 6h/j5→5+1; dom 4h/j0→0+4; total 6h/j8→6+0); `sugereFalta` (0h/j8→true; 0h/j0→false; 3h/j8→false). Rodar → FAIL.

- [ ] **Step 2: Implementar `jornada-horas.ts`** — funções puras (2 casas; weekday por data ISO sem `new Date()` sujeito a TZ — derivar o dia da semana da string yyyy-MM-dd de forma determinística, padrão dos outros cálculos de data do projeto). Rodar → PASS.

- [ ] **Step 3: Query do ponto traz a jornada** — em `apontamentos/queries.ts`, a query que lista os colaboradores disponíveis pro ponto passa a trazer a jornada de cada um (as 7 horas), com fallback pra "Padrão EMT" quando `jornada_id` é null. (Buscar a Padrão EMT uma vez e usar de fallback.)

- [ ] **Step 4: Form do apontamento** — `apontamento-form-drawer.tsx`: adicionar campo **Total de horas**; `onChange` do total (ou um botão "calcular") usa `jornadaDoDia(jornadaDoColaborador, dataDoPonto)` → `separaHoras` → `form.setValue("horasNormais"/"horasExtras")` (editáveis); se `sugereFalta`, sugerir `tipo="falta"`. Manter os campos normal/extra visíveis. Em edição, o Total = normal+extra. NÃO mudar o schema/servidor do apontamento (grava normal/extra como hoje).

- [ ] **Step 5: Portão + commit** — `typecheck/lint/test/build`; `npm run dev`: no ponto, escolher colaborador, lançar total num sábado e ver 5+extra. Commit: `feat(rh): ponto separa normal/extra pela jornada e sugere falta`.

---

## Task 5: Folha gerencial para de pagar extra (`fn_gerar_folha`) — dinheiro

**Files:** Create `supabase/migrations/<ts>_folha_sem_pagar_extra.sql`.

- [ ] **Step 1: Ler a fn viva** — `pg_get_functiondef('public.fn_gerar_folha')` (já lida: `v_extras = horas_extras × salário/220 × 1.5`; encargos sobre `salario + v_extras`; custo = `salario + v_extras + encargos`; líquido = `salario + v_extras - adiant`; valor_bruto = sum(`salario_base + valor_extras`)). Copiar o corpo inteiro pra alterar só o mínimo.

- [ ] **Step 2: Migration `create or replace`** — trocar: `v_extras := 0;` (não paga extra); `v_encargos := round(v_colab.salario * p_encargos_pct / 100.0, 2);` (sobre o salário); `v_custo := v_colab.salario + v_encargos;`; `v_liquido := v_colab.salario - v_adiant;`. Manter o INSERT em `folha_itens` gravando `horas_normais`/`horas_extras` (produtividade) e `valor_extras` (agora 0). `valor_bruto` do update vira sum(`salario_base`) (já que valor_extras=0, `salario_base + valor_extras` = salario_base — pode manter a expressão). PRESERVAR todo o resto (permissão, competência, adiantamentos, centro de custo, fechar/reabrir intactos). Aplicar via `apply_migration`; rollback = a versão anterior (colar no cabeçalho).

- [ ] **Step 3: Verificar em banco (begin/rollback)** — montar um cenário: colaborador CLT ativo, salário X, um apontamento aprovado com horas_extras > 0 na competência; rodar `fn_gerar_folha`; conferir no `folha_itens`: `valor_extras = 0`, `custo_total = salario + encargos` (extra não somou), `horas_extras` ainda registrado; `valor_liquido = salario - adiantamentos`. Reverter tudo. `get_advisors` sem novo.

- [ ] **Step 4: Regen tipos (se a assinatura mudou — não deve) + portão + commit** — `typecheck` (a fn não muda tipos do front; se nada mudou em database.types, ok). Commit: `feat(rh): folha gerencial não paga extra (salário fechado)`.

---

## Task 6: Verificação final + preview

- [ ] **Step 1: Portão final** (limpar `.next`) `typecheck/lint/test/build` verde; `get_advisors` sem novo (jornadas NÃO em rls_enabled_no_policy).
- [ ] **Step 2: Preview** push; roteiro: ver a aba /cadastros/jornadas (Padrão EMT); escolher uma jornada num colaborador; no ponto, lançar total num sábado → 5+extra, num dia útil 10h → 8+2, zero em dia útil → sugere falta; gerar a folha gerencial e conferir que a extra NÃO soma no custo (só produtividade).
- [ ] **Step 3: Merge após OK do Tiago** `git checkout main && git merge --no-ff feat-rh-jornada ... && git push origin main`.

---

## Self-review (feito ao escrever)
- **Cobertura do spec:** jornadas + recurso/seed + seed Padrão EMT + jornada_id (T1); cadastro de jornadas (T2); jornada no colaborador (T3); lógica pura + apontamento total→split→falta (T4); folha para de pagar extra (T5); verificação (T6). Fora de escopo (batida, banco de horas, pagamento de extra, eSocial) não entra. Coberto.
- **Placeholders:** modelo `funcoes` e a fn viva têm "ler antes"; `<ts>` = timestamp; seed Padrão EMT explícito (8/8/8/8/8/5/0). Sem TODO solto.
- **Consistência:** `jornadas`/`jornada_id` (T1) consumidos por listarJornadasAtivas (T2) e pelo colaborador (T3) e pelo split do ponto (T4); `jornadaDoDia/separaHoras/sugereFalta` (T4) definidos e usados na T4; a folha (T5) só muda o cálculo de extra/encargos, sem tocar no storage de horas que a T4 alimenta.
