# Categoria de custo na Ordem de Compra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A categoria do custo passa a vir do insumo em vez de ser digitada na OC, e a OC que mistura categorias é rateada em vez de cair inteira numa só.

**Architecture:** O insumo ganha `categoria_financeira_id` (semeado por um mapa de 27 categorias). O rateio da OC não é armazenado: é derivado de `oc_itens` por uma função pura em TypeScript, e materializado em `lancamento_rateios` — que ganha `categoria_id` — no momento da aprovação. Um documento do fornecedor continua sendo um lançamento.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (Postgres 17, RLS, SECURITY DEFINER), Zod, React Hook Form, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-categoria-de-custo-na-oc-design.md`

## Global Constraints

- Dinheiro é `NUMERIC(14,2)`; quantidade `NUMERIC(14,3)`; `preco_unitario` é `NUMERIC(14,4)` (taxa, não valor). Float é proibido para valores.
- Toda migration aplicada pelo **MCP do Supabase (`apply_migration`)**. `supabase db push` é PROIBIDO neste projeto.
- Todo arquivo em `supabase/migrations/` tem par em `supabase/rollbacks/`.
- RLS e grants explícitos: coluna nova em tabela existente herda a policy da tabela; conferir que nenhum grant novo é necessário.
- `lancamento_rateios` e `insumos` já têm trigger de auditoria. Não recriar.
- Timezone de exibição America/Rio_Branco. Banco em UTC.
- Textos de UI em pt-BR, sentence case, voz ativa. Valores em BRL com `MoneyText` e `tabular-nums`.
- Nomes de banco em português, snake_case, sem acento.
- Todo select da UI usa o `Combobox` canônico (com busca), nunca o `Select` do shadcn.
- `tsc --noEmit`, lint e build passando. Sem `any` novo, sem `console.log`.
- **Antes de rodar typecheck:** limpar os arquivos duplicados do iCloud em `.next` (padrão `*[ ]N.ts(x)`), senão o `tsc` quebra por motivo de ambiente.
- Após cada migration, rodar `get_advisors` (security e performance) e corrigir o que aparecer.

## Ordem e dependências

Task 1 é independente e protege todas as outras. Tasks 2 e 3 são independentes entre si. Task 4 é TypeScript puro e não depende de banco. Task 5 consome 1, 2 e 3. Task 6 consome 2. Task 7 consome 2 e 4. Task 8 consome 2.

---

### Task 1: Trava de integridade do rateio

Hoje `fn_aprovar_ordem_compra` insere rateios somando apenas `quantidade * preco_unitario`, enquanto o lançamento recebe `ordens_compra.valor_total`, que **inclui** frete, outras despesas, impostos e desconto. Não existe trava nenhuma: o desvio é gravado em silêncio. Medido em 17/08/2026, seis das dezessete OCs divergiriam, a pior em **R$ 3.835,95** (OC-2026-0017, BRITAS, R$ 100.000). Esta task cria a trava primeiro, para que o conserto da Task 5 seja verificável e para que nenhum caminho futuro grave rateio torto.

**Files:**
- Create: `supabase/migrations/20260817190000_trava_soma_do_rateio.sql`
- Create: `supabase/rollbacks/20260817190000_trava_soma_do_rateio_rollback.sql`

**Interfaces:**
- Consumes: nada.
- Produces: `public.fn_valida_soma_do_rateio()` e o constraint trigger `trg_valida_soma_do_rateio` em `lancamento_rateios`, `DEFERRABLE INITIALLY DEFERRED`.

- [ ] **Step 1: Provar que o banco está limpo hoje**

A trava só pode nascer se nenhum lançamento existente já a violaria. Rodar via MCP `execute_sql`:

```sql
select count(*) violando
from lancamentos l
where l.tipo = 'a_pagar' and l.status <> 'cancelado'
  and l.valor <> coalesce(
    (select round(sum(r.valor), 2) from lancamento_rateios r where r.lancamento_id = l.id), 0);
```

Esperado: `violando = 0`. **Se der diferente de zero, PARE** e reporte — a trava travaria o sistema. Medido em 17/08/2026: 0 em 5.906 lançamentos.

- [ ] **Step 2: Escrever a migration**

`DEFERRABLE INITIALLY DEFERRED` é obrigatório: editar um rateio passa por um estado intermediário inválido de propósito (apaga o antigo, insere o novo). A regra vale no commit, não na linha.

```sql
-- Trava: a soma dos rateios de um lançamento é igual ao valor dele.
--
-- Não existia. fn_aprovar_ordem_compra soma só (quantidade * preco_unitario) dos
-- itens da OC, mas o lançamento recebe ordens_compra.valor_total, que já inclui
-- frete, outras despesas, impostos e desconto. Medido em 17/08/2026: seis das 17
-- ordens carregadas divergiriam, a pior em R$ 3.835,95 (OC-2026-0017, BRITAS).
-- Sem trava isso entra calado no DRE e na conciliação com o Mais Controle.

create or replace function public.fn_valida_soma_do_rateio()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_lanc uuid := coalesce(new.lancamento_id, old.lancamento_id);
  v_valor numeric(14,2);
  v_soma numeric(14,2);
begin
  select valor into v_valor from public.lancamentos where id = v_lanc;

  -- lançamento apagado em cascata: não há o que validar
  if v_valor is null then
    return null;
  end if;

  select coalesce(round(sum(valor), 2), 0) into v_soma
  from public.lancamento_rateios where lancamento_id = v_lanc;

  if v_soma <> v_valor then
    raise exception 'A soma dos rateios (R$ %) tem que ser igual ao valor do lancamento (R$ %)',
      to_char(v_soma, 'FM999999999990.00'), to_char(v_valor, 'FM999999999990.00');
  end if;

  return null;
end;
$$;

create constraint trigger trg_valida_soma_do_rateio
after insert or update or delete on public.lancamento_rateios
deferrable initially deferred
for each row execute function public.fn_valida_soma_do_rateio();
```

- [ ] **Step 3: Escrever o rollback**

```sql
drop trigger if exists trg_valida_soma_do_rateio on public.lancamento_rateios;
drop function if exists public.fn_valida_soma_do_rateio();
```

- [ ] **Step 4: Aplicar pelo MCP e provar que a trava morde**

Aplicar com `apply_migration`. Depois rodar, via `execute_sql`, uma transação que **tem** que falhar. Esta é a linha de controle: sem um caso que precisa dar erro, o teste passa sem provar nada.

```sql
begin;
insert into lancamento_rateios (lancamento_id, centro_custo_id, valor)
select l.id,
       (select r.centro_custo_id from lancamento_rateios r where r.lancamento_id = l.id limit 1),
       1.00
