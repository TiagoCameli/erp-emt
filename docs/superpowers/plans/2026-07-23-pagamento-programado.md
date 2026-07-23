# Pagamento programado (fila de programados) — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, tarefa a tarefa. Passos usam checkbox (`- [ ]`).

**Goal:** Data programada por parcela + aba "Programados" (agenda de caixa das parcelas aprovadas e não pagas por data programada, com Pagar e Programar).

**Architecture:** Coluna `data_programada` + fn definer pra setá-la (a tabela só tem grant SELECT). Recurso novo `financeiro.programados` com permissão semeada. Backend (cálculo puro testável + query + action) e a aba (lista com buckets + KPIs + dialog Programar + reuso do pagar-parcela-drawer). Migrations via MCP no projeto vivo `vsesgvqjgqpapoxhnbqx`, lendo a definição viva antes de alterar.

**Tech Stack:** Next.js 16 (TS strict), Supabase (RLS) via MCP, RHF+Zod, Vitest, canônicos. Branch: `feat-pagamento-programado`.

Spec: `docs/superpowers/specs/2026-07-23-pagamento-programado-design.md`.

## Global Constraints

- RLS/grants/auditoria mantidos; fn definer checa permissão (permissão tripla). Escrita em `lancamento_parcelas` só via fn.
- Dinheiro NUMERIC(14,2); timezone America/Rio_Branco pro "hoje". Datas `date`.
- Migrations via MCP `apply_migration` + `.sql` versionado; `get_advisors` depois; ler fn viva antes de alterar. (Ambiente: limpar `.next` dup antes do typecheck.)
- Portão por tarefa: typecheck/lint/build verdes; testes existentes verdes; sem any novo, sem console.log.
- Componentes canônicos (DataTable/KPICard/StatusBadge/FormDrawer/MoneyText/SkeletonPagina). Toda rota nova tem `loading.tsx`.
- Commit termina com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 1: Migration — coluna `data_programada` + `fn_programar_pagamento`

**Files:** Create `supabase/migrations/<ts>_pagamento_programado.sql`.

- [ ] **Step 1: Ler o estado vivo** (MCP execute_sql): o check de status de `lancamento_parcelas` (confirmar valores: pendente/aprovado/pago/cancelado) e o padrão de uma fn definer de parcela (ex.: `pg_get_functiondef` de `fn_pagar_parcela`) pra espelhar permissão/estilo.

- [ ] **Step 2: Migration**
```sql
alter table public.lancamento_parcelas add column data_programada date;

create or replace function public.fn_programar_pagamento(
  p_parcela_id uuid, p_data_programada date
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if not public.tem_permissao('financeiro.programados','editar') then
    raise exception 'Sem permissão para programar pagamentos';
  end if;
  select status into v_status from public.lancamento_parcelas where id = p_parcela_id;
  if v_status is null then raise exception 'Parcela não encontrada'; end if;
  if v_status <> 'aprovado' then
    raise exception 'Só dá para programar parcela aprovada e não paga';
  end if;
  update public.lancamento_parcelas
    set data_programada = p_data_programada
    where id = p_parcela_id;
end $$;
revoke all on function public.fn_programar_pagamento(uuid, date) from public, anon;
grant execute on function public.fn_programar_pagamento(uuid, date) to authenticated;
```
Aplicar via `apply_migration`; `get_advisors`; `generate_typescript_types` → atualizar `src/lib/database.types.ts`. Rollback: `drop function fn_programar_pagamento; alter table lancamento_parcelas drop column data_programada;`.

- [ ] **Step 3: Verificar** (execute_sql): a coluna existe; a fn programa uma parcela `aprovado` de teste e recusa uma `pago`/`pendente`. Limpar. Portão `typecheck` verde. Commit: `feat(db): data_programada + fn_programar_pagamento`.

---

## Task 2: Recurso `financeiro.programados` + seed de permissão

**Files:** Modify `src/config/recursos.ts`; Create `supabase/migrations/<ts>_perm_programados.sql`.

- [ ] **Step 1: Recurso** — em `config/recursos.ts`, após `financeiro.pagamentos`:
```ts
{ id: "financeiro.programados", nome: "Programados", modulo: "financeiro", rota: "/financeiro/programados", acoes: CRUD },
```
(Se o app usar um conjunto menor de ações, alinhar ao padrão dos outros de financeiro; o essencial é `ver` e `editar`.)

- [ ] **Step 2: Seed de permissão** — ler como `financeiro.pagamentos` está semeado em `perfil_permissoes`/`usuario_permissoes` e replicar `financeiro.programados` (ver/editar/…) aos MESMOS perfis, sincronizando TAMBÉM `usuario_permissoes` (padrão do projeto — senão a aba fica inacessível). Insert idempotente `on conflict do nothing`. Aplicar via `apply_migration`; verificar que o Tiago/o perfil passou a ter a permissão.

- [ ] **Step 3: Portão + commit** `typecheck/lint`. Commit: `feat(financeiro): recurso e permissão de Programados`.

---

## Task 3: Backend — cálculo puro + query + action

