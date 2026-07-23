# Condições de pagamento estruturadas + vencimento no recebimento — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa a tarefa. Passos usam checkbox (`- [ ]`).

**Goal:** Condições de pagamento com parcelas (dias + %) que, ao registrar o recebimento da NF dentro da própria OC, geram as parcelas do contas a pagar com vencimento = data da NF + prazo; e criação da OC transacional (trilha limpa).

**Architecture:** Primeiro o banco (tabela de parcelas + validação, depois a troca texto→FK com migração de dados, ambos via MCP no projeto vivo com fix+rollback). Depois o cadastro de condições (backend + UI canônica). Depois OC/cotação passam a referenciar condição por id. Depois o recebimento como ação na OC evoluindo a RPC existente. Por fim a criação transacional da OC. Cada tarefa deixa o app verde.

**Tech Stack:** Next.js 16 (App Router, TS strict), Supabase (Postgres 17, RLS) via MCP, RHF+Zod, Tailwind v4 + shadcn/ui, Vitest. Branch: `feat-condicoes-vencimento`.

Spec: `docs/superpowers/specs/2026-07-22-condicoes-pagamento-vencimento-design.md`.

## Global Constraints

- **RLS em 100% das tabelas novas** + grants explícitos (só o que a policy permite; `anon` nada) + trigger de auditoria. Permissão tripla (RLS + Server Action + UI).
- **Migrations via MCP `apply_migration`** no projeto `vsesgvqjgqpapoxhnbqx`, `name` = nome completo do arquivo, e `.sql` versionado em `supabase/migrations/`. **Antes de cada migration destrutiva: escrever fix.sql + rollback.sql e mapear/backfill os dados antes de dropar coluna.** Rodar `get_advisors` (security+performance) depois e corrigir o que aparecer.
- **Ler a definição VIVA** (`select pg_get_functiondef(...)` / `select ... ` via MCP `execute_sql`) de qualquer função/trigger antes de alterar — o repo pode divergir do banco.
- **Dinheiro NUMERIC(14,2)** — soma das parcelas fecha exatamente com o valor da NF (última parcela absorve o centavo). Quantidade NUMERIC(14,3). Timezone America/Rio_Branco na exibição; datas `date`.
- **Componentes canônicos** (`FormDrawer`, `DataTable`, `CampoFormulario`, `LinhaCampos`, `TabelaItens`, `Combobox`, `SkeletonPagina`, `MoneyText`). Import de `@/components/canonicos`. Toda rota nova tem `loading.tsx` (usa `SkeletonPagina`).
- **Portão por tarefa:** `npm run typecheck`, `npm run lint`, `npm run build` verdes; testes existentes verdes; sem `any` novo, sem `console.log`. (Obs. ambiente: limpar duplicatas do iCloud antes do typecheck — `find .next -name "* [0-9].ts" -delete; find .next -name "* [0-9].tsx" -delete`.)
- **Todo commit termina com** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 1: Tabela `condicao_parcelas` + validação (migration)

**Files:**
- Create: `supabase/migrations/<ts>_condicao_parcelas.sql` (aplicar via MCP)
- Create (scratch, não versionar código): rollback documentado no corpo da migration como comentário

**Interfaces:**
- Produces: tabela `public.condicao_parcelas(id, condicao_id, numero, dias_offset, percentual, created_at)`; função `public.salvar_condicao_parcelas(p_condicao_id uuid, p_parcelas jsonb)` (security definer) que faz delete+insert das parcelas numa transação e valida soma = 100.

- [ ] **Step 1: Ler o padrão vivo de RLS/grants/auditoria de `condicoes_pagamento`**

Via MCP `execute_sql`: `select pg_get_functiondef(oid) from pg_proc where proname = 'fn_auditoria';` (ou o nome do trigger de auditoria do projeto) e as policies de `condicoes_pagamento` (`select polname, ... from pg_policies where tablename='condicoes_pagamento'`). Espelhar esse padrão. Ver também `supabase/migrations/20260721170001_condicoes_pagamento.sql`.

- [ ] **Step 2: Escrever a migration**

