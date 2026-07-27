# Atestado abate ponto (#14) — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, tarefa a tarefa. Passos usam checkbox (`- [ ]`).

**Goal:** Atestado com período (início/fim) em Ausências, e o ponto abatendo a falta sozinho: dia coberto por atestado vem pré-marcado `atestado` + 0h (encarregado confirma). Sem inventar regra trabalhista; sem mexer na folha.

**Architecture:** `rh_ocorrencias.data_fim` (expand-only) pro período do atestado. `fn_atestados_ponto(data)` SECURITY DEFINER gateada por `rh.apontamentos` (evita o furo de RLS do Bloco 4). Lógica pura `atestadoCobre`. Ausências ganha início/fim no form/queries; ponto pré-marca atestado nos dias cobertos. Migrations via MCP no projeto vivo `vsesgvqjgqpapoxhnbqx`, lendo o vivo antes.

**Tech Stack:** Next.js 16 (TS strict), Supabase (RLS) via MCP, RHF+Zod, Vitest, canônicos. Branch: `feat-rh-atestado`.

Spec: `docs/superpowers/specs/2026-07-27-rh-atestado-design.md`.

## Global Constraints
- Não inventar regra trabalhista além do que o Tiago deu (atestado = período; dia coberto = tipo `atestado` + 0h, abonado, não é falta; automático com confirmação). Nada de folha/INSS/CID aqui.
- **RLS-cross:** o ponto lê atestado SÓ via `fn_atestados_ponto` (definer, gate `rh.apontamentos`), nunca leitura direta de `rh_ocorrencias` — senão Apontador/RH veem "sem atestado" falso (lição do Bloco 4).
- RLS/grants/permissão tripla; auditoria. `data_fim` nullable + check `>= data`; só atestado usa o fim. Datas `date`, sem TZ shift.
- Portão por tarefa: typecheck/lint/build verdes; testes existentes verdes; sem any novo, sem console.log. Ambiente: limpar `.next` dup antes do typecheck. Commit termina com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 1: DB — `data_fim` em rh_ocorrencias + `fn_atestados_ponto`

**Files:** Create `supabase/migrations/<ts>_ocorrencia_data_fim.sql`, `supabase/migrations/<ts>_fn_atestados_ponto.sql`; Modify `src/lib/database.types.ts` (regen).

**Interfaces:**
- Produces: `rh_ocorrencias.data_fim date`; `fn_atestados_ponto(p_data date) returns table(colaborador_id uuid)`.

- [ ] **Step 1: Ler o vivo** — `pg_get_functiondef('public.fn_jornadas_ponto'::regproc)` pra copiar EXATO o estilo da fn definer (security definer, set search_path='', gate `tem_permissao(...)`, revoke public/anon, grant authenticated). Confirmar colunas de `rh_ocorrencias` (data, tipo, colaborador_id) e o check de tipo (inclui 'atestado').

- [ ] **Step 2: Migration `data_fim`** — `alter table public.rh_ocorrencias add column data_fim date;` + `alter table public.rh_ocorrencias add constraint rh_ocorrencias_data_fim_check check (data_fim is null or data_fim >= data);`. Aplicar via `apply_migration`. Rollback: drop constraint + drop column.

- [ ] **Step 3: Migration `fn_atestados_ponto`** —
```sql
create or replace function public.fn_atestados_ponto(p_data date)
returns table(colaborador_id uuid)
language sql security definer set search_path = '' as $$
  select o.colaborador_id
  from public.rh_ocorrencias o
  where o.tipo = 'atestado'
    and p_data between o.data and coalesce(o.data_fim, o.data)
    and public.tem_permissao('rh.apontamentos', 'ver')
$$;
revoke all on function public.fn_atestados_ponto(date) from public, anon;
grant execute on function public.fn_atestados_ponto(date) to authenticated;
```
Aplicar via `apply_migration`; `get_advisors` (o WARN genérico de SECURITY DEFINER na fn nova é esperado). Rollback: drop function.

- [ ] **Step 4: Verificar + regen tipos** — em banco (begin/rollback): inserir um atestado de período (ex. colaborador X, data 2026-03-12, data_fim 2026-03-14) e conferir `fn_atestados_ponto('2026-03-13')` traz X, `'2026-03-15'` não; reverter. `generate_typescript_types` → `database.types.ts`. Limpar `.next` dup; `typecheck`. Commit: `feat(db): período de atestado + fn_atestados_ponto`.

---

## Task 2: Ausências — período do atestado (backend + UI) + lógica pura

**Files:** Modify `src/modules/rh/ocorrencias/{schemas,queries,actions}.ts`, `components/ocorrencia-form-drawer.tsx`, `components/ocorrencias-tabela.tsx` (e a lista, se houver); Create `src/modules/rh/ocorrencias/atestado.ts` (+ teste).

**Interfaces:**
- Produces: `atestadoCobre(inicioISO, fimISO|null, diaISO): boolean`.