**Files:** Create `src/modules/financeiro/programados/calculo.ts` + `calculo.test.ts`, `queries.ts`, `actions.ts`, `schemas.ts`.

**Interfaces:**
- `dataEfetivaProgramacao(dataProgramada: string|null, vencimento: string|null): string|null` (coalesce).
- `bucketProgramacao(dataEfetivaISO: string, hojeISO: string): "atrasada"|"hoje"|"proxima"`.
- `resumoProgramados(itens): { atrasado: number; hoje: number; proximos7: number }` (soma de valores por bucket/janela).
- `listarProgramados()` (parcelas status `aprovado` não pagas + lançamento a_pagar, com fornecedor/descrição/valor/vencimento/data_programada), ordenado por data efetiva asc.
- `programarPagamento(parcelaId, dataISO)` (action, checa `financeiro.programados` editar, chama `fn_programar_pagamento`).

- [ ] **Step 1: Teste do cálculo (falha primeiro)** — `calculo.test.ts` cobrindo `dataEfetivaProgramacao` (usa data_programada; cai no vencimento se null), `bucketProgramacao` (< hoje→atrasada, = hoje→hoje, > hoje→proxima), `resumoProgramados` (soma por atrasado/hoje/próximos 7 dias). Rodar → FAIL.

- [ ] **Step 2: Implementar `calculo.ts`** (funções puras; datas ISO `yyyy-mm-dd`, comparação por string funciona pra igualdade/ordem; "próximos 7 dias" = hoje < efetiva <= hoje+7). Rodar → PASS.

- [ ] **Step 3: queries/actions/schemas** — `listarProgramados` (join `lancamentos`→fornecedor; filtrar parcela `aprovado`, lançamento não cancelado); `programarPagamento` (Zod: data; `exigirPermissao("financeiro.programados","editar")`; `supabase.rpc("fn_programar_pagamento", ...)`; `erroAcao`). Seguir o padrão de `financeiro/pagamentos/{queries,actions}.ts`.

- [ ] **Step 4: Portão + commit** `typecheck/lint/test`. Commit: `feat(financeiro): backend dos pagamentos programados`.

---

## Task 4: UI — aba Programados (lista + KPIs + Programar + Pagar)

**Files:** Create `src/app/(app)/financeiro/programados/page.tsx`, `loading.tsx`; `src/modules/financeiro/programados/components/programados-tabela.tsx`, `programar-dialog.tsx`.

- [ ] **Step 1: Ler o pagar-parcela-drawer** — `src/modules/financeiro/pagamentos/components/pagar-parcela-drawer.tsx` (props, como recebe a parcela, refresh) pra REUSAR o Pagar sem duplicar. E a query/action de pagar.

- [ ] **Step 2: Rota + loading** — `page.tsx` (checa `ver`, `listarProgramados`, calcula KPIs via `resumoProgramados`, renderiza). `loading.tsx` = `SkeletonPagina`.

- [ ] **Step 3: Tabela + KPIs + dialogs** — `KPICard` (atrasado / hoje / próximos 7). `DataTable`/lista com colunas (fornecedor, descrição, valor `MoneyText`, vencimento, data programada, bucket via `StatusBadge`: atrasada=vermelho/hoje=âmbar/próxima=neutro), ordenada por data efetiva. Ações: **Pagar** (reusa `PagarParcelaDrawer`) e **Programar/Reprogramar** (`programar-dialog.tsx`: FormDrawer/Dialog canônico, RHF+Zod, 1 campo data default = efetiva atual, chama `programarPagamento`). Toast + refresh.

- [ ] **Step 4: Portão + build + validação local** `typecheck/lint/test/build`; `npm run dev`: ver a aba, programar uma parcela (muda o bucket), pagar (sai da fila). Commit: `feat(financeiro): aba Programados (agenda de pagamentos)`.

---

## Task 5: Verificação final + preview

- [ ] **Step 1: Portão final** (limpar `.next`) `typecheck/lint/test/build` verde; `get_advisors` sem novo.
- [ ] **Step 2: Preview** push; roteiro: aprovar uma parcela → ela aparece em Programados pela data de vencimento → Programar pra outra data → muda o bucket/KPI → Pagar → sai da fila.
- [ ] **Step 3: Merge após OK do Tiago** `git checkout main && git merge --no-ff feat-pagamento-programado ... && git push origin main`.

---

## Self-review (feito ao escrever)
- **Cobertura do spec:** coluna+fn (T1); recurso+seed (T2); efetiva/bucket/KPI + query + action (T3); aba com buckets/KPIs/Programar/Pagar-reuso (T4); verificação (T5). Coberto.
- **Placeholders:** fns vivas e o pagar-drawer têm "ler antes"; `<ts>` = timestamp a preencher. Sem TODO solto.
- **Consistência:** `fn_programar_pagamento(uuid,date)` T1↔T3; `financeiro.programados`/`editar` T1/T2/T3/T4; `dataEfetivaProgramacao`/`bucketProgramacao`/`resumoProgramados` definidos na T3 e usados na T4.