```sql
-- condicao_parcelas: parcelas de uma condição de pagamento (dias + % do total).
create table public.condicao_parcelas (
  id uuid primary key default gen_random_uuid(),
  condicao_id uuid not null references public.condicoes_pagamento(id) on delete cascade,
  numero int not null check (numero >= 1),
  dias_offset int not null check (dias_offset >= 0),
  percentual numeric(5,2) not null check (percentual > 0 and percentual <= 100),
  created_at timestamptz not null default now(),
  unique (condicao_id, numero)
);
create index idx_condicao_parcelas_condicao on public.condicao_parcelas (condicao_id);

alter table public.condicao_parcelas enable row level security;

-- SELECT: quem vê o cadastro de condições vê as parcelas.
create policy condicao_parcelas_select on public.condicao_parcelas
  for select to authenticated
  using (public.tem_permissao('cadastros.condicoes-pagamento','ver'));
-- INSERT/UPDATE/DELETE só via função definer (salvar_condicao_parcelas);
-- sem grants de escrita diretos para authenticated.
grant select on public.condicao_parcelas to authenticated;

-- Auditoria: anexar o trigger padrão do projeto (nome real conferido no Step 1).
create trigger trg_audit_condicao_parcelas
  after insert or update or delete on public.condicao_parcelas
  for each row execute function public.<fn_auditoria_do_projeto>();

-- Salva as parcelas de uma condição numa transação, validando soma = 100.
create or replace function public.salvar_condicao_parcelas(
  p_condicao_id uuid, p_parcelas jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare v_soma numeric(6,2);
begin
  if not public.tem_permissao('cadastros.condicoes-pagamento','editar') then
    raise exception 'Sem permissão para editar condições de pagamento';
  end if;
  select coalesce(sum((p->>'percentual')::numeric),0) into v_soma
    from jsonb_array_elements(p_parcelas) p;
  if round(v_soma,2) <> 100.00 then
    raise exception 'A soma dos percentuais das parcelas deve ser 100 (recebido %)', v_soma;
  end if;
  delete from public.condicao_parcelas where condicao_id = p_condicao_id;
  insert into public.condicao_parcelas (condicao_id, numero, dias_offset, percentual)
  select p_condicao_id,
         row_number() over (order by (p->>'dias_offset')::int),
         (p->>'dias_offset')::int,
         (p->>'percentual')::numeric
    from jsonb_array_elements(p_parcelas) p;
end $$;
revoke all on function public.salvar_condicao_parcelas(uuid, jsonb) from public, anon;
grant execute on function public.salvar_condicao_parcelas(uuid, jsonb) to authenticated;
```
Rollback (documentar no corpo): `drop function ...salvar_condicao_parcelas; drop table public.condicao_parcelas;`.

- [ ] **Step 3: Aplicar via MCP e rodar advisors**

`apply_migration(name: "<ts>_condicao_parcelas", query: <sql>)`. Depois `get_advisors(type: security)` e `get_advisors(type: performance)`; corrigir o que aparecer (ex.: índice em FK, `search_path`).

- [ ] **Step 4: Verificar em banco**

Via `execute_sql`: inserir uma condição de teste + `salvar_condicao_parcelas` com [{dias:0,%:50},{dias:30,%:50}] → ok; com soma 90 → erro. Limpar o teste.

- [ ] **Step 5: Commit** (só o `.sql` versionado)

```bash
git add supabase/migrations/<ts>_condicao_parcelas.sql
git commit -m "feat(db): tabela condicao_parcelas + salvar_condicao_parcelas (soma 100)"
```

---

## Task 2: EXPAND — coluna FK (nullable) + backfill + parcelas (migration ADITIVA)

**Estratégia expand-contract (decisão do Tiago):** esta migration é **aditiva e não-destrutiva** — mantém a coluna texto `condicao_pagamento` intacta para o código EM PRODUÇÃO continuar funcionando. A coluna texto só é dropada na **Task 9 (contract), depois do deploy** do código novo. Nada aqui pode quebrar o app que está no ar.

**Files:**
- Create: `supabase/migrations/<ts>_condicao_pagamento_fk_expand.sql`

**Interfaces:**
- Consumes: `condicao_parcelas` (Task 1).
- Produces: `ordens_compra.condicao_pagamento_id uuid` FK **NULLABLE**; `cotacao_fornecedores.condicao_pagamento_id uuid` FK (nullable); parcelas semeadas para as condições existentes. Colunas texto **permanecem**.

- [ ] **Step 1: Ler o estado real** (MCP `execute_sql`)

`select distinct condicao_pagamento from public.ordens_compra where condicao_pagamento is not null;` e o mesmo em `cotacao_fornecedores`; e `select id, descricao from public.condicoes_pagamento;`. Guardar para o mapeamento.