- [ ] **Step 1: Ler** `rh/ocorrencias/*` atuais (schema/queries/actions/form/tabela) e como o tipo `atestado` é tratado; o padrão de data opcional do projeto.

- [ ] **Step 2: Lógica pura (falha primeiro)** — `atestado.ts`: `atestadoCobre(inicio, fim, dia)` = `inicio <= dia <= (fim ?? inicio)` (strings yyyy-MM-dd). Teste Vitest: dentro; borda início; borda fim; fora (antes/depois); fim null → só o início. FAIL → implementar → PASS.

- [ ] **Step 3: Schema/queries/actions** — `schemas.ts`: adicionar `dataFim` (data opcional; string vazia → null); refine: se preenchida, `dataFim >= data`. (O "atestado exige fim" pode ser suave — recomendável exigir fim só quando tipo=atestado; se preferir, deixe opcional e trate null como 1 dia.) `queries.ts`/`actions.ts`: ler/gravar `data_fim`.

- [ ] **Step 4: UI** — `ocorrencia-form-drawer.tsx`: quando `tipo === 'atestado'`, mostrar **Início** (a `data`) + **Fim** (`dataFim`); nos outros tipos, só a `data` (esconde o fim, grava null). `ocorrencias-tabela.tsx`: quando atestado com `data_fim`, exibir o período ("12/03/2026 a 14/03/2026"); senão a data única. Datas via o formatador (America/Rio_Branco).

- [ ] **Step 5: Portão + commit** — `typecheck/lint/test/build`. Commit: `feat(rh): atestado com período de início e fim`.

---

## Task 3: Ponto — abono automático do atestado

**Files:** Modify `src/modules/rh/apontamentos/queries.ts` (trazer cobertura de atestado), `components/apontamento-form-drawer.tsx`.

- [ ] **Step 1: Ler** o `apontamento-form-drawer.tsx` (como o Total/split do Bloco 4 funciona, como a data do ponto e o colaborador chegam) e a query que lista os colaboradores do ponto (`listarColaboradoresComJornada`). Ver a assinatura de `fn_atestados_ponto`.

- [ ] **Step 2: Query traz a cobertura** — na query do ponto (por data), chamar `supabase.rpc("fn_atestados_ponto", { p_data: dataDoPonto })` e expor, por colaborador, um flag `temAtestado` (ou devolver o set e o form consulta). Documentar. (Se `listarColaboradoresComJornada` não recebe a data hoje, ajustar pra receber a data do ponto; senão, buscar o set na page e passar.)

- [ ] **Step 3: Form pré-marca** — `apontamento-form-drawer.tsx`: ao adicionar/abrir um colaborador com `temAtestado` no dia do ponto, **pré-marcar `tipo = 'atestado'`, Total = 0, horasNormais = 0, horasExtras = 0**, com um aviso visível "Atestado neste dia" (badge/texto). O encarregado confirma (pode trocar o tipo). Se já existe apontamento salvo divergente (ex. tipo normal com horas), NÃO sobrescreve — só sinaliza a divergência. Não aplicar o split do Bloco 4 quando for atestado.

- [ ] **Step 4: Portão + validação local** — limpar `.next` dup; `typecheck/lint/test/build`; `npm run dev`: registrar um atestado de período pra um colaborador; abrir o ponto de um dia coberto e ver ele vir `atestado`/0h. Commit: `feat(rh): ponto marca atestado automático nos dias cobertos`.

---

## Task 4: Verificação final + preview

- [ ] **Step 1: Portão final** (limpar `.next`) `typecheck/lint/test/build` verde; `get_advisors` sem novo (fora o WARN esperado da fn definer nova).
- [ ] **Step 2: Preview** push; roteiro: em Ausências, criar um atestado de 3 dias pra um colaborador; abrir o ponto de um dia dentro do período → o colaborador vem `atestado`/0h (confirma); um dia fora → normal; conferir que a lista de Ausências mostra o período.
- [ ] **Step 3: Merge após OK do Tiago** `git checkout main && git merge --no-ff feat-rh-atestado ... && git push origin main`.

---

## Self-review (feito ao escrever)
- **Cobertura do spec:** data_fim + fn_atestados_ponto (T1); ausências com período + atestadoCobre (T2); ponto pré-marca atestado/0h via a fn (T3); verificação (T4). Fora de escopo (folha/INSS/CID, criar ponto sozinho) não entra. Coberto.
- **Placeholders:** fn viva (fn_jornadas_ponto) e os arquivos de ocorrências/ponto têm "ler antes"; `<ts>` = timestamp. Sem TODO solto.
- **Consistência:** `data_fim` (T1) usado no schema/form/tabela (T2) e na fn (T1/T3); `fn_atestados_ponto` (T1) consumida pela query do ponto (T3); `atestadoCobre` (T2) pura; o abono é tipo `atestado`+0h coerente com o split do Bloco 4 (não aplica split em atestado); RLS-cross resolvido pela fn definer.