from lancamentos l
where l.tipo = 'a_pagar' and l.status <> 'cancelado'
  and exists (select 1 from lancamento_rateios r where r.lancamento_id = l.id)
limit 1;
commit;
```

Esperado: `ERROR: A soma dos rateios (R$ ...) tem que ser igual ao valor do lancamento (R$ ...)`. Se o commit passar, a trava não está ativa — investigar antes de seguir.

- [ ] **Step 5: Rodar os advisors**

`get_advisors` para `security` e `performance`. Corrigir o que aparecer.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260817190000_trava_soma_do_rateio.sql supabase/rollbacks/20260817190000_trava_soma_do_rateio_rollback.sql
git commit -m "fix(financeiro): trava a soma dos rateios contra o valor do lançamento"
```

---

### Task 2: Categoria de custo no insumo, com semeadura

**Files:**
- Create: `supabase/migrations/20260817190100_categoria_de_custo_no_insumo.sql`
- Create: `supabase/rollbacks/20260817190100_categoria_de_custo_no_insumo_rollback.sql`
- Create: `src/modules/cadastros/insumos/mapa-categoria-custo.ts`
- Test: `src/modules/cadastros/insumos/mapa-categoria-custo.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: coluna `insumos.categoria_financeira_id uuid null references categorias_financeiras(id)`; `MAPA_CATEGORIA_CUSTO: Record<string, string>` e `CATEGORIAS_DE_CUSTO_USADAS: readonly string[]`, exportados de `mapa-categoria-custo.ts`.

- [ ] **Step 1: Escrever o teste do mapa**

O mapa é dado, não lógica — mas um dado que precisa ser completo. O teste garante que as 27 categorias de insumo têm destino e que nenhum destino foi inventado.

```typescript
// src/modules/cadastros/insumos/mapa-categoria-custo.test.ts
import { describe, expect, it } from "vitest";

import {
  CATEGORIAS_DE_CUSTO_USADAS,
  MAPA_CATEGORIA_CUSTO,
} from "@/modules/cadastros/insumos/mapa-categoria-custo";

/** As 27 categorias de insumo do banco, medidas em 17/08/2026. */
const CATEGORIAS_DE_INSUMO = [
  "A classificar (Equipamentos)",
  "Combustível",
  "Filtros",
  "Locação de equipamento",
  "Lubrificantes e graxas",
  "Manutenção e serviços",
  "Peças e componentes",
  "Pneus e câmaras",
  "A classificar (Mão de obra)",
  "Diaristas",
  "Equipe própria",
  "Terceiros e empreitas",
  "A classificar (Material)",
  "Aço, ferragens e fixação",
  "Asfalto e ligantes",
  "Cimento, agregados e concreto",
  "Elétrica",
  "EPI e sinalização",
  "Ferramentas e consumíveis",
  "Hidráulica",
  "Limpeza e escritório",
  "Madeira e formas",
  "Pintura e acabamento",
  "A classificar (Outros)",
  "Fretes e transporte",
  "Rancho e alojamento",
  "Taxas e administrativo",
];

