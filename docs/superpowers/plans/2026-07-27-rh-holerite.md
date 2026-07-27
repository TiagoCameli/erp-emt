# Holerite + INSS/IRRF/FGTS por faixa (#3) — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, tarefa a tarefa. Passos usam checkbox (`- [ ]`).

**Goal:** Config editável de INSS/IRRF/parâmetros (o Tiago preenche) + cálculo (INSS progressivo/teto; IRRF completo vs simplificado, menor) + a folha descontar INSS/IRRF no líquido + holerite na tela e em PDF. Sem inventar alíquota (só o método).

**Architecture:** Tabelas de config (`folha_inss_faixas`, `folha_irrf_faixas`, `folha_parametros`) sob recurso `rh.parametros-folha`; colunas `inss`/`irrf` em `folha_itens`. Lógica pura `calculo-imposto.ts` (testada com casos de valor conhecido). `fn_gerar_folha` calcula INSS/IRRF (mesma lógica, em SQL) e desconta no líquido. Holerite tela + PDF (pdfmake). Migrations via MCP no vivo `vsesgvqjgqpapoxhnbqx`, lendo o vivo antes.

**Tech Stack:** Next.js 16 (TS strict), Supabase (RLS) via MCP, RHF+Zod, Vitest, pdfmake, canônicos. Branch: `feat-rh-holerite`.

Spec: `docs/superpowers/specs/2026-07-27-rh-holerite-design.md`.

## Global Constraints
- **Não inventar valor fiscal:** nenhum seed de alíquota/faixa/parâmetro; o Tiago cadastra. Encodo só o MÉTODO (progressivo, parcela a deduzir, menor imposto) — padrão público. Base = salário; dependentes IRRF = `rh_dependentes.dependente_irrf` (Bloco 2).
- **Dinheiro:** `fn_gerar_folha` passa a descontar INSS/IRRF no líquido — ler a fn viva, adicionar SÓ isso, testar em banco; preservar custo/encargos (Bloco 6), competência, adiantamentos, centro de custo, somatórios; `fn_fechar/reabrir` intactas. A lógica pura TS e a SQL têm que dar o MESMO número (testar ambas). Config vazia → INSS/IRRF = 0.
- RLS 100% + grants explícitos (anon sem DML); permissão tripla (`rh.parametros-folha` na config; holerite/PDF por `rh.folha`). Auditoria + soft delete nas faixas. NUMERIC(14,2) dinheiro, (6,3) alíquota. Combobox canônico; loading.tsx. Ambiente: limpar `.next` dup antes do typecheck.
- Portão por tarefa: typecheck/lint/build verdes; testes existentes verdes; sem any novo, sem console.log. Commit termina com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 1: DB — config (faixas + parâmetros) + recurso/seed + colunas inss/irrf

**Files:** Create `supabase/migrations/<ts>_folha_faixas_parametros.sql`, `supabase/migrations/<ts>_perm_parametros_folha.sql`, `supabase/migrations/<ts>_folha_item_inss_irrf.sql`; Modify `src/config/recursos.ts`, `src/lib/database.types.ts` (regen).

**Interfaces:**
- Produces: `folha_inss_faixas(id, limite_ate numeric(14,2), aliquota numeric(6,3), timestamps)`; `folha_irrf_faixas(id, limite_ate, aliquota, parcela_deduzir numeric(14,2), timestamps)`; `folha_parametros` (1 linha: `irrf_deducao_por_dependente numeric(14,2)`, `irrf_desconto_simplificado numeric(14,2)`, `fgts_percentual numeric(6,3)`, timestamps); `folha_itens.inss`, `folha_itens.irrf`; recurso `rh.parametros-folha`.

- [ ] **Step 1: Ler o vivo** — espelhar o padrão de cadastro (`folha_encargos`/`funcoes`: RLS/grants/triggers/soft-delete; dispatcher `fn_recurso_do_cadastro`). Ler as policies/grants de `folha_itens` (pras colunas novas — só ALTER, sem mudar policy) e como `rh.folha` está semeada.

- [ ] **Step 2: Migrations das tabelas de config** — `folha_inss_faixas` e `folha_irrf_faixas` (cadastros: RLS/policies por `rh.parametros-folha` — ver/criar/editar, sem DELETE = soft delete via lixeira; grants sem DML anon; triggers; `check aliquota 0..100`, `limite_ate >= 0`; estender `fn_recurso_do_cadastro` pros dois → `'rh.parametros-folha'`). `folha_parametros`: tabela de 1 linha (constraint pra no máx 1 linha, ex. `id` fixo ou `check`), RLS igual, sem soft delete (é config única, update-only). **SEM seed de valor.** Aplicar; rollback documentado.

- [ ] **Step 3: Recurso + seed** — `config/recursos.ts`: `{ id: "rh.parametros-folha", nome: "Parâmetros da folha", modulo: "rh", rota: "/rh/parametros-folha", acoes: CRUD }`. Migration `_perm_parametros_folha.sql`: semear aos mesmos perfis de `rh.folha`, sync usuario_permissoes, idempotente. Verificar contagens.