- [ ] **Step 2: Semear parcelas das condições existentes**

Para cada condição semeada, uma parcela 100%: "À vista" → dias 0; "N dias" → dias N (parse do número na descrição). SQL:
```sql
insert into public.condicao_parcelas (condicao_id, numero, dias_offset, percentual)
select c.id, 1,
       case when c.descricao ilike '%vista%' then 0
            else coalesce((regexp_match(c.descricao, '(\d+)'))[1]::int, 0) end,
       100.00
from public.condicoes_pagamento c
where not exists (select 1 from public.condicao_parcelas p where p.condicao_id = c.id);
```

- [ ] **Step 3: Garantir uma condição para cada texto usado nas transações**

```sql
insert into public.condicoes_pagamento (descricao)
select distinct condicao_pagamento from public.ordens_compra
where condicao_pagamento is not null
  and condicao_pagamento not in (select descricao from public.condicoes_pagamento)
on conflict (descricao) do nothing;
-- idem para cotacao_fornecedores
```
Repetir o Step 2 para as recém-criadas (parcela 100% pelo número/à vista). Se um texto não tiver número e não for "à vista", cai em dias 0 (registrar no log qual foi).

- [ ] **Step 4: Adicionar as colunas FK (NULLABLE) e backfill — SEM not null, SEM drop**

```sql
alter table public.ordens_compra add column condicao_pagamento_id uuid references public.condicoes_pagamento(id);
update public.ordens_compra o set condicao_pagamento_id = c.id
  from public.condicoes_pagamento c where c.descricao = o.condicao_pagamento;
-- rows sem texto recebem 'À vista' (mas a coluna segue NULLABLE nesta fase):
update public.ordens_compra set condicao_pagamento_id =
  (select id from public.condicoes_pagamento where descricao = 'À vista' limit 1)
  where condicao_pagamento_id is null;

alter table public.cotacao_fornecedores add column condicao_pagamento_id uuid references public.condicoes_pagamento(id);
update public.cotacao_fornecedores f set condicao_pagamento_id = c.id
  from public.condicoes_pagamento c where c.descricao = f.condicao_pagamento;

create index idx_ordens_compra_condicao on public.ordens_compra (condicao_pagamento_id);
create index idx_cotacao_fornecedores_condicao on public.cotacao_fornecedores (condicao_pagamento_id);
```
**NÃO** rodar `set not null` nem `drop column` aqui (isso quebraria o código em produção que ainda insere/lê a coluna texto). Isso fica na Task 9. Rollback: `drop column condicao_pagamento_id` das duas tabelas (a coluna texto nunca foi tocada).

- [ ] **Step 5: Aplicar via MCP, advisors, regenerar tipos**

`apply_migration(name: "<ts>_condicao_pagamento_fk_expand", ...)`; `get_advisors` (security+performance); `generate_typescript_types` e atualizar `src/lib/database.types.ts`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/<ts>_condicao_pagamento_fk_expand.sql src/lib/database.types.ts
git commit -m "feat(db): adiciona condicao_pagamento_id (nullable) + backfill + semeia parcelas (expand)"
```

---

## Task 3: Cadastro de condições — recurso, schema, queries, actions (backend)

**Files:**
- Modify: `src/config/recursos.ts`
- Create: `src/modules/cadastros/condicoes-pagamento/schemas.ts`, `queries.ts`, `actions.ts`
- Create: `src/modules/cadastros/condicoes-pagamento/calculo.ts` + `calculo.test.ts`

**Interfaces:**
- Produces: `condicaoPagamentoSchema` (Zod: `descricao` string, `parcelas: {diasOffset:number, percentual:number}[]` com refine soma=100 e dias sem repetir e ≥1 parcela); `listarCondicoes()`, `obterCondicao(id)`; `criarCondicao`, `editarCondicao`, `desativarCondicao` (actions com checagem `cadastros.condicoes-pagamento`), que persistem via `salvar_condicao_parcelas`.
- `dividirValorPorParcelas(valorTotal, percentuais): number[]` (puro) e `datasParcelas(dataBase, diasOffsets): string[]` (puro) para reuso no recebimento (Task 6) — ficam em `calculo.ts`.

- [ ] **Step 1: Recurso no catálogo**

Em `src/config/recursos.ts`, adicionar após `cadastros.categorias` (ou em ordem alfabética coerente):
```ts
{
  id: "cadastros.condicoes-pagamento",
  nome: "Condições de pagamento",
  modulo: "cadastros",
  rota: "/cadastros/condicoes-pagamento",
  acoes: CRUD,
},
```

- [ ] **Step 2: Teste do cálculo puro (falha primeiro)**

`calculo.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { dividirValorPorParcelas, datasParcelas } from "./calculo";