describe("mapa de categoria de insumo para categoria de custo", () => {
  it("cobre as 27 categorias de insumo", () => {
    expect(CATEGORIAS_DE_INSUMO).toHaveLength(27);
    for (const categoria of CATEGORIAS_DE_INSUMO) {
      expect(MAPA_CATEGORIA_CUSTO[categoria], `sem destino: ${categoria}`).toBeTruthy();
    }
  });

  it("não manda para categoria de custo fora da lista conferida", () => {
    for (const destino of Object.values(MAPA_CATEGORIA_CUSTO)) {
      expect(CATEGORIAS_DE_CUSTO_USADAS).toContain(destino);
    }
  });

  it("manda combustível para Combustível e peça para Manutenção de equipamentos", () => {
    expect(MAPA_CATEGORIA_CUSTO["Combustível"]).toBe("Combustível");
    expect(MAPA_CATEGORIA_CUSTO["Peças e componentes"]).toBe("Manutenção de equipamentos");
  });

  it("cada A classificar vai para o genérico do seu grupo", () => {
    expect(MAPA_CATEGORIA_CUSTO["A classificar (Material)"]).toBe("Materiais");
    expect(MAPA_CATEGORIA_CUSTO["A classificar (Outros)"]).toBe("Outras despesas");
    expect(MAPA_CATEGORIA_CUSTO["A classificar (Equipamentos)"]).toBe(
      "Manutenção de equipamentos",
    );
    expect(MAPA_CATEGORIA_CUSTO["A classificar (Mão de obra)"]).toBe(
      "Mão de Obra Terceirizada",
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/modules/cadastros/insumos/mapa-categoria-custo.test.ts`
Expected: FAIL com `Cannot find module '.../mapa-categoria-custo'`.

- [ ] **Step 3: Escrever o mapa**

`A classificar` existe nos quatro grupos com o mesmo nome, então a chave leva o grupo entre parênteses. As outras 23 são únicas.

```typescript
// src/modules/cadastros/insumos/mapa-categoria-custo.ts

/**
 * De categoria de insumo para categoria de custo (financeira).
 *
 * O vínculo mora em `insumos.categoria_financeira_id`, por insumo — mas ninguém
 * classifica 3.357 insumos à mão. Este mapa de 27 linhas semeia todos eles pela
 * categoria do insumo; depois qualquer insumo pode ser ajustado individualmente,
 * que é justamente o ganho de a coluna estar no insumo.
 *
 * A chave de "A classificar" leva o grupo porque o nome se repete nos quatro.
 */
export const MAPA_CATEGORIA_CUSTO: Record<string, string> = {
  // Equipamentos
  "Combustível": "Combustível",
  "Lubrificantes e graxas": "Combustíveis e lubrificantes",
  "Filtros": "Manutenção de equipamentos",
  "Peças e componentes": "Manutenção de equipamentos",
  "Pneus e câmaras": "Manutenção de equipamentos",
  "Manutenção e serviços": "Manutenção de equipamentos",
  "Locação de equipamento": "Aluguel de Equipamento",
  "A classificar (Equipamentos)": "Manutenção de equipamentos",
  // Mão de obra
  "Equipe própria": "Salário Mão de Obra",
  "Diaristas": "Mão de Obra Terceirizada",
  "Terceiros e empreitas": "Mão de Obra Terceirizada",
  "A classificar (Mão de obra)": "Mão de Obra Terceirizada",
  // Material
  "Aço, ferragens e fixação": "Materiais de construção",
  "Asfalto e ligantes": "Materiais de construção",
  "Cimento, agregados e concreto": "Materiais de construção",
  "Elétrica": "Materiais de construção",
  "Hidráulica": "Materiais de construção",
  "Madeira e formas": "Materiais de construção",
  "Pintura e acabamento": "Materiais de construção",
  "EPI e sinalização": "EPI'S",
  "Ferramentas e consumíveis": "Materiais",
  "Limpeza e escritório": "Material de Escritório",
  "A classificar (Material)": "Materiais",
  // Outros
  "Fretes e transporte": "Frete",
  "Taxas e administrativo": "Impostos e taxas",
  "Rancho e alojamento": "Hospedagem",
  "A classificar (Outros)": "Outras despesas",
};

/**
 * Os 14 destinos, conferidos um a um contra `categorias_financeiras`
 * (tipo despesa, ativo) em 17/08/2026.
 */
export const CATEGORIAS_DE_CUSTO_USADAS = [
  "Combustível",
  "Combustíveis e lubrificantes",
  "Manutenção de equipamentos",
  "Aluguel de Equipamento",
  "Salário Mão de Obra",
  "Mão de Obra Terceirizada",
  "Materiais de construção",
  "EPI'S",
  "Materiais",
  "Material de Escritório",
  "Frete",
  "Impostos e taxas",
  "Hospedagem",
  "Outras despesas",
] as const;
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/modules/cadastros/insumos/mapa-categoria-custo.test.ts`
Expected: PASS, 4 testes.

- [ ] **Step 5: Escrever a migration com a coluna e a semeadura**

O `v_falta` no fim é a linha de controle: se sobrar insumo sem categoria de custo, a migration aborta em vez de deixar buraco.

```sql
-- Categoria de custo no insumo.
--
-- A categoria do custo era digitada na OC, num select de 55 opções, mesmo depois
-- de a pessoa já ter escolhido os insumos — que sabem a que categoria pertencem.
-- Digitar duas vezes deixa divergir: nada impedia uma OC de Diesel S10 ser
-- classificada como "Materiais de construção".
--
-- A coluna nasce NULL para a semeadura poder rodar em seguida; a obrigatoriedade
-- é imposta na aplicação (Zod + formulário). NOT NULL no banco é passo posterior,
-- quando a cobertura estiver comprovadamente em 100%.

alter table public.insumos
  add column categoria_financeira_id uuid references public.categorias_financeiras(id);

comment on column public.insumos.categoria_financeira_id is
  'Categoria de custo (DRE) do insumo. Desce para o rateio do lancamento gerado na aprovacao da OC.';

create index if not exists idx_insumos_categoria_financeira
  on public.insumos (categoria_financeira_id);

do $$
declare
  v_falta int;
begin
  create temp table _mapa (cat text, grupo text, destino text) on commit drop;
  insert into _mapa (cat, grupo, destino) values
    ('Combustível','Equipamentos','Combustível'),
    ('Lubrificantes e graxas','Equipamentos','Combustíveis e lubrificantes'),
    ('Filtros','Equipamentos','Manutenção de equipamentos'),
    ('Peças e componentes','Equipamentos','Manutenção de equipamentos'),
    ('Pneus e câmaras','Equipamentos','Manutenção de equipamentos'),
    ('Manutenção e serviços','Equipamentos','Manutenção de equipamentos'),
    ('Locação de equipamento','Equipamentos','Aluguel de Equipamento'),
    ('A classificar','Equipamentos','Manutenção de equipamentos'),
    ('Equipe própria','Mão de obra','Salário Mão de Obra'),
    ('Diaristas','Mão de obra','Mão de Obra Terceirizada'),
    ('Terceiros e empreitas','Mão de obra','Mão de Obra Terceirizada'),
    ('A classificar','Mão de obra','Mão de Obra Terceirizada'),
    ('Aço, ferragens e fixação','Material','Materiais de construção'),
    ('Asfalto e ligantes','Material','Materiais de construção'),
    ('Cimento, agregados e concreto','Material','Materiais de construção'),
    ('Elétrica','Material','Materiais de construção'),
    ('Hidráulica','Material','Materiais de construção'),
    ('Madeira e formas','Material','Materiais de construção'),
    ('Pintura e acabamento','Material','Materiais de construção'),
    ('EPI e sinalização','Material','EPI''S'),
    ('Ferramentas e consumíveis','Material','Materiais'),
    ('Limpeza e escritório','Material','Material de Escritório'),
    ('A classificar','Material','Materiais'),
    ('Fretes e transporte','Outros','Frete'),
    ('Taxas e administrativo','Outros','Impostos e taxas'),
    ('Rancho e alojamento','Outros','Hospedagem'),
    ('A classificar','Outros','Outras despesas');

  -- todo destino do mapa tem que existir em categorias_financeiras
  select count(*) into v_falta
  from _mapa m
  where not exists (
    select 1 from public.categorias_financeiras c
    where c.nome = m.destino and c.tipo = 'despesa' and c.ativo);
  if v_falta > 0 then
    raise exception 'Categoria de custo do mapa nao existe em categorias_financeiras: % linha(s)', v_falta;
  end if;

  -- toda categoria de insumo do banco tem que estar no mapa
  select count(*) into v_falta
  from public.categorias_insumo ci
  join public.insumo_grupos g on g.id = ci.grupo_id
  where not exists (select 1 from _mapa m where m.cat = ci.nome and m.grupo = g.nome);
  if v_falta > 0 then
    raise exception 'Categoria de insumo fora do mapa: % categoria(s)', v_falta;
  end if;

  update public.insumos i
  set categoria_financeira_id = c.id
  from public.categorias_insumo ci
  join public.insumo_grupos g on g.id = ci.grupo_id
  join _mapa m on m.cat = ci.nome and m.grupo = g.nome
  join public.categorias_financeiras c
    on c.nome = m.destino and c.tipo = 'despesa' and c.ativo
  where i.categoria_id = ci.id;

  -- linha de controle: nenhum insumo pode sobrar sem categoria de custo
  select count(*) into v_falta from public.insumos where categoria_financeira_id is null;
  if v_falta > 0 then
    raise exception 'Sobraram % insumo(s) sem categoria de custo', v_falta;
  end if;
end $$;
```

- [ ] **Step 6: Escrever o rollback**

```sql
drop index if exists public.idx_insumos_categoria_financeira;
alter table public.insumos drop column if exists categoria_financeira_id;
```

- [ ] **Step 7: Aplicar e conferir a cobertura**

Aplicar com `apply_migration`. Conferir:

```sql
select count(*) total,
       count(categoria_financeira_id) com_categoria,
       count(*) - count(categoria_financeira_id) sem_categoria
from insumos;
```

Expected: `total = com_categoria = 3357` e `sem_categoria = 0`. Conferir também a distribuição, que tem que fazer sentido para uma construtora de obra rodoviária:

```sql
select c.nome, count(*) n from insumos i
join categorias_financeiras c on c.id = i.categoria_financeira_id
group by c.nome order by n desc;
```

- [ ] **Step 8: Rodar os advisors e commitar**

`get_advisors` para security e performance, depois:

```bash
git add supabase/migrations/20260817190100_categoria_de_custo_no_insumo.sql supabase/rollbacks/20260817190100_categoria_de_custo_no_insumo_rollback.sql src/modules/cadastros/insumos/mapa-categoria-custo.ts src/modules/cadastros/insumos/mapa-categoria-custo.test.ts
git commit -m "feat(cadastros): insumo carrega a categoria de custo, semeada pela categoria do insumo"
```

---

### Task 3: Categoria no rateio do lançamento

**Files:**
- Create: `supabase/migrations/20260817190200_categoria_no_rateio.sql`
- Create: `supabase/rollbacks/20260817190200_categoria_no_rateio_rollback.sql`

**Interfaces:**
- Consumes: nada.
- Produces: coluna `lancamento_rateios.categoria_id uuid null references categorias_financeiras(id)`, com backfill igual à categoria do lançamento pai.

- [ ] **Step 1: Escrever a migration**

```sql
-- Categoria no rateio do lançamento.
--
-- Uma OC que mistura categorias — a 2592 da BRITAS tem brita, rachão e BGS — caía
-- inteira numa categoria só, e o DRE mentia. O rateio passa a carregar categoria
-- além de centro de custo, então um documento continua sendo UM lançamento: essa
-- invariante é o que sustenta a conciliação com o Mais Controle, e quebrá-la já
-- custou R$ 14.190,82 numa carga anterior.
--
-- Nasce NULL e recebe backfill com a categoria do lançamento pai: os rateios
-- existentes têm uma categoria só, então pai e rateio concordam.

alter table public.lancamento_rateios
  add column categoria_id uuid references public.categorias_financeiras(id);

comment on column public.lancamento_rateios.categoria_id is
  'Categoria de custo desta fatia. Vem do insumo, pela OC.';

create index if not exists idx_lancamento_rateios_categoria
  on public.lancamento_rateios (categoria_id);

update public.lancamento_rateios r
set categoria_id = l.categoria_id
from public.lancamentos l
where l.id = r.lancamento_id
  and r.categoria_id is null
  and l.categoria_id is not null;
```

- [ ] **Step 2: Escrever o rollback**

```sql
drop index if exists public.idx_lancamento_rateios_categoria;
alter table public.lancamento_rateios drop column if exists categoria_id;
```

- [ ] **Step 3: Aplicar e conferir o backfill**

```sql
select count(*) total,
       count(r.categoria_id) com_categoria,
       count(*) filter (where r.categoria_id is null) sem_categoria,
       count(*) filter (where r.categoria_id is not null
                          and l.categoria_id is not null
                          and r.categoria_id <> l.categoria_id) divergentes
from lancamento_rateios r join lancamentos l on l.id = r.lancamento_id;
```

Expected: `divergentes = 0`, e `sem_categoria` igual ao número de rateios cujo lançamento não tem categoria (era 1 lançamento de 5.906 em 17/08/2026).

- [ ] **Step 4: Rodar os advisors e commitar**

```bash
git add supabase/migrations/20260817190200_categoria_no_rateio.sql supabase/rollbacks/20260817190200_categoria_no_rateio_rollback.sql
git commit -m "feat(financeiro): rateio do lançamento carrega a categoria do custo"
```

---

### Task 4: Rateio por categoria — função pura

O cálculo vive em TypeScript, puro e testado, porque a tela precisa mostrar a prévia do rateio antes de aprovar. A aprovação (Task 5) repete a mesma regra em SQL; os testes desta task são o contrato das duas.

**Files:**
- Create: `src/modules/compras/ordens/rateio-categoria.ts`
- Test: `src/modules/compras/ordens/rateio-categoria.test.ts`

**Interfaces:**
- Consumes: `AjustesDaOrdem`, `SEM_AJUSTES`, `subtotalItem`, `totalComAjustes`, `totalOrdemCompra` de `@/modules/compras/ordens/calculo`.
- Produces:
  - `interface ItemParaRateio { centroCustoId: string; categoriaId: string; quantidade: number; precoUnitario: number }`
  - `interface FatiaDoRateio { centroCustoId: string; categoriaId: string; valor: number }`
  - `function ratearPorCategoria(itens: ItemParaRateio[], ajustes: AjustesDaOrdem): FatiaDoRateio[]`

- [ ] **Step 1: Escrever os testes**

```typescript
// src/modules/compras/ordens/rateio-categoria.test.ts
import { describe, expect, it } from "vitest";

import { SEM_AJUSTES } from "@/modules/compras/ordens/calculo";
import {
  type ItemParaRateio,
  ratearPorCategoria,
} from "@/modules/compras/ordens/rateio-categoria";

function item(
  centroCustoId: string,
  categoriaId: string,
  quantidade: number,
  precoUnitario: number,
): ItemParaRateio {
  return { centroCustoId, categoriaId, quantidade, precoUnitario };
}

const somaDas = (fatias: { valor: number }[]) =>
  Math.round(fatias.reduce((total, f) => total + f.valor, 0) * 100) / 100;

describe("ratearPorCategoria", () => {
  it("uma categoria só produz uma fatia com o total", () => {
    const fatias = ratearPorCategoria([item("cc1", "cat1", 2, 50)], SEM_AJUSTES);
    expect(fatias).toEqual([{ centroCustoId: "cc1", categoriaId: "cat1", valor: 100 }]);
  });

  it("agrupa itens do mesmo centro de custo e mesma categoria", () => {
    const fatias = ratearPorCategoria(
      [item("cc1", "cat1", 1, 10), item("cc1", "cat1", 1, 15)],
      SEM_AJUSTES,
    );
    expect(fatias).toHaveLength(1);
    expect(fatias[0].valor).toBe(25);
  });

  it("separa fatias por categoria dentro do mesmo centro de custo", () => {
    const fatias = ratearPorCategoria(
      [item("cc1", "cat1", 1, 60), item("cc1", "cat2", 1, 40)],
      SEM_AJUSTES,
    );
    expect(fatias).toHaveLength(2);
    expect(somaDas(fatias)).toBe(100);
  });

  it("separa fatias por centro de custo dentro da mesma categoria", () => {
    const fatias = ratearPorCategoria(
      [item("cc1", "cat1", 1, 60), item("cc2", "cat1", 1, 40)],
      SEM_AJUSTES,
    );
    expect(fatias).toHaveLength(2);
    expect(somaDas(fatias)).toBe(100);
  });

  // O caso que motivou a task: a OC-2026-0017 da BRITAS, R$ 3.835,95 de desconto.
  it("desconto do rodapé entra proporcionalmente e a soma fecha no total", () => {
    const fatias = ratearPorCategoria(
      [item("cc1", "materiais", 1, 71300), item("cc1", "aclassificar", 1, 32535.95)],
      { ...SEM_AJUSTES, desconto: 3835.95 },
    );
    expect(somaDas(fatias)).toBe(100000);
  });

  it("frete, impostos e outras despesas entram proporcionalmente", () => {
    const fatias = ratearPorCategoria(
      [item("cc1", "cat1", 1, 1000), item("cc1", "cat2", 1, 1000)],
      { frete: 100, outrasDespesas: 50, impostos: 30, desconto: 0 },
    );
    expect(somaDas(fatias)).toBe(2180);
    expect(fatias[0].valor).toBe(1090);
    expect(fatias[1].valor).toBe(1090);
  });

  // Linha de controle: tem que existir um caso em que sobra centavo, senão o teste
  // da soma passa sem nunca exercitar o resto do arredondamento.
  it("resto do arredondamento vai para a maior fatia", () => {
    const fatias = ratearPorCategoria(
      [
        item("cc1", "grande", 1, 100),
        item("cc1", "media", 1, 0.02),
        item("cc1", "pequena", 1, 0.01),
      ],
      { ...SEM_AJUSTES, frete: 0.01 },
    );
    expect(somaDas(fatias)).toBe(100.04);
    const maior = fatias.find((f) => f.categoriaId === "grande");
    expect(maior).toBeDefined();
    expect(maior!.valor).toBeGreaterThan(100);
  });

  it("lista vazia devolve lista vazia", () => {
    expect(ratearPorCategoria([], SEM_AJUSTES)).toEqual([]);
  });

  it("total de itens zero não divide por zero", () => {
    const fatias = ratearPorCategoria(
      [item("cc1", "cat1", 0, 0)],
      { ...SEM_AJUSTES, frete: 10 },
    );
    expect(somaDas(fatias)).toBe(10);
    expect(Number.isFinite(fatias[0].valor)).toBe(true);
  });

  it("ordena da maior para a menor fatia", () => {
    const fatias = ratearPorCategoria(
      [item("cc1", "pequena", 1, 10), item("cc1", "grande", 1, 90)],
      SEM_AJUSTES,
    );
    expect(fatias[0].categoriaId).toBe("grande");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/compras/ordens/rateio-categoria.test.ts`
Expected: FAIL com `Cannot find module '.../rateio-categoria'`.

- [ ] **Step 3: Implementar**

```typescript
// src/modules/compras/ordens/rateio-categoria.ts
import {
  type AjustesDaOrdem,
  subtotalItem,
  totalComAjustes,
  totalOrdemCompra,
} from "@/modules/compras/ordens/calculo";

/** Item da OC do ponto de vista do rateio: onde cai e em que categoria. */
export interface ItemParaRateio {
  centroCustoId: string;
  categoriaId: string;
  quantidade: number;
  precoUnitario: number;
}

/** Uma fatia do custo: um par (centro de custo, categoria) e o valor dele. */
export interface FatiaDoRateio {
  centroCustoId: string;
  categoriaId: string;
  valor: number;
}

const centavos = (valor: number) => Math.round(valor * 100) / 100;

/**
 * Rateia a OC por (centro de custo, categoria de custo).
 *
 * O rodapé da ordem (frete, outras despesas, impostos, desconto) entra
 * proporcionalmente, porque o lançamento recebe o total COM ajustes: ratear só os
 * itens deixaria a soma das fatias diferente do valor do lançamento. Medido em
 * 17/08/2026, a OC-2026-0017 divergiria em R$ 3.835,95.
 *
 * O resto do arredondamento vai para a maior fatia, a mesma regra usada nos
 * rateios do financeiro — duas aritméticas diferentes no sistema divergiriam.
 */
export function ratearPorCategoria(
  itens: ItemParaRateio[],
  ajustes: AjustesDaOrdem,
): FatiaDoRateio[] {
  if (itens.length === 0) return [];

  const porChave = new Map<string, FatiaDoRateio>();
  for (const item of itens) {
    const chave = `${item.centroCustoId}|${item.categoriaId}`;
    const atual = porChave.get(chave);
    const valor = subtotalItem(item.quantidade, item.precoUnitario);
    if (atual) {
      atual.valor = centavos(atual.valor + valor);
    } else {
      porChave.set(chave, {
        centroCustoId: item.centroCustoId,
        categoriaId: item.categoriaId,
        valor: centavos(valor),
      });
    }
  }

  const fatias = [...porChave.values()].sort((a, b) => b.valor - a.valor);
  const totalItens = totalOrdemCompra(itens);
  const totalFinal = totalComAjustes(itens, ajustes);

  // Sem itens com valor não há proporção: o rodapé inteiro cai na primeira fatia.
  if (totalItens === 0) {
    return fatias.map((fatia, indice) => ({
      ...fatia,
      valor: indice === 0 ? totalFinal : 0,
    }));
  }

  const proporcionais = fatias.map((fatia) => ({
    ...fatia,
    valor: centavos((fatia.valor * totalFinal) / totalItens),
  }));

  const somado = centavos(proporcionais.reduce((total, f) => total + f.valor, 0));
  const resto = centavos(totalFinal - somado);
  if (resto !== 0) {
    proporcionais[0].valor = centavos(proporcionais[0].valor + resto);
  }

  return proporcionais;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/compras/ordens/rateio-categoria.test.ts`
Expected: PASS, 11 testes.

- [ ] **Step 5: Commit**

```bash
git add src/modules/compras/ordens/rateio-categoria.ts src/modules/compras/ordens/rateio-categoria.test.ts
git commit -m "feat(compras): rateio da OC por centro de custo e categoria, com o rodapé proporcional"
```

---

### Task 5: A aprovação materializa o rateio por categoria

**Files:**
- Create: `supabase/migrations/20260817190300_aprovar_oc_rateia_por_categoria.sql`
- Create: `supabase/rollbacks/20260817190300_aprovar_oc_rateia_por_categoria_rollback.sql`

**Interfaces:**
- Consumes: `insumos.categoria_financeira_id` (Task 2), `lancamento_rateios.categoria_id` (Task 3), a trava `trg_valida_soma_do_rateio` (Task 1).
- Produces: `fn_aprovar_ordem_compra` que insere rateio por (centro de custo, categoria) somando o total COM ajustes, recusa OC com insumo sem categoria de custo, e grava a categoria de maior valor em `ordens_compra.categoria_id` e `lancamentos.categoria_id`.

- [ ] **Step 1: Ler a definição real da função antes de mexer**

Os `.sql` do repo podem divergir do banco vivo, e outra frente aplica migration no mesmo projeto. Ler a definição corrente:

```sql
select pg_get_functiondef(p.oid) from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_aprovar_ordem_compra';
```

Trabalhar a partir desse texto, não da memória nem do arquivo antigo.

- [ ] **Step 2: Escrever a migration**

`CREATE OR REPLACE FUNCTION` com o corpo lido no Step 1, trocando **apenas** duas coisas.

Primeira: junto às validações do começo (depois da checagem de status), recusar OC com insumo sem categoria de custo — é o par no servidor da trava que a Task 7 põe no formulário:

```sql
  if exists (
    select 1 from public.oc_itens oi
    join public.insumos i on i.id = oi.insumo_id
    where oi.ordem_compra_id = p_oc_id and i.categoria_financeira_id is null
  ) then
    raise exception 'Ha item sem categoria de custo. Classifique o insumo antes de aprovar';
  end if;
```

Segunda: substituir o bloco de `insert into public.lancamento_rateios` por este, mantendo a posição dele (depois do insert das parcelas, antes de `fn_propagar_anexos`):

```sql
  -- Rateio por (centro de custo, categoria de custo), com o rodapé proporcional.
  --
  -- Antes: soma de (quantidade * preco_unitario) agrupada só por centro de custo,
  -- enquanto o lançamento recebe valor_total, que inclui frete, outras despesas,
  -- impostos e desconto. Seis das 17 ordens de 17/08/2026 divergiriam, a pior em
  -- R$ 3.835,95 (OC-2026-0017). A trava trg_valida_soma_do_rateio agora recusa.
  --
  -- O resto do arredondamento vai para a maior fatia, igual a ratearPorCategoria()
  -- em src/modules/compras/ordens/rateio-categoria.ts.
  with fatia as (
    select oi.centro_custo_id,
           i.categoria_financeira_id as categoria_id,
           round(sum(oi.quantidade * oi.preco_unitario), 2) as bruto
    from public.oc_itens oi
    join public.insumos i on i.id = oi.insumo_id
    where oi.ordem_compra_id = p_oc_id
    group by oi.centro_custo_id, i.categoria_financeira_id
  ),
  base as (select coalesce(sum(bruto), 0) as total_itens from fatia),
  proporcional as (
    select f.centro_custo_id, f.categoria_id, f.bruto,
           case when b.total_itens = 0 then 0
                else round(f.bruto * v_total / b.total_itens, 2) end as valor,
           row_number() over (order by f.bruto desc, f.centro_custo_id) as ordem
    from fatia f cross join base b
  ),
  resto as (select v_total - coalesce(sum(valor), 0) as sobra from proporcional)
  insert into public.lancamento_rateios
    (lancamento_id, centro_custo_id, categoria_id, valor, created_by)
  select v_lanc_id, p.centro_custo_id, p.categoria_id,
         p.valor + case when p.ordem = 1 then (select sobra from resto) else 0 end,
         (select auth.uid())
  from proporcional p;

  -- a categoria da ordem e do lançamento passa a ser a de maior valor no rateio
  select r.categoria_id into v_categoria
  from public.lancamento_rateios r
  where r.lancamento_id = v_lanc_id and r.categoria_id is not null
  order by r.valor desc limit 1;

  if v_categoria is not null then
    update public.ordens_compra set categoria_id = v_categoria where id = p_oc_id;
    update public.lancamentos set categoria_id = v_categoria where id = v_lanc_id;
  end if;
```

`v_categoria` já é declarada na função hoje (era lida de `ordens_compra`), então não precisa de `declare` novo.

- [ ] **Step 3: Escrever o rollback**

O rollback é o `CREATE OR REPLACE FUNCTION` com o corpo lido no Step 1, sem alteração nenhuma. Colar o texto original completo em `supabase/rollbacks/20260817190300_aprovar_oc_rateia_por_categoria_rollback.sql`.

- [ ] **Step 4: Aplicar e provar com a OC da BRITAS**

Aplicar com `apply_migration`. A prova usa a OC-2026-0017, que tem R$ 3.835,95 de desconto e itens de duas categorias — o caso que hoje quebraria. Pegar o id e o estado:

```sql
select id, numero, status, valor_total from ordens_compra where numero = 'OC-2026-0017';
```

Levar para `pendente_aprovacao` se preciso, aprovar, e conferir:

```sql
select l.numero, l.valor,
       (select round(sum(r.valor),2) from lancamento_rateios r where r.lancamento_id = l.id) soma_rateios,
       (select count(*) from lancamento_rateios r where r.lancamento_id = l.id) fatias,
       (select count(distinct r.categoria_id) from lancamento_rateios r where r.lancamento_id = l.id) categorias
from lancamentos l
where l.origem = 'oc' and l.origem_id = '<id da OC-2026-0017>';
```

Expected: `valor = soma_rateios = 100000.00`, `fatias >= 2`, `categorias = 2`. Se a trava da Task 1 disparar, o rateio ainda está errado — corrigir antes de seguir.

Depois **desfazer**: a ordem é rascunho de carga e não deve ficar aprovada. Usar `fn_desaprovar_ordem_compra` e conferir que o lançamento saiu.

- [ ] **Step 5: Rodar os advisors e commitar**

```bash
git add supabase/migrations/20260817190300_aprovar_oc_rateia_por_categoria.sql supabase/rollbacks/20260817190300_aprovar_oc_rateia_por_categoria_rollback.sql
git commit -m "fix(compras): a aprovação rateia por categoria e inclui o rodapé no rateio"
```

---

### Task 6: Categoria de custo obrigatória no cadastro de insumo

**Files:**
- Modify: `src/modules/cadastros/insumos/schemas.ts`
- Modify: `src/modules/cadastros/insumos/queries.ts`
- Modify: `src/modules/cadastros/insumos/actions.ts`
- Modify: `src/modules/cadastros/insumos/components/insumos-form-drawer.tsx`
- Test: `src/modules/cadastros/insumos/schemas.test.ts`

**Interfaces:**
- Consumes: `insumos.categoria_financeira_id` (Task 2).
- Produces: `categoriaFinanceiraId` no schema e no payload das actions; `categoriasDeCusto(): Promise<{ id: string; nome: string }[]>` em `queries.ts`.

- [ ] **Step 1: Escrever o teste do schema**

```typescript
// acrescentar em src/modules/cadastros/insumos/schemas.test.ts
it("exige a categoria de custo", () => {
  const resultado = insumoSchema.safeParse({
    nome: "Diesel S10",
    categoriaId: "11111111-1111-1111-1111-111111111111",
    unidadeId: "22222222-2222-2222-2222-222222222222",
    categoriaFinanceiraId: "",
  });
  expect(resultado.success).toBe(false);
  if (!resultado.success) {
    expect(resultado.error.issues.map((i) => i.message)).toContain(
      "Selecione a categoria do custo",
    );
  }
});

it("aceita insumo com categoria de custo", () => {
  const resultado = insumoSchema.safeParse({
    nome: "Diesel S10",
    categoriaId: "11111111-1111-1111-1111-111111111111",
    unidadeId: "22222222-2222-2222-2222-222222222222",
    categoriaFinanceiraId: "33333333-3333-3333-3333-333333333333",
  });
  expect(resultado.success).toBe(true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/cadastros/insumos/schemas.test.ts`
Expected: FAIL no primeiro caso — o schema hoje aceita sem o campo.

- [ ] **Step 3: Adicionar o campo ao schema**

Em `src/modules/cadastros/insumos/schemas.ts`, ao lado de `categoriaId`, com o mesmo helper que o arquivo já usa:

```typescript
  /**
   * Categoria de custo (DRE). Obrigatória: é ela que desce para o rateio do
   * lançamento quando a OC deste insumo é aprovada. Sem ela o custo entra no DRE
   * sem lugar definido.
   */
  categoriaFinanceiraId: idSchemaCom("Selecione a categoria do custo"),
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/cadastros/insumos/schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Ler e gravar a coluna**

Em `queries.ts`: incluir `categoria_financeira_id` no `select` da listagem e do formulário, expor como `categoriaFinanceiraId`, e criar

```typescript
/** Categorias de custo (DRE) para o select do insumo. */
export async function categoriasDeCusto(): Promise<{ id: string; nome: string }[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("categorias_financeiras")
    .select("id, nome")
    .eq("tipo", "despesa")
    .eq("ativo", true)
    .order("nome");
  if (error) throw new Error(error.message);
  return data ?? [];
}
```

Usar o mesmo helper de cliente servidor que as outras funções do arquivo já usam.

Em `actions.ts`: incluir `categoria_financeira_id: dados.categoriaFinanceiraId` no insert e no update.

- [ ] **Step 6: Campo no formulário**

No form drawer do insumo, ao lado do select de categoria do insumo: `Combobox` canônico alimentado por `categoriasDeCusto()`, rótulo "Categoria de custo", `obrigatorio`, ajuda "Onde este custo entra no DRE. Desce para o lançamento da compra."

- [ ] **Step 7: Typecheck, lint e build**

```bash
find .next -name '*[ ][0-9].ts' -o -name '*[ ][0-9].tsx' | xargs -r rm
npx tsc --noEmit && npm run lint && npm run build
```

Expected: os três passam.

- [ ] **Step 8: Commit**

```bash
git add src/modules/cadastros/insumos
git commit -m "feat(cadastros): categoria de custo obrigatória no cadastro de insumo"
```

---

### Task 7: A OC herda a categoria e mostra o rateio

**Files:**
- Modify: `src/modules/compras/ordens/schemas.ts` (linhas 154 e 301: remover `categoriaId`; acrescentar `insumoClassificado` no item)
- Modify: `src/modules/compras/ordens/queries.ts` (trazer a categoria de custo do insumo)
- Modify: `src/modules/compras/ordens/actions.ts` (linha 72: parar de mandar `categoria_id`)
- Modify: `src/modules/compras/ordens/components/ordem-form-drawer.tsx` (linhas 361 e ~529: tirar o select; pôr o painel)
- Modify: `src/modules/compras/ordens/components/ordem-detalhe.tsx` (painel em leitura)
- Test: `src/modules/compras/ordens/schemas.test.ts`

**Interfaces:**
- Consumes: `ratearPorCategoria`, `ItemParaRateio` (Task 4); `insumos.categoria_financeira_id` (Task 2).
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: Escrever o teste da trava de "A classificar"**

```typescript
// acrescentar em src/modules/compras/ordens/schemas.test.ts
it("recusa item cujo insumo está em A classificar", () => {
  const resultado = ocItemSchema.safeParse({
    insumoId: "11111111-1111-1111-1111-111111111111",
    quantidade: "1",
    precoUnitario: "10",
    centroCustoId: "22222222-2222-2222-2222-222222222222",
    insumoClassificado: false,
  });
  expect(resultado.success).toBe(false);
  if (!resultado.success) {
    expect(resultado.error.issues.map((i) => i.message)).toContain(
      "Classifique a categoria deste insumo antes de comprar",
    );
  }
});

it("aceita item cujo insumo está classificado", () => {
  const resultado = ocItemSchema.safeParse({
    insumoId: "11111111-1111-1111-1111-111111111111",
    quantidade: "1",
    precoUnitario: "10",
    centroCustoId: "22222222-2222-2222-2222-222222222222",
    insumoClassificado: true,
  });
  expect(resultado.success).toBe(true);
});
```

O schema do item é `ocItemSchema`, na linha 88 de `schemas.ts`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/compras/ordens/schemas.test.ts`
Expected: FAIL nos dois casos novos.

- [ ] **Step 3: Trocar a validação no schema da OC**

Remover `categoriaId` das linhas 154 e 301 (ela não é mais digitada) e acrescentar ao schema do item:

```typescript
  /**
   * Vem da consulta do insumo, não do formulário: insumo em "A classificar" ou sem
   * categoria de custo não entra em compra, senão o DRE recebe um valor que ninguém
   * sabe onde cai. São 520 insumos assim, e eles só travam quando alguém tenta
   * comprar aquele item — que é quando a informação existe.
   */
  insumoClassificado: z.boolean().refine((valor) => valor, {
    error: "Classifique a categoria deste insumo antes de comprar",
  }),
```

Rodar `npx vitest run src/modules/compras/ordens` e ajustar os testes existentes que montavam o payload com `categoriaId` — eles vão falhar, e é esperado: o campo saiu.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/compras/ordens`
Expected: PASS, incluindo os testes ajustados.

- [ ] **Step 5: Trazer a categoria de custo do insumo na consulta**

Em `queries.ts`, na consulta que alimenta o select de insumos da OC, incluir o join com `categorias_insumo` e a coluna `categoria_financeira_id`, devolvendo por insumo: `categoriaCustoId: string | null`, `categoriaCustoNome: string | null` e `emAClassificar: boolean` (verdadeiro quando o nome da categoria do insumo é "A classificar").

- [ ] **Step 6: Tirar o select de categoria e pôr o painel de rateio**

Em `ordem-form-drawer.tsx`: remover o bloco do `Combobox` de categoria (por volta da linha 529), o `form.watch("categoriaId")` (linha 361) e o `categoriaId` dos `defaultValues` (linhas 131, 152, 170). Remover também a prop `categorias` (linhas 197 e 225) e quem a passa.

No lugar, abaixo da lista de itens, um painel alimentado por `ratearPorCategoria(itens, ajustes)`:

```
Rateio por categoria
  Materiais de construção ................ R$ 71.300,00   (71,3%)
  A classificar .......................... R$ 28.700,00   (28,7%)
                                          ─────────────
                                           R$ 100.000,00
```

Valores com `MoneyText` e `tabular-nums`, alinhados à direita. Ao lado de cada item da lista, a categoria de custo do insumo em texto secundário. Quando o insumo está em "A classificar", mostrar o erro do schema e oferecer o caminho para resolver reusando o `ReclassificarDialog` que já existe em `src/modules/cadastros/insumos/components/reclassificar-dialog.tsx` — ele já escolhe grupo e subcategoria e é o canônico para isso. Não criar diálogo novo.

Atualizar o comentário das linhas 507–509, que hoje explica por que descrição e categoria são obrigatórias ali: a descrição continua sendo, a categoria agora vem do insumo.

- [ ] **Step 7: Parar de mandar `categoria_id` na action**

Em `actions.ts` linha 72, remover `categoria_id: dados.categoriaId`. Atualizar o comentário da linha 69–70 pela mesma razão.

- [ ] **Step 8: Mostrar o rateio no detalhe**

Em `ordem-detalhe.tsx`, o mesmo painel, em leitura.

- [ ] **Step 9: Typecheck, lint, testes e build**

```bash
find .next -name '*[ ][0-9].ts' -o -name '*[ ][0-9].tsx' | xargs -r rm
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

Expected: os quatro passam.

- [ ] **Step 10: Commit**

```bash
git add src/modules/compras/ordens
git commit -m "feat(compras): a OC herda a categoria do insumo e mostra o rateio por categoria"
```

---

### Task 8: Categoria nas 17 OCs carregadas

**Files:**
- Create: `supabase/carga/oc_categoria_derivada_2026_08_17.sql`
- Create: `supabase/rollbacks/oc_categoria_derivada_2026_08_17_rollback.sql`

**Interfaces:**
- Consumes: `insumos.categoria_financeira_id` (Task 2).
- Produces: `ordens_compra.categoria_id` preenchida nas 17.

- [ ] **Step 1: Escrever a carga**

As 17 ordens entraram por SQL, sem passar pelo formulário, e ficaram sem categoria. Com o insumo já classificado, a categoria da ordem é derivável: a de maior valor entre os itens, a mesma regra que a aprovação aplica.

```sql
-- Categoria das 17 ordens de compra carregadas do Mais Controle.
--
-- Elas entraram por SQL, contornando o formulário (que exige o campo), e ficaram
-- com categoria_id nulo. Agora que o insumo carrega a categoria de custo, a da
-- ordem é a de maior valor entre os itens.
update public.ordens_compra o
set categoria_id = escolhida.categoria_id,
    updated_at = now()
from (
  select por_categoria.ordem_compra_id,
         (array_agg(por_categoria.categoria_id order by por_categoria.valor desc))[1]
           as categoria_id
  from (
    select oi.ordem_compra_id,
           i.categoria_financeira_id as categoria_id,
           round(sum(oi.quantidade * oi.preco_unitario), 2) as valor
    from public.oc_itens oi
    join public.insumos i on i.id = oi.insumo_id
    where i.categoria_financeira_id is not null
    group by oi.ordem_compra_id, i.categoria_financeira_id
  ) por_categoria
  group by por_categoria.ordem_compra_id
) escolhida
where o.id = escolhida.ordem_compra_id and o.categoria_id is null;
```

- [ ] **Step 2: Escrever o rollback**

```sql
-- devolve as 17 ao estado anterior: sem categoria
update public.ordens_compra set categoria_id = null, updated_at = now()
where observacoes like '%Ordem de compra Mais Controle%';
```

- [ ] **Step 3: Aplicar e conferir**

```sql
select o.numero, coalesce(c.nome, 'SEM CATEGORIA') categoria,
       (select count(distinct i.categoria_financeira_id) from oc_itens oi
        join insumos i on i.id = oi.insumo_id
        where oi.ordem_compra_id = o.id) categorias_nos_itens
from ordens_compra o left join categorias_financeiras c on c.id = o.categoria_id
order by o.numero;
```

Expected: nenhuma linha com `SEM CATEGORIA`. As ordens com `categorias_nos_itens > 1` (eram 4 em 17/08/2026) são as que o rateio separa na aprovação.

- [ ] **Step 4: Commit**

```bash
git add supabase/carga/oc_categoria_derivada_2026_08_17.sql supabase/rollbacks/oc_categoria_derivada_2026_08_17_rollback.sql
git commit -m "chore(compras): categoria derivada dos itens nas 17 ordens carregadas"
```

---

## Fora deste plano

- **Descrição de 6 OCs** (0004, 0005, 0006, 0007, 0008 e 0017): vazia no próprio Mais Controle. Precisa de decisão do Tiago — gerar a partir dos itens ou ele preenche na tela. Enquanto isso elas não passam pela aprovação, porque a descrição é obrigatória.
- **DRE e relatórios lendo do rateio**: continuam em `lancamentos.categoria_id`, que segue preenchido com a categoria de maior valor.
- **`NOT NULL`** em `insumos.categoria_financeira_id` e `lancamento_rateios.categoria_id`.
- **Reclassificar os 520 insumos em "A classificar"**: acontece sob demanda, pela trava da Task 7.
- **Dependência de branch:** este trabalho está empilhado em `feat-oc-ajustes-e-carga-mc`, que tem 3 commits e ainda não tem PR. Aquele branch mergeia primeiro.
