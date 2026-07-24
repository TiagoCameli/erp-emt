# Painel de alertas de RH (#15) — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, tarefa a tarefa. Passos usam checkbox (`- [ ]`).

**Goal:** Aba `/rh/alertas` (read-only) que junta num lugar só os alertas de RH espalhados: docs/ASO vencendo, férias a vencer, EPI a recolher de inativo, e cadastro incompleto (salário/banco).

**Architecture:** Recurso novo `rh.alertas` (1ª aba do RH) + seed de permissão. Backend com cálculo puro testável + queries enxutas (reusando a `situacao` já testada de docs/férias; query dedicada pra EPI e pra cadastro incompleto). UI: rota Server Component gateando cada categoria por permissão da fonte, faixa de KPICards + seção por categoria com links pro registro. Migration via MCP no projeto vivo `vsesgvqjgqpapoxhnbqx`.

**Tech Stack:** Next.js 16 (TS strict), Supabase (RLS) via MCP, Vitest, canônicos (KPICard/SecaoDetalhe/StatusBadge/SkeletonPagina/PageHeader). Branch: `feat-rh-alertas`.

Spec: `docs/superpowers/specs/2026-07-24-rh-alertas-design.md`.

## Global Constraints
- Read-only: sem mutação/ação; resolver continua na aba de origem.
- Permissão tripla: RLS nas fontes (já existe) + Server Component checa `rh.alertas` ver e cada categoria por `temPermissao("<fonte>","ver")` + UI esconde. Recurso semeado em `perfil_permissoes` E `usuario_permissoes` (senão a aba não aparece).
- Não inventar regra: reusar a `situacao` de `listarDocumentos`/`listarFerias` (não reimplementar). "Sem salário" exclui vínculo pago por diária (ler valores de `vinculo` no banco vivo).
- Datas em America/Rio_Branco; sem valores monetários no painel. Toda rota nova tem `loading.tsx`.
- Migrations via MCP `apply_migration` + `.sql` versionado; `get_advisors` depois; ler estado vivo antes. Ambiente: limpar `.next` dup antes do typecheck (`find .next -name "* [0-9].ts" -delete; find .next -name "* [0-9].tsx" -delete`).
- Portão por tarefa: typecheck/lint/build verdes; testes existentes verdes; sem any novo, sem console.log.
- Componentes canônicos primeiro. Commit termina com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 1: Recurso `rh.alertas` + seed de permissão

**Files:** Modify `src/config/recursos.ts`; Create `supabase/migrations/<ts>_perm_rh_alertas.sql`.

**Interfaces:**
- Produces: recurso `rh.alertas` (id, nome "Alertas", modulo "rh", rota "/rh/alertas", acoes ["ver"]) disponível pra TabNav e `temPermissao`.

- [ ] **Step 1: Recurso** — em `src/config/recursos.ts`, inserir como **PRIMEIRO** item do bloco RH (imediatamente antes de `rh.apontamentos`):
```ts
{
  id: "rh.alertas",
  nome: "Alertas",
  modulo: "rh",
  rota: "/rh/alertas",
  acoes: ["ver"],
},
```

- [ ] **Step 2: Ler o seed vivo** (MCP execute_sql, projeto `vsesgvqjgqpapoxhnbqx`): quais perfis têm `rh.documentos`/`ver` em `perfil_permissoes`, e como `usuario_permissoes` é sincronizado (quais usuários têm). Espelhar exatamente pro `rh.alertas`.

- [ ] **Step 3: Migration** — `supabase/migrations/<ts>_perm_rh_alertas.sql`: inserir `rh.alertas`/`ver` em `perfil_permissoes` pros MESMOS perfis que já têm `rh.documentos`/`ver`, e sincronizar `usuario_permissoes` pros mesmos usuários. Idempotente `on conflict do nothing`. Rollback documentado (delete de `rh.alertas` nas duas tabelas). Aplicar via `apply_migration`; `get_advisors` (sem novo). Verificar que o Tiago/o perfil passou a ter `rh.alertas` ver.

- [ ] **Step 4: Portão + commit** — `recursos.test.ts` continua verde (rodar); `typecheck/lint`. Commit: `feat(rh): recurso e permissão do painel de alertas`.

---

## Task 2: Backend — cálculo puro + queries das 4 categorias

**Files:** Create `src/modules/rh/alertas/calculo.ts` + `calculo.test.ts`, `queries.ts`.