- [ ] **Step 4: Colunas inss/irrf** — `alter table public.folha_itens add column inss numeric(14,2) not null default 0, add column irrf numeric(14,2) not null default 0;` (expand; não muda policy). Aplicar; `get_advisors` (as 3 tabelas novas com RLS/policy; nenhuma em rls_enabled_no_policy).

- [ ] **Step 5: Regen tipos + portão** — `generate_typescript_types` → `database.types.ts`. Limpar `.next` dup; `typecheck`; `recursos.test.ts` verde. Commit: `feat(db): faixas INSS/IRRF + parâmetros da folha + inss/irrf em folha_itens`.

---

## Task 2: Config UI — aba "Parâmetros da folha"

**Files:** Create `src/modules/rh/parametros-folha/{schemas,queries,actions}.ts` (+ teste), `src/app/(app)/rh/parametros-folha/{page,loading}.tsx` + components (editores das faixas INSS/IRRF + form dos parâmetros).

- [ ] **Step 1: Ler** o cadastro `folha_encargos`/`jornadas` (Bloco 6/4) pro padrão de tabela editável (add/edit/remove linha via drawer) e o padrão de form/action; e como um form de config de 1 linha (upsert) pode ser feito.

- [ ] **Step 2: Zod (falha primeiro)** — schemas das faixas (INSS: limite_ate > 0, aliquota 0..100; IRRF: + parcela_deduzir >= 0) e dos parâmetros (deducao_dependente >= 0, desconto_simplificado >= 0, fgts_percentual 0..100). Testes. FAIL → implementar → PASS.

- [ ] **Step 3: queries/actions** — listar/salvar/remover faixa de INSS e de IRRF (gated `rh.parametros-folha`, soft delete via `fn_excluir_cadastro`); ler/upsert os parâmetros (gated editar). server-only.

- [ ] **Step 4: Aba** — `page.tsx` (checa `rh.parametros-folha` ver; carrega faixas + params) + `loading.tsx`. Três seções: **Faixas INSS** (tabela ordenada por limite + drawer add/edit; ajuda: "cadastre as faixas oficiais vigentes"), **Faixas IRRF** (idem + parcela a deduzir), **Parâmetros** (form: dedução por dependente, desconto simplificado, FGTS %). MoneyText/percentual formatados. Sem valores de exemplo.

- [ ] **Step 5: Portão + commit** — `typecheck/lint/test/build` (rota `/rh/parametros-folha`). Commit: `feat(rh): aba de parâmetros da folha (faixas INSS/IRRF + parâmetros)`.

---

## Task 3: Lógica pura de imposto (o coração fiscal)

**Files:** Create `src/modules/rh/folha/calculo-imposto.ts` (+ `calculo-imposto.test.ts`).

**Interfaces:**
- `calcularINSS(salario: number, faixas: {limiteAte:number; aliquota:number}[]): number`
- `calcularIRRFCompleto(salario, inss, qtdDependentes, faixasIRRF, deducaoPorDependente): number`
- `calcularIRRFSimplificado(salario, faixasIRRF, descontoSimplificado): number`
- `calcularIRRF(...): number` = `min(completo, simplificado)`
- `type FaixaINSS = {limiteAte; aliquota}`, `type FaixaIRRF = {limiteAte; aliquota; parcelaDeduzir}`.

- [ ] **Step 1: Testes (falham primeiro)** — casos de VALOR CONHECIDO com tabelas hipotéticas (provam o método, sem depender das taxas reais): INSS progressivo (salário dentro de cada faixa; acima do teto → trava; nas bordas); IRRF completo (base = salário−inss−dep×ded; faixa certa; parcela deduzida; isento → 0; base negativa → 0); simplificado (base = salário−descontoSimpl); `calcularIRRF` pega o menor (casos onde completo vence e onde simplificado vence). Ex.: faixas INSS [até 1000@7.5, até 2000@9, teto 2000]; salário 1500 → 1000×7.5% + 500×9% = 120,00; salário 3000 → 1000×7.5%+1000×9%+... travado no teto 2000. Rodar → FAIL.
- [ ] **Step 2: Implementar** as funções puras (2 casas; nunca negativo; ordenar faixas por limite; progressivo real). Rodar → PASS.
- [ ] **Step 3: Portão + commit** — `typecheck/lint/test`. Commit: `feat(rh): cálculo de INSS e IRRF (progressivo, completo/simplificado)`.

---

## Task 4: `fn_gerar_folha` desconta INSS/IRRF (DINHEIRO)

**Files:** Create `supabase/migrations/<ts>_folha_desconta_inss_irrf.sql`.

