# Correções do QA de compras/pagamento (23/07) — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, tarefa a tarefa. Passos usam checkbox (`- [ ]`).

**Goal:** Corrigir os 4 bugs (1 crítico) + 2 melhorias rápidas (#5, #8) achados no QA ponta a ponta de compras/pagamento (`vault/projects/erp-emt/qa-fluxo-compras-2026-07-23.md`).

**Architecture:** Causas raiz já confirmadas no banco vivo. Cada correção é pontual e na sua camada (dado / RPC / query / form). Migrations via MCP no projeto `vsesgvqjgqpapoxhnbqx`, sempre lendo a definição VIVA da função antes de alterar. Cada tarefa deixa o app verde.

**Tech Stack:** Next.js 16 (TS strict), Supabase (Postgres 17, RLS) via MCP, RHF+Zod, Vitest. Branch: `fix-qa-compras`.

## Global Constraints

- LER a definição VIVA (`pg_get_functiondef`) de qualquer função antes de alterar (o repo pode divergir). Migration destrutiva não se aplica aqui (são correções aditivas/de dado). fix + rollback documentados no corpo da migration; `get_advisors` depois.
- Dinheiro NUMERIC(14,2) somando exato; parcelas fecham com o total. Timezone America/Rio_Branco.
- Portão por tarefa: typecheck/lint/build verdes; testes existentes verdes; sem any novo, sem console.log. (Ambiente: limpar `.next` dup antes do typecheck: `find .next -name "* [0-9].ts" -delete; find .next -name "* [0-9].tsx" -delete`.)
- Todo commit termina com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Causas raiz (confirmadas no banco vivo)

- **#1 (crítico):** condições "30/60 dias" e "30/60/90 dias" têm 1 parcela (30d/100%) — a migração de dados parseou só o 1º número. O splitter funciona; o dado é que está errado.
- **#2:** `fn_registrar_recebimento` grava o vencimento das parcelas mas não o `data_vencimento` do CABEÇALHO do lançamento (LAN-2026-0003 header=NULL). As 3 telas de "-" leem o cabeçalho.
- **#3:** `trilhaOrdem`/etc. puxam audit das tabelas-filhas (`oc_itens`, parcelas, rateios); com o helper novo cada INSERT vira "{Entidade} criada" → duplica.
- **#4:** cancelar a OC deixa o cabeçalho do lançamento `cancelado` mas a PARCELA fica `pendente`; a fila de aprovação lê parcelas → parcela de lançamento cancelado aparece.
- **#8:** o seletor de insumo já filtra `ativo=true`; o insumo problemático está `ativo=true` no banco (desativado só no nome) → fix de DADO.

---

## Task 1: Bug #1 — corrigir dados das condições multi-parcela (equal split)

**Files:** Create `supabase/migrations/<ts>_condicoes_multiparcela_fix.sql`.

- [ ] **Step 1: Confirmar as condições afetadas** (MCP execute_sql)
`select cp.id, cp.descricao, count(p.id) n from condicoes_pagamento cp left join condicao_parcelas p on p.condicao_id=cp.id group by cp.id,cp.descricao having cp.descricao ~ '/' order by cp.descricao;` — pegar as com "/" e 1 parcela. Hoje: "30/60 dias" e "30/60/90 dias".

- [ ] **Step 2: Migration corrige as parcelas via a RPC transacional existente**
Para cada condição multi ("30/60 dias" → dias 30,60 iguais 50/50; "30/60/90 dias" → dias 30,60,90 iguais 33.33/33.33/33.34, última absorve pra somar 100). Usar a função existente `salvar_condicao_parcelas(condicao_id, jsonb)` (valida soma=100, delete+insert). SQL (dentro de um `do $$ ... $$` ou selects diretos):
```sql
select public.salvar_condicao_parcelas(
  (select id from public.condicoes_pagamento where descricao='30/60 dias'),
  '[{"dias_offset":30,"percentual":50},{"dias_offset":60,"percentual":50}]'::jsonb);
select public.salvar_condicao_parcelas(
  (select id from public.condicoes_pagamento where descricao='30/60/90 dias'),
  '[{"dias_offset":30,"percentual":33.33},{"dias_offset":60,"percentual":33.33},{"dias_offset":90,"percentual":33.34}]'::jsonb);
```
(A `salvar_condicao_parcelas` exige permissão 'editar' via `tem_permissao` — rodar via `execute_sql` como service role passa; se barrar por RLS/JWT, fazer o delete+insert direto na migration, mantendo soma=100.) Aplicar via `apply_migration`. Rollback: voltar cada uma pra 1 parcela do 1º número/100%.

- [ ] **Step 3: Verificar** cada condição multi agora tem N parcelas somando 100 (execute_sql). Commit: `git add supabase/migrations/<ts>_condicoes_multiparcela_fix.sql && git commit -m "fix(compras): condições multi-parcela (30/60, 30/60/90) dividem em N parcelas"`.

---

## Task 2: Bug #1 — cadastro: auto-split igual + indicador "faltam X%"

**Files:** Modify `src/modules/cadastros/condicoes-pagamento/components/condicao-form-drawer.tsx`.

- [ ] **Step 1: Ler o form** (já tem editor de parcelas + soma ao vivo verde/vermelho, ~linhas 62-143).

- [ ] **Step 2: Auto-split igual ao adicionar/remover parcela**
Ao ADICIONAR uma parcela (e ao remover), redistribuir os percentuais igualmente entre as N parcelas (ex.: 3 → 33.33/33.33/33.34, última absorve o resto pra somar 100.00), preenchendo o campo percentual. O usuário ainda pode editar manualmente cada % depois (não re-dividir a cada digitação, só no add/remove). Reusar a lógica de "última absorve o resto" (2 casas) — pode extrair um helper puro `dividirPercentualIgual(n): number[]` em `calculo.ts` com teste.

- [ ] **Step 3: Indicador "faltam X%"**
O rodapé de soma passa a mostrar, quando ≠ 100: quanto falta ou sobra (ex.: "faltam 10,00%" em vermelho; "sobra 5,00%"; verde "100%" quando fecha). Manter a trava de submit (o schema já exige soma=100).

- [ ] **Step 4: Teste do helper** (`dividirPercentualIgual`) + portão (`typecheck/lint/test/build`). Commit: `fix(cadastros): condição divide parcelas igual por padrão e mostra quanto falta pra 100%`.

---

## Task 3: Bug #2 — recebimento grava o vencimento do cabeçalho do lançamento

**Files:** Create `supabase/migrations/<ts>_recebimento_venc_cabecalho.sql`.

- [ ] **Step 1: Ler a `fn_registrar_recebimento` VIVA** (`pg_get_functiondef`).
- [ ] **Step 2: Migration** — na `fn_registrar_recebimento`, ao gerar as parcelas, também `update lancamentos set data_vencimento = <vencimento da 1ª parcela (menor dias_offset)> where id = v_lancamento_id`. (Denormalização de resumo pro cabeçalho; as telas de resumo leem esse campo.) Aplicar via `apply_migration`, `get_advisors`. Rollback: a versão anterior da função.
- [ ] **Step 3: Verificar em banco** (novo recebimento de teste → header data_vencimento = 1ª parcela; limpar). Portão + commit: `fix(compras): recebimento preenche o vencimento do cabeçalho do lançamento`.

---

## Task 4: Bug #3 — trilha mostra só as linhas da tabela principal

**Files:** Modify `src/modules/compras/ordens/queries.ts` (`trilhaOrdem`), `src/modules/compras/cotacoes/queries.ts` (`trilhaCotacao`), `src/modules/financeiro/lancamentos/queries.ts` (`trilhaLancamento`).

- [ ] **Step 1: Ler cada trilha** — hoje `trilhaOrdem` faz `.in("tabela", ["ordens_compra","oc_itens"]).in("registro_id", idsRegistros)`. Idem cotação (com filhas) e lançamento (com parcelas/rateios).
- [ ] **Step 2: Escopar à tabela principal** — cada trilha passa a ler só `tabela = "ordens_compra"` (resp. `cotacoes`, `lancamentos`) e `registro_id = id`. Remover as tabelas-filhas do filtro (e a coleta dos ids das filhas, se vira código morto). Assim a criação registra UM evento por cabeçalho; mudanças relevantes aparecem no diff do cabeçalho (ex.: valor_total).
- [ ] **Step 3: Portão** (`typecheck/lint/test/build`; os testes do helper da trilha não mudam). Commit: `fix(trilha): trilha mostra só eventos da entidade principal (sem duplicar por item/parcela)`.

---

## Task 5: Bug #4 — cancelar parcelas junto com o lançamento + fila ignora parcela de lançamento não-ativo

**Files:** Create `supabase/migrations/<ts>_cancelar_lancamento_parcelas.sql`; Modify `src/modules/financeiro/aprovacao-pagamentos/queries.ts`.

- [ ] **Step 1: Ler o fluxo de cancelamento** — `cancelarOrdem` (`src/modules/compras/ordens/actions.ts:389+`): ver como marca o lançamento `cancelado` (inline update ou fn). E ler a query da fila `aprovacao-pagamentos/queries.ts` (como seleciona parcelas pendentes).
- [ ] **Step 2: Cancelar as parcelas ao cancelar o lançamento** — onde o lançamento vira `cancelado` (na cancelarOrdem ou numa fn), também setar as `lancamento_parcelas` daquele lançamento que estão `pendente`/`aprovado` para `cancelado` (não mexer em `pago`). Se for inline no app, fazer via update; se houver fn, ajustar a fn (ler viva antes). Migration se mexer em fn; senão, só código. Corrigir o dado atual: `update lancamento_parcelas set status='cancelado' where lancamento_id=(select id from lancamentos where numero='LAN-2026-0001') and status<>'pago';` (via migration/execute_sql).
- [ ] **Step 3: Fila filtra por lançamento ativo (defesa)** — a query da fila de aprovação passa a excluir parcelas cujo lançamento pai está `cancelado` (join em lancamentos, `l.status <> 'cancelado'`). Assim, mesmo que uma parcela escape, não aparece na fila nem no total.
- [ ] **Step 4: Verificar** (LAN-2026-0001 some da fila; total não infla). Portão + commit: `fix(financeiro): cancelar OC cancela as parcelas e a fila ignora lançamento cancelado`.

---

## Task 6: Bug #5 — OC vira "Paga" quando o lançamento é pago

**Files:** Create `supabase/migrations/<ts>_oc_status_pago.sql`; possivelmente `src/modules/compras/ordens/_shared/formato.ts` (badge) e `config`/queries se precisar do rótulo.

- [ ] **Step 1: Ler `fn_pagar_parcela` VIVA** e o check de status de `ordens_compra` (hoje inclui até `recebido`; não tem `pago`).
- [ ] **Step 2: Migration** — (a) `alter table ordens_compra drop/add check` incluindo `'pago'`; (b) em `fn_pagar_parcela`, ao pagar a ÚLTIMA parcela pendente de um lançamento de origem `oc`, atualizar a OC vinculada para `status='pago'`. (Ler a fn viva pra saber como ela identifica o lançamento e a origem; a OC é `origem_id`.) Se `fn_pagar_parcela` for genérica demais, considerar um trigger em `lancamento_parcelas` que, quando todas as parcelas de um lançamento oc ficam `pago`, seta a OC. Escolher o caminho mais seguro e explicar. Aplicar via `apply_migration`, `get_advisors`. Rollback documentado.
- [ ] **Step 3: UI** — o badge/rótulo de status da OC reconhece `pago` ("Paga"/"Concluída"), na cor de sucesso. Conferir `_shared/formato.ts` (ou onde o status da OC é rotulado) e o StatusBadge/situações.
- [ ] **Step 4: Verificar em banco** (pagar a última parcela de uma OC de teste → OC vira `pago`). Portão + commit: `feat(compras): OC vira Paga quando o lançamento é quitado`.

---

## Task 7: Bug #8 — insumo desativado sai do seletor (dado)

**Files:** (provavelmente só dado; migration/execute_sql).

- [ ] **Step 1: Confirmar** (execute_sql) o insumo `"!EM PROCESSO DE DESATIVACAO! HASTE DE ATERRAMENTO..."` está `ativo=true`. `listarInsumos` já filtra `ativo=true`, então o correto é inativar o registro.
- [ ] **Step 2: Inativar** — `update insumos set ativo=false where nome ilike '%EM PROCESSO DE DESATIVACAO%';` (via migration versionada `<ts>_inativa_insumo_desativacao.sql`, com o id específico após conferir). Rollback: `set ativo=true`. Se houver mais de um nesse padrão, listar antes.
- [ ] **Step 3: Verificar** o insumo some de `listarInsumos`. Commit: `fix(cadastros): inativa insumo marcado como em desativação (some do seletor)`.

---

## Task 8: Verificação final + preview

- [ ] **Step 1: Portão final** (limpar `.next`) `npm run typecheck && npm run lint && npm test -- --run && npm run build` — verde. `get_advisors` (security+performance) — sem aviso novo.
- [ ] **Step 2: Preview** push da branch; roteiro: refazer o fluxo com condição 30/60/90 → 3 parcelas; vencimento aparece nas telas; trilha sem duplicata; OC cancelada não infla a fila; OC paga vira "Paga"; insumo desativado fora do seletor.
- [ ] **Step 3: Merge após OK do Tiago** `git checkout main && git merge --no-ff fix-qa-compras ... && git push origin main`.

---

## Self-review (feito ao escrever)
- **Cobertura:** #1 dado (T1) + cadastro auto-split/faltam% (T2); #2 header venc (T3); #3 trilha escopo (T4); #4 cancelar parcelas + fila (T5); #5 OC paga (T6); #8 insumo dado (T7); verificação (T8). Os improvements #6/#7/#9/#10/#11 NÃO entram neste batch (decisão do Tiago: 4 bugs + #5 + #8).
- **Placeholders:** as fns vivas (fn_registrar_recebimento, fn_pagar_parcela, cancelarOrdem, query da fila) têm Step de "ler viva antes"; os `<ts>` são timestamps a preencher. Sem TODO solto.
- **Consistência:** `salvar_condicao_parcelas(uuid,jsonb)` reusada (T1) é a mesma da feature de condições; `dividirPercentualIgual` (T2) novo e testado; status `pago` da OC (T6) alinhado ao rótulo da UI.