**Interfaces:**
- Consumes: `listarDocumentos()` e `listarFerias()` (de `rh/documentos/queries` e `rh/ferias/queries`) — retornam `situacao` já calculada.
- Produces (cálculo puro):
  - `type Urgencia = "critico" | "aviso"` (critico = vermelho: vencido/vencida/EPI a recolher; aviso = âmbar: a_vencer).
  - `urgenciaDocumento(situacao: SituacaoDocumento): Urgencia | null` (vencido→critico, a_vencer→aviso, senão null).
  - `urgenciaFerias(situacao: SituacaoFerias): Urgencia | null` (vencida→critico, a_vencer→aviso, senão null).
  - `cadastroFaltando(c: { ativo: boolean; vinculo: string; salario: number | null; banco: string | null; chavePix: string | null; pagoPorDiaria: boolean }): { semSalario: boolean; semBanco: boolean }` — semSalario = ativo && !pagoPorDiaria && (salario == null || salario === 0); semBanco = ativo && !banco && !chavePix.
  - `contarPorUrgencia(urgencias: (Urgencia | null)[]): { critico: number; aviso: number; total: number }`.
  - `corKpi(contagem: { critico: number; aviso: number }): "critico" | "aviso" | "neutro"` (tem critico→critico; senão tem aviso→aviso; senão neutro).
- Produces (queries):
  - `type AlertaDocumento = { id; colaboradorId; colaboradorNome; descricao; tipo; dataVencimento; situacao; urgencia }`
  - `type AlertaFerias = { id; colaboradorId; colaboradorNome; limiteGozo; situacao; urgencia }`
  - `type AlertaEpi = { id; colaboradorId; colaboradorNome; descricao; ca; quantidade; dataEntrega }`
  - `type AlertaCadastro = { colaboradorId; colaboradorNome; semSalario: boolean; semBanco: boolean }`
  - `listarAlertasDocumentos(): Promise<AlertaDocumento[]>`, `listarAlertasFerias(): Promise<AlertaFerias[]>`, `listarAlertasEpiRecolher(): Promise<AlertaEpi[]>`, `listarAlertasCadastro(): Promise<AlertaCadastro[]>`.

- [ ] **Step 1: Ler o vivo** — os valores reais da coluna `colaboradores.vinculo` (MCP: `select distinct vinculo from colaboradores`) pra definir quais são "pagos por diária" (ex.: 'diarista'). Confirmar as colunas `salario`, `banco`, `chave_pix`, `ativo`, `vinculo` existem.

- [ ] **Step 2: Teste do cálculo (falha primeiro)** — `calculo.test.ts` cobrindo `urgenciaDocumento`/`urgenciaFerias` (cada situacao → critico/aviso/null), `cadastroFaltando` (ativo CLT sem salário → semSalario true; diarista sem salário → semSalario false; inativo → ambos false; sem banco e sem pix → semBanco true; com pix → semBanco false), `contarPorUrgencia` e `corKpi`. Rodar → FAIL.

```ts
// exemplos-chave do calculo.test.ts
expect(urgenciaDocumento("vencido")).toBe("critico");
expect(urgenciaDocumento("a_vencer")).toBe("aviso");
expect(urgenciaDocumento("ok")).toBeNull();
expect(cadastroFaltando({ ativo: true, vinculo: "clt", salario: null, banco: null, chavePix: null, pagoPorDiaria: false })).toEqual({ semSalario: true, semBanco: true });
expect(cadastroFaltando({ ativo: true, vinculo: "diarista", salario: null, banco: "x", chavePix: null, pagoPorDiaria: true })).toEqual({ semSalario: false, semBanco: false });
expect(cadastroFaltando({ ativo: false, vinculo: "clt", salario: null, banco: null, chavePix: null, pagoPorDiaria: false })).toEqual({ semSalario: false, semBanco: false });
expect(corKpi({ critico: 0, aviso: 2 })).toBe("aviso");
expect(corKpi({ critico: 0, aviso: 0 })).toBe("neutro");
```

- [ ] **Step 3: Implementar `calculo.ts`** (funções puras acima). Rodar → PASS.

- [ ] **Step 4: queries.ts** —
  - `listarAlertasDocumentos`: `await listarDocumentos()`, filtra `situacao in ('vencido','a_vencer')`, mapeia com `urgenciaDocumento`, ordena crítico antes de aviso e por `dataVencimento` asc.
  - `listarAlertasFerias`: `await listarFerias()`, filtra `situacao in ('vencida','a_vencer')`, mapeia com `urgenciaFerias`, ordena crítico antes de aviso e por `limiteGozo` asc.
  - `listarAlertasEpiRecolher`: query dedicada `rh_epis` select `id, colaborador_id, descricao, ca, quantidade, data_entrega, colaboradores!inner(nome, ativo)` com `.is("data_devolucao", null).eq("colaboradores.ativo", false)`, ordena por `data_entrega` asc.
  - `listarAlertasCadastro`: `colaboradores` select `id, nome, vinculo, salario, banco, chave_pix, ativo` com `.eq("ativo", true)`, aplica `cadastroFaltando` (pagoPorDiaria derivado do vinculo lido no Step 1), retorna só quem tem `semSalario || semBanco`.
  - Cada query respeita RLS (client server padrão). Sem `any`.