describe("dividirValorPorParcelas", () => {
  it("divide 100,00 em 3 iguais fechando exato (última absorve o centavo)", () => {
    expect(dividirValorPorParcelas(100, [33.33, 33.33, 33.34])).toEqual([33.33, 33.33, 33.34]);
  });
  it("50/50 de 1000", () => {
    expect(dividirValorPorParcelas(1000, [50, 50])).toEqual([500, 500]);
  });
  it("soma sempre bate com o total (arredondamento na última)", () => {
    const r = dividirValorPorParcelas(100, [33.33, 33.33, 33.34]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("datasParcelas", () => {
  it("soma os dias à data base (ISO)", () => {
    expect(datasParcelas("2026-07-22", [0, 30, 60])).toEqual([
      "2026-07-22", "2026-08-21", "2026-09-20",
    ]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -- --run src/modules/cadastros/condicoes-pagamento/calculo.test.ts` → FAIL (módulo não existe).

- [ ] **Step 4: Implementar `calculo.ts`**

```ts
/** Divide valorTotal pelos percentuais (2 casas); a última parcela absorve o
 *  resto para a soma fechar exatamente com valorTotal. */
export function dividirValorPorParcelas(
  valorTotal: number,
  percentuais: number[],
): number[] {
  const centavos = Math.round(valorTotal * 100);
  const valores = percentuais.map((p) => Math.round((centavos * p) / 100));
  const somaMenosUltima = valores.slice(0, -1).reduce((a, b) => a + b, 0);
  valores[valores.length - 1] = centavos - somaMenosUltima;
  return valores.map((c) => c / 100);
}

/** Datas de vencimento = dataBase (ISO yyyy-mm-dd) + cada offset em dias. */
export function datasParcelas(dataBaseISO: string, diasOffsets: number[]): string[] {
  return diasOffsets.map((dias) => {
    const d = new Date(`${dataBaseISO}T00:00:00`);
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
  });
}
```

- [ ] **Step 5: Rodar teste (passa) + escrever schemas/queries/actions**

`schemas.ts` com `condicaoPagamentoSchema` (refine: `parcelas.length >= 1`, soma dos `percentual` === 100 com tolerância 0.01, `diasOffset` sem repetição). `queries.ts` (`listarCondicoes` com contagem/resumo de parcelas; `obterCondicao`). `actions.ts` (`criarCondicao`/`editarCondicao`/`desativarCondicao` com `exigirPermissao` + persistência: cria/atualiza `condicoes_pagamento` e chama `salvar_condicao_parcelas`). Seguir o padrão de outro cadastro (ex.: `src/modules/cadastros/unidades/`).

- [ ] **Step 6: Portão + commit**

Run: `npm test -- --run src/modules/cadastros/condicoes-pagamento && npm run typecheck && npm run lint`.
```bash
git add src/config/recursos.ts src/modules/cadastros/condicoes-pagamento
git commit -m "feat(cadastros): backend das condições de pagamento (parcelas dias/%)"
```

---

## Task 4: Cadastro de condições — UI (rota, loading, tabela, form)

**Files:**
- Create: `src/app/(app)/cadastros/condicoes-pagamento/page.tsx`, `loading.tsx`
- Create: `src/modules/cadastros/condicoes-pagamento/components/condicoes-tabela.tsx`, `condicao-form-drawer.tsx`

**Interfaces:**
- Consumes: queries/actions/schemas da Task 3; canônicos.

- [ ] **Step 1: Rota + loading**

`page.tsx` (Server Component: checa permissão de ver, lista via `listarCondicoes`, renderiza a tabela). `loading.tsx`:
```tsx
import { SkeletonPagina } from "@/components/canonicos";
export default function Loading() { return <SkeletonPagina />; }
```

- [ ] **Step 2: Tabela + form**

`condicoes-tabela.tsx` com `DataTable` (colunas: descrição, resumo das parcelas ex. "0/30/60 (50/25/25%)", nº parcelas, ativo, ações). `condicao-form-drawer.tsx` com `FormDrawer` (tela cheia), `CampoFormulario` para descrição e `TabelaItens` para as parcelas (colunas nº/dias/percentual), botão adicionar parcela, e um rodapé mostrando a soma dos % (verde quando 100, vermelho quando ≠). RHF + Zod (schema da Task 3), action no submit.

- [ ] **Step 3: Portão + validação visual local**

`npm run typecheck && npm run lint && npm run build`. `npm run dev`: criar "30/60/90 iguais" e "Entrada 50 + 30 dias"; conferir a trava de soma 100.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/cadastros/condicoes-pagamento" src/modules/cadastros/condicoes-pagamento/components
git commit -m "feat(cadastros): tela de condições de pagamento com editor de parcelas"
```

---

## Task 5: OC e cotação escolhem condição por id

**Files:**
- Modify: `src/modules/compras/ordens/schemas.ts`, `queries.ts`, `actions.ts`, `components/ordem-form-drawer.tsx`, `components/ordem-detalhe.tsx`
- Modify: `src/modules/compras/cotacoes/schemas.ts`, `queries.ts`, `actions.ts`, `components/fornecedor-cotacao-drawer.tsx`

**Interfaces:**
- Consumes: FK `condicao_pagamento_id` (Task 2); `listarCondicoes` (Task 3).
- Produces: OC exige `condicaoPagamentoId`; cotação aceita opcional.

**Nota expand-contract:** o app passa a exigir `condicaoPagamentoId` (Zod obrigatório na OC) e a gravar SÓ a FK, mesmo com a coluna texto ainda existindo no banco (fase expand). Não escrever mais `condicao_pagamento` (texto) em lugar nenhum do código novo; a coluna some na Task 9. A coluna FK no banco segue NULLABLE até a Task 9 — a obrigatoriedade é garantida pelo app até lá.

- [ ] **Step 1: Schemas**

Trocar `condicaoPagamento: textoOpcional(120)` por `condicaoPagamentoId: z.uuid({ error: "Escolha a condição de pagamento" })` na OC (obrigatório) e `z.uuid().optional()` na cotação. Atualizar os testes de schema.

- [ ] **Step 2: Queries/actions**

`cabecalhoParaRegistro` (OC) grava `condicao_pagamento_id`. Queries passam a trazer a condição (id + descrição) via join. Passar a lista de condições ativas para os forms (nova query ou reuso de `listarCondicoes`).

- [ ] **Step 3: Forms**

`ordem-form-drawer`: o campo condição vira `Combobox` (por id) das condições ativas, obrigatório (marca `*`, erro do RHF). `fornecedor-cotacao-drawer`: idem, opcional. Remover o `ComboboxCriavel`/criação inline de texto (criar condição é no cadastro). `ordem-detalhe` mostra a descrição da condição.

- [ ] **Step 4: Portão + commit**

`npm run typecheck && npm run lint && npm test -- --run src/modules/compras && npm run build`.
```bash
git add src/modules/compras
git commit -m "feat(compras): OC e cotação selecionam condição de pagamento por id (obrigatória na OC)"
```

---

## Task 6: Recebimento como ação na OC + parcelas do a_pagar

**Files:**
- Create/Apply: `supabase/migrations/<ts>_recebimento_parcelas_condicao.sql`
- Modify: `src/modules/compras/ordens/actions.ts`, `queries.ts`, `components/ordem-detalhe.tsx`
- Create: `src/modules/compras/ordens/components/recebimento-dialog.tsx`

**Interfaces:**
- Consumes: `condicao_parcelas`, `dividirValorPorParcelas`/`datasParcelas` (Task 3), FK da OC (Task 2).

- [ ] **Step 1: Ler a `fn_registrar_recebimento` VIVA** (MCP)

`select pg_get_functiondef(oid) from pg_proc where proname = 'fn_registrar_recebimento';` e o schema de `recebimentos`/`lancamento_parcelas`. Entender como hoje cria 1 parcela, pra evoluir sem quebrar.

- [ ] **Step 2: Migration — gerar parcelas pela condição**

Reescrever `fn_registrar_recebimento` para, ao confirmar o recebimento (nº NF, valor, data), gerar N `lancamento_parcelas` a partir das `condicao_parcelas` da condição da OC: `data_vencimento = data_recebimento + dias_offset`, `valor` pelo split do valor da NF por percentual (última absorve o centavo — mesma regra do `dividirValorPorParcelas`, feita em SQL). Confirmar o lançamento previsto → `a_pagar` e status da OC → `recebido`. Manter checagem de permissão e auditoria. fix + rollback; aplicar via MCP; advisors; regenerar tipos.

- [ ] **Step 3: Action + dialog**

`registrarRecebimento(ocId, {numeroNf, valorNf, dataRecebimento})` (action, checa permissão, chama a RPC). `recebimento-dialog.tsx` (`FormDrawer`/dialog canônico, RHF+Zod: nº NF texto, valor `MoneyText`/decimal, data). Em `ordem-detalhe`, botão "Registrar recebimento" visível com OC aprovada + permissão.

- [ ] **Step 4: Verificação em banco (ponta a ponta)**

Via `execute_sql`: OC com condição 30/60/90 (iguais) aprovada → `registrarRecebimento` NF R$ 3.000 → 3 parcelas a_pagar com vencimentos +30/+60/+90 da data e R$ 1.000 cada, soma 3.000; status OC = recebido.

- [ ] **Step 5: Portão + commit**

`npm run typecheck && npm run lint && npm test -- --run src/modules/compras && npm run build`.
```bash
git add supabase/migrations/<ts>_recebimento_parcelas_condicao.sql src/lib/database.types.ts src/modules/compras/ordens
git commit -m "feat(compras): recebimento na OC gera parcelas do a_pagar pela condição"
```

---

## Task 7: Criação transacional da OC (item 3 do QA — trilha limpa)

**Files:**
- Create/Apply: `supabase/migrations/<ts>_fn_criar_ordem_compra.sql`
- Modify: `src/modules/compras/ordens/actions.ts` (`criarOrdem`)

**Interfaces:**
- Consumes: FK `condicao_pagamento_id`.
- Produces: `fn_criar_ordem_compra(p_cabecalho jsonb, p_itens jsonb) returns uuid`.

- [ ] **Step 1: Ler os triggers VIVOS** (MCP)

Definição do trigger de auditoria e do trigger de `valor_total` em `ordens_compra`/`oc_itens` (`pg_get_triggerdef`, `pg_get_functiondef`). Entender a ordem em que a trilha registra hoje, pra a RPC gravar um único "criado" com o total certo (ex.: inserir itens e setar o total antes do commit, ou o insert do cabeçalho já com o total calculado dos itens).

- [ ] **Step 2: Migration — função transacional**

`fn_criar_ordem_compra` (security definer, checa `compras.ordens` criar): insere o cabeçalho (com `condicao_pagamento_id`, status rascunho), insere os itens, garante o `valor_total` final na mesma transação, devolve o id. Se o trigger de auditoria do cabeçalho dispara no insert com total 0, ajustar (ex.: preencher o total no mesmo insert a partir do jsonb dos itens, ou suprimir o log intermediário) de modo que o audit_log registre um "criado" com o total certo. fix + rollback; aplicar via MCP; advisors.

- [ ] **Step 3: `criarOrdem` chama a RPC**

Trocar os dois inserts por `supabase.rpc("fn_criar_ordem_compra", { p_cabecalho, p_itens })`. Manter o retorno `{ ok, id }` e o tratamento de erro (`erroAcao`).

- [ ] **Step 4: Verificar a trilha em banco**

`execute_sql`: criar uma OC via RPC e conferir no `audit_log` que há UM "criado" com `valor_total` final (não 0, sem "editado" logo em seguida).

- [ ] **Step 5: Portão + commit**

`npm run typecheck && npm run lint && npm test -- --run src/modules/compras && npm run build`.
```bash
git add supabase/migrations/<ts>_fn_criar_ordem_compra.sql src/modules/compras/ordens/actions.ts
git commit -m "fix(compras): criação da OC transacional (trilha limpa, total sem passar por zero)"
```

---

## Task 8: Verificação final + advisors + preview

- [ ] **Step 1: Portão FINAL do app inteiro**

Limpar duplicatas do `.next`; `npm run typecheck && npm run lint && npm test -- --run && npm run build` — tudo verde.

- [ ] **Step 2: Advisors finais**

`get_advisors(security)` e `get_advisors(performance)` no projeto; corrigir qualquer aviso novo (índice em FK, policy, search_path).

- [ ] **Step 3: Preview + roteiro de validação**

Push da branch; pegar a URL de preview. Roteiro (Tiago): criar condição "Entrada 50% + 30 dias" e "30/60/90"; OC com condição obrigatória; aprovar; registrar recebimento (NF, valor, data); ver as parcelas do a_pagar em Lançamentos com os vencimentos certos e ajustar uma data; conferir a trilha da OC limpa.

- [ ] **Step 4: Merge + deploy após o OK do Tiago, e VALIDAR em produção**

```bash
git checkout main && git merge --no-ff feat-condicoes-vencimento -m "Merge feat-condicoes-vencimento: condições estruturadas + vencimento no recebimento"
git push origin main
```
Esperar o deploy da Vercel subir e o Tiago confirmar em produção que criar OC (com condição obrigatória), aprovar e registrar recebimento funciona com o código novo. **Só depois disso** rodar a Task 9 (contract). A coluna texto ainda existe no banco neste ponto (inerte, o código novo não usa).

---

## Task 9: CONTRACT — not null + drop das colunas texto (destrutiva, SÓ pós-deploy validado)

**Só executar depois que a Task 8 Step 4 estiver no ar e validada.** Agora o código em produção já usa só a FK, então é seguro dropar a coluna texto.

**Files:**
- Create: `supabase/migrations/<ts>_condicao_pagamento_fk_contract.sql`

- [ ] **Step 1: Backfill de qualquer FK nula criada na janela + not null + drop**

```sql
-- OCs criadas entre o expand e o deploy pelo código antigo podem ter FK nula:
update public.ordens_compra o set condicao_pagamento_id = c.id
  from public.condicoes_pagamento c
  where o.condicao_pagamento_id is null and c.descricao = o.condicao_pagamento;
update public.ordens_compra set condicao_pagamento_id =
  (select id from public.condicoes_pagamento where descricao = 'À vista' limit 1)
  where condicao_pagamento_id is null;
-- checagem (deve dar 0): select count(*) from public.ordens_compra where condicao_pagamento_id is null;
alter table public.ordens_compra alter column condicao_pagamento_id set not null;

alter table public.ordens_compra drop column condicao_pagamento;
alter table public.cotacao_fornecedores drop column condicao_pagamento;
```
Rollback: re-add as colunas texto e `update` de volta pela descrição; `drop not null` na FK.

- [ ] **Step 2: Aplicar via MCP, advisors, regenerar tipos**

`apply_migration(name: "<ts>_condicao_pagamento_fk_contract", ...)`; `get_advisors`; `generate_typescript_types` → `src/lib/database.types.ts`. Rodar `typecheck`/`build` (nada no código deve mais referenciar a coluna texto).

- [ ] **Step 3: Commit + push**

```bash
git add supabase/migrations/<ts>_condicao_pagamento_fk_contract.sql src/lib/database.types.ts
git commit -m "feat(db): condicao_pagamento_id not null + drop das colunas texto (contract)"
git push origin main
```

---

## Self-review (feito ao escrever)

- **Cobertura do spec:** condicao_parcelas + validação (T1); expand FK+dados (T2, aditivo); cadastro backend+UI (T3, T4); OC/cotação por id + obrigatória (T5, resolve item 2a); recebimento na OC gera parcelas pela condição, base data NF (T6); ajuste de datas no lançamento (reusa tela existente — nada a fazer além do T6 gerar as parcelas); item 3 transacional (T7); merge+deploy+validação (T8); contract/drop pós-deploy (T9). Coberto.
- **Expand-contract:** nenhuma migration destrutiva roda antes do deploy do código novo. T2 é aditiva (mantém a coluna texto, FK nullable); T9 (drop + not null) só após a T8 validada em produção. Prod nunca quebra durante o desenvolvimento.
- **Placeholders:** as funções/triggers vivos têm Step 1 explícito de "ler ao vivo via MCP" antes de alterar (o repo pode divergir), com a transformação e os blocos novos especificados. Não há TODO solto; os `<ts>` e `<fn_auditoria_do_projeto>` são valores a preencher na hora (timestamp e nome real conferido no Step 1), sinalizados.
- **Consistência de tipos:** `condicaoPagamentoId` (uuid) usado igual em OC/cotação; `dividirValorPorParcelas`/`datasParcelas` definidos na T3 e reusados na T6; `salvar_condicao_parcelas(uuid, jsonb)` mesma assinatura em T1/T3.