- [ ] **Step 1: Ler a fn viva** — `pg_get_functiondef('public.fn_gerar_folha')` (copiar inteira). Ver a lógica pura da Task 3 pra espelhar em SQL exatamente.
- [ ] **Step 2: Migration `create or replace`** — por colaborador, após o salário: calcular `v_inss` (progressivo sobre as `folha_inss_faixas`), `v_irrf` (min do completo/simplificado usando `folha_irrf_faixas` + `folha_parametros` + contagem de `rh_dependentes` com `dependente_irrf` do colaborador). Gravar `inss`/`irrf` no `folha_itens`. `valor_liquido := salario − v_inss − v_irrf − v_adiant`. Encargos/custo (Bloco 6) inalterados; `valor_extras` segue 0. Config vazia → INSS/IRRF 0. Preservar TODO o resto; `fn_fechar/reabrir` intactas. Rollback = versão anterior colada.
- [ ] **Step 3: Verificar em banco (begin/rollback)** — cadastrar faixas/params de teste (os MESMOS do caso de teste da Task 3); colaborador CLT salário conhecido + N dependentes IRRF; gerar; conferir `folha_itens.inss`/`irrf`/`valor_liquido` BATENDO com a lógica pura (mesmo número); custo/encargos inalterados. Reverter. `get_advisors` sem novo.
- [ ] **Step 4: Portão + commit** — `typecheck`. Commit: `feat(rh): folha desconta INSS e IRRF no líquido`.

---

## Task 5: Holerite — tela

**Files:** Modify a query/detalhe da folha ou Create uma rota/componente de holerite por colaborador (decidir lendo o detalhe atual `/rh/folha/[id]`).

- [ ] **Step 1: Ler** o detalhe da folha (como mostra o item por colaborador). Decidir: holerite como expansão/modal do item, ou uma rota `/rh/folha/[id]/holerite/[colaboradorId]`. Preferir o mais simples e canônico.
- [ ] **Step 2: Query** — por folha_item: salário (provento), inss, irrf, adiantamentos (descontos), líquido, e FGTS informativo (salário × `fgts_percentual`). Enxuto.
- [ ] **Step 3: UI** — holerite read-only: bloco de proventos (salário), descontos (INSS, IRRF, adiantamentos), líquido; FGTS informativo à parte; identificação (colaborador/função/competência). `MoneyText`, canônicos. Gated por `rh.folha` ver.
- [ ] **Step 4: Portão + commit** — `typecheck/lint/test/build`. Commit: `feat(rh): holerite do colaborador na tela`.

---

## Task 6: Holerite — PDF

**Files:** Create o gerador de PDF do contracheque (lib pdfmake — procurar se o projeto já tem um util de pdf; senão criar em `src/lib/pdf`) + a action/rota que serve o PDF; Modify o holerite pra ter o botão "Baixar PDF".

- [ ] **Step 1: Ler** se o projeto já usa pdfmake em algum lugar (padrão de geração de PDF) pra reusar. Ver o layout do holerite da Task 5.
- [ ] **Step 2: PDF** — gerar o contracheque (cabeçalho empresa/colaborador/competência; proventos/descontos/líquido; FGTS informativo). Um por colaborador. Gated por `rh.folha` ver. Sem dado sensível fora do gate.
- [ ] **Step 3: Portão + validação local + commit** — `typecheck/lint/test/build`; `npm run dev`: baixar um PDF. Commit: `feat(rh): PDF do contracheque`.

---

## Task 7: Verificação final + preview

- [ ] **Step 1: Portão final** (limpar `.next`) `typecheck/lint/test/build` verde; `get_advisors` sem novo (3 tabelas novas fora de rls_enabled_no_policy).
- [ ] **Step 2: Preview** push; roteiro COM O TIAGO: cadastrar as faixas reais de INSS/IRRF + parâmetros em /rh/parametros-folha; gerar a folha; **conferir INSS/IRRF/líquido contra um holerite real que o Tiago validar** (teste de aceite fiscal); baixar o PDF.
- [ ] **Step 3: Merge após OK do Tiago** `git checkout main && git merge --no-ff feat-rh-holerite ... && git push origin main`.

---

## Self-review (feito ao escrever)
- **Cobertura do spec:** config faixas/params + recurso + colunas inss/irrf (T1); UI de config (T2); cálculo puro testado (T3); fn desconta INSS/IRRF (T4, dinheiro); holerite tela (T5); PDF (T6); verificação + aceite fiscal (T7). Fora de escopo (outros descontos, 13º/férias, eSocial, vigência) não entra. Coberto.
- **Placeholders:** fn viva e o padrão de cadastro têm "ler antes"; `<ts>` = timestamp; SEM seed de valor (regra de ouro); casos de teste com tabelas hipotéticas (método). Sem TODO solto.
- **Consistência:** faixas/params (T1) alimentam o cálculo puro (T3) e a fn (T4) e a UI (T2); colunas inss/irrf (T1) gravadas pela fn (T4) e lidas no holerite (T5/T6); dependentes IRRF = rh_dependentes.dependente_irrf (Bloco 2); a lógica pura (T3) e a SQL (T4) validadas contra o MESMO caso; aceite final contra holerite real (T7).