- [ ] **Step 5: Portão + commit** — `typecheck/lint/test` (novos testes verdes). Commit: `feat(rh): backend do painel de alertas`.

---

## Task 3: UI — aba `/rh/alertas` (KPIs + seções + links)

**Files:** Create `src/app/(app)/rh/alertas/page.tsx`, `src/app/(app)/rh/alertas/loading.tsx`; `src/modules/rh/alertas/components/painel-alertas.tsx`.

**Interfaces:**
- Consumes: `listarAlertasDocumentos/Ferias/EpiRecolher/Cadastro`, `contarPorUrgencia`/`corKpi`, `temPermissao`.

- [ ] **Step 1: Ler padrões** — um `page.tsx` de Server Component do RH (ex. `src/app/(app)/rh/documentos/page.tsx`) pro padrão de checagem de permissão + carregamento; `KPICard`, `SecaoDetalhe`, `StatusBadge`, `PageHeader`, `SkeletonPagina` (props); e como a ficha do colaborador (`ficha-colaborador.tsx`) monta seções gateadas por permissão e o "ver tudo", pra espelhar.

- [ ] **Step 2: `loading.tsx`** — `export default function Loading() { return <SkeletonPagina /> }`.

- [ ] **Step 3: `page.tsx`** — Server Component: obtém usuário; se não tem `rh.alertas`/`ver` → `notFound()`. Para cada categoria, checa `temPermissao(usuario, "<fonte>", "ver")` e só então chama a query correspondente (senão passa `null`). Fontes: docs→`rh.documentos`, férias→`rh.ferias`, epi→`rh.epis`, cadastro→`cadastros.colaboradores`. Passa os resultados pro `PainelAlertas`.

- [ ] **Step 4: `painel-alertas.tsx`** (Server Component, sem "use client") — recebe as 4 listas (cada uma pode ser `null` = sem permissão). `PageHeader` (título "Alertas de RH"). Faixa de `KPICard` (um por categoria não-null, com contagem via `contarPorUrgencia` e cor via `corKpi`). Uma `SecaoDetalhe` (variante card) por categoria não-null e não-vazia, listando os itens mais urgentes (colaborador, o que vence/falta, `StatusBadge` com situação/dias ou "Recolher"/"Sem salário"/"Sem banco"), cada linha um `Link` pro registro na aba de origem (`/rh/documentos`, `/rh/ferias`, `/rh/epis`, `/cadastros/colaboradores/[id]`), com "ver tudo" pra aba. Empty por categoria ("Nenhum ... vencendo/a recolher/pendente"). Empty geral: se todas as categorias visíveis somam 0, um `EmptyState`/mensagem única "Nenhum alerta de RH no momento". Datas via `formatarData` (America/Rio_Branco). Sem valor monetário.

- [ ] **Step 5: Portão + validação local** — limpar `.next` dup; `typecheck/lint/test/build`; `npm run dev`: abrir `/rh/alertas`, ver as categorias que o usuário pode; conferir que uma categoria some ao remover a permissão da fonte (raciocinar/testar). Commit: `feat(rh): aba painel de alertas de RH`.

---

## Task 4: Verificação final + preview

- [ ] **Step 1: Portão final** (limpar `.next`) `typecheck/lint/test/build` verde; `get_advisors` sem novo.
- [ ] **Step 2: Preview** push da branch; roteiro: abrir `/rh/alertas`; confirmar que os KPIs batem com as abas de origem (docs vencendo, férias a vencer, EPI de inativo, colaborador ativo sem salário/banco); clicar num item e cair no registro certo.
- [ ] **Step 3: Merge após OK do Tiago** `git checkout main && git merge --no-ff feat-rh-alertas ... && git push origin main`.

---

## Self-review (feito ao escrever)
- **Cobertura do spec:** aba+recurso+permissão (T1); cálculo puro testado + as 4 queries enxutas reusando situacao (T2); rota gateada por categoria + KPIs/seções/links read-only + empty geral (T3); verificação (T4). Fora de escopo (ocorrências, adiantamentos, resolver na tela, notificação) não entra. Coberto.
- **Placeholders:** fontes vivas (vinculo, seed de permissão) têm "ler antes"; `<ts>` = timestamp. Sem TODO solto.
- **Consistência:** `rh.alertas` (T1) usado no gate da rota (T3); `urgenciaDocumento`/`urgenciaFerias`/`cadastroFaltando`/`contarPorUrgencia`/`corKpi` definidos na T2 e usados na T2/T3; as 4 `listarAlertasX` definidas na T2 e consumidas na T3; recursos das fontes (rh.documentos/ferias/epis, cadastros.colaboradores) batem com o gate por categoria.
