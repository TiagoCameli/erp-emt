# Adiantamento parcelado — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O adiantamento de salário passa a ser descontado em N parcelas na folha, em vez de integral numa única competência, com o dinheiro continuando a sair inteiro na concessão.

**Architecture:** Tabela filha `rh_adiantamento_parcelas` guarda o plano (previsto por competência) e o realizado (descontado, folha que descontou). A `fn_gerar_folha` passa a descontar por parcela, limitada ao líquido disponível, empurrando a sobra para uma parcela nova no fim do plano. `rh_adiantamentos.folha_id` sai por expand-contract. Adiantamento à vista é o caso de uma parcela, sem ramo especial.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase Postgres 17 (migrations via MCP `apply_migration`), Zod, React Hook Form, Vitest, canônicos EMT.

**Spec:** `docs/superpowers/specs/2026-08-08-rh-adiantamento-parcelado-design.md` (commit 2435eb3, aprovada pelo Tiago).

## Global Constraints

- **Projeto Supabase vivo:** `vsesgvqjgqpapoxhnbqx`. Migration **só** por MCP `apply_migration`, **e também** salva como arquivo em `supabase/migrations/<versao>_<nome>.sql` com o mesmo SQL executável (regra de ouro 5 do `CLAUDE.md` pede as duas). A conferência é por **SQL normalizado** (comentário removido, espaço normalizado), não byte a byte — o padrão do repo mantém um cabeçalho de aviso; está registrado em `docs/decisoes.md`. **`supabase db push` é PROIBIDO** (destrutivo neste repo).
- **O ledger de migrations não é fonte de verdade sobre o schema.** Ler a definição real (`pg_get_functiondef`, `information_schema`, `pg_policies`) antes de alterar função, policy ou grant. Arquivos antigos divergem do que foi aplicado.
- **Desconfiar do SQL deste plano.** O Postgres **cria** função com SQL embutido inválido sem reclamar (`plpgsql` não valida SQL embutido): no bloco anterior um `sum(valor)` sobre subconsulta cuja coluna era `valor_cc` teria subido calado e quebrado na primeira aprovação de folha em produção. **Rodar cada consulta nova isolada antes de embutir na função.**
- **Testar o caso PARCIAL, não o extremo.** Duas vezes no bloco anterior um teste do estado extremo passou e escondeu o perigoso. Aqui: testar **uma** parcela que não cabe entre várias que cabem, e **um** adiantamento estourando entre dois.
- **`grant update` em tabela existente é por coluna, nunca a tabela inteira.** Precedente: `rh_pontos`, `rh_diarias`, e a própria `rh_adiantamentos` depois do Bloco 8a (`grant update (colaborador_id, competencia, valor, data, descricao)`). Tabela nova sem DML para `authenticated` quando a escrita é só por definer (modelo: `folha_item_encargos`, `folha_guias`). `anon` nunca recebe nada. Migration de privilégio termina com trava `do $$` fail-closed.
- **Gate de permissão em predicado de trava tem que ser fail-closed:** `and tem_permissao(...)` no WHERE faz a função devolver `false` (= "não comprometido"), que é o fail-open que ela existe para evitar. Usar `return true`, ou `raise` quando a função for `plpgsql`.
- **Dinheiro é `NUMERIC(14,2)`.** Float proibido para valor. Exibição via `MoneyText`, `tabular-nums`, alinhado à direita.
- **Permissão tripla:** RLS no banco (`tem_permissao(recurso, acao)`), checagem na Server Action, UI esconde o que não pode. Recurso: `rh.adiantamentos`.
- **Componentes canônicos primeiro** (`src/components/canonicos/`). Todo select é `Combobox` com busca, nunca o `Select` do shadcn. Se um canônico não cobrir um caso legítimo, evoluir o canônico em vez de duplicar.
- **Toda prova em transação que termina em `rollback`.** Produção tem 18 centros de custo, 16 obras, 931 fornecedores reais, e **zero** colaborador, folha, adiantamento e lançamento. Restaurar permissões removidas (dois usuários, 148 cada).
- **iCloud duplica arquivos:** antes do `tsc`, rodar `find src supabase -name "* [0-9].*" -delete`.
- **Portão de cada task:** `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`, tudo verde. Baseline: **950 testes**. Regenerar `src/lib/database.types.ts` (MCP `generate_typescript_types`) depois de migration e antes do `tsc`.
- **Branch `feat-rh-adiantamento-parcelado`, sem worktree.** Merge em `main` só na última task, depois do review amplo.
- **Commits em português**, imperativo, escopo entre parênteses, terminando com `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. **Nunca usar travessão (em-dash).**
- **Ao mexer numa tela existente, verificar quem mais usa o que mudou.** No bloco anterior, duas vezes um arquivo fora da lista do brief quebrou o build. Rodar o portão inteiro, não só os testes do módulo.

## Arquivos: responsabilidade de cada um

**Banco (uma migration por task que toca schema):**
- `rh_adiantamento_parcelas` + `fn_registrar_adiantamento` criando o plano (Task 2)
- `fn_gerar_folha` descontando por parcela + contract de `rh_adiantamentos.folha_id` (Task 3)
- `obj_description` da `fn_aprovar_folha` e a consulta de diagnóstico (Task 4)
- `fn_quitar_adiantamento` e `fn_antecipar_adiantamentos_colaborador` (Task 5)

**TypeScript:**
- `src/modules/rh/adiantamentos/parcelamento.ts` (novo) — divisão em parcelas, pura (Task 1)
- `src/modules/rh/adiantamentos/schemas.ts` — campo `parcelas` nos dois schemas (Task 1)
- `src/modules/rh/adiantamentos/actions.ts` — payload com parcelas, trava por parcela, quitação (Tasks 2 e 5)
- `src/modules/rh/adiantamentos/queries.ts` — plano e saldo na listagem e no detalhe (Task 6)
- `src/modules/rh/adiantamentos/components/*` — prévia no form, colunas, detalhe, ação quitar (Task 6)
- `src/modules/cadastros/colaboradores/actions.ts` — antecipar ao inativar (Task 5)
- `src/modules/rh/folha/components/holerite-dialog.tsx` — "Adiantamento 2/3" (Task 6)
- `src/modules/rh/alertas/*` — categoria de saldo em aberto de inativo (Task 6)

---

### Task 1: Divisão em parcelas (lógica pura, sem banco)

**Modelo sugerido:** cheapest tier — o plano traz o código completo, é transcrição mais teste.

**Files:**
- Create: `src/modules/rh/adiantamentos/parcelamento.ts`
- Create: `src/modules/rh/adiantamentos/parcelamento.test.ts`
- Modify: `src/modules/rh/adiantamentos/schemas.ts` (adicionar `parcelas` aos dois schemas e ao conversor, linhas 28-80)

**Interfaces:**
- Consumes: `paraNumero`, `numeroPositivo`, `valorValido` de `./numero` (já existem).
- Produces: `dividirEmParcelas(total: number, quantidade: number): number[]`; `MAX_PARCELAS = 60`; `AdiantamentoInput` ganha `parcelas: number`; `AdiantamentoFormInput` ganha `parcelas: string`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/modules/rh/adiantamentos/parcelamento.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { dividirEmParcelas } from "@/modules/rh/adiantamentos/parcelamento";

describe("dividirEmParcelas", () => {
  it("divide exato quando o valor fecha", () => {
    expect(dividirEmParcelas(1200, 3)).toEqual([400, 400, 400]);
  });

  it("joga a sobra de centavos na primeira parcela", () => {
    expect(dividirEmParcelas(1000, 3)).toEqual([333.34, 333.33, 333.33]);
  });

  it("mantém a soma exata mesmo com divisão feia", () => {
    const parcelas = dividirEmParcelas(100, 7);
    expect(parcelas).toEqual([14.32, 14.28, 14.28, 14.28, 14.28, 14.28, 14.28]);
    const soma = parcelas.reduce((a, b) => Math.round((a + b) * 100) / 100, 0);
    expect(soma).toBe(100);
  });

  it("funciona no limite de centavos", () => {
    expect(dividirEmParcelas(0.05, 3)).toEqual([0.03, 0.01, 0.01]);
  });

  it("uma parcela devolve o total", () => {
    expect(dividirEmParcelas(1234.56, 1)).toEqual([1234.56]);
  });

  it("nunca devolve parcela de zero", () => {
    // 3 centavos em 3 parcelas é o limite: 1 centavo cada.
    expect(dividirEmParcelas(0.03, 3)).toEqual([0.01, 0.01, 0.01]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/rh/adiantamentos/parcelamento.test.ts`
Expected: FAIL com "Cannot find module '@/modules/rh/adiantamentos/parcelamento'".

- [ ] **Step 3: Escrever `parcelamento.ts`**

```ts
/** Teto de parcelas, validado nas três camadas. Arbitrário, contra digitação absurda. */
export const MAX_PARCELAS = 60;

/**
 * Divide um total em N parcelas iguais de 2 casas, com a sobra de centavos na
 * primeira. A soma das parcelas é sempre exatamente o total: a conta é feita em
 * centavos inteiros justamente para não acumular erro de ponto flutuante.
 *
 * O servidor recalcula esta divisão na hora de gravar. A prévia na tela é
 * informativa e nunca é fonte de verdade.
 */
export function dividirEmParcelas(total: number, quantidade: number): number[] {
  const totalCentavos = Math.round(total * 100);
  const base = Math.floor(totalCentavos / quantidade);
  const sobra = totalCentavos - base * quantidade;

  return Array.from(
    { length: quantidade },
    (_, indice) => (base + (indice === 0 ? sobra : 0)) / 100,
  );
}

/** Quantidade de parcelas cabe no total sem gerar parcela de zero centavo. */
export function quantidadeCabeNoTotal(
  total: number,
  quantidade: number,
): boolean {
  return quantidade >= 1 && quantidade <= Math.round(total * 100);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/rh/adiantamentos/parcelamento.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 5: Escrever o teste do schema com parcelas**

Criar (ou estender, se já existir) `src/modules/rh/adiantamentos/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  adiantamentoFormParaInput,
  adiantamentoSchema,
} from "@/modules/rh/adiantamentos/schemas";

describe("adiantamentoSchema com parcelas", () => {
  const base = {
    colaboradorId: "11111111-1111-1111-1111-111111111111",
    competencia: "2026-09-01",
    valor: 1200,
    data: "2026-09-15",
  };

  it("aceita parcelamento válido", () => {
    expect(adiantamentoSchema.safeParse({ ...base, parcelas: 3 }).success).toBe(
      true,
    );
  });

  it("aceita à vista como uma parcela", () => {
    expect(adiantamentoSchema.safeParse({ ...base, parcelas: 1 }).success).toBe(
      true,
    );
  });

  it("recusa zero, negativo e fracionário", () => {
    for (const parcelas of [0, -1, 2.5]) {
      expect(
        adiantamentoSchema.safeParse({ ...base, parcelas }).success,
      ).toBe(false);
    }
  });

  it("recusa acima do teto de 60", () => {
    expect(
      adiantamentoSchema.safeParse({ ...base, parcelas: 61 }).success,
    ).toBe(false);
  });

  it("recusa mais parcelas do que centavos no total", () => {
    // R$ 0,02 em 3 parcelas geraria parcela de zero.
    const r = adiantamentoSchema.safeParse({ ...base, valor: 0.02, parcelas: 3 });
    expect(r.success).toBe(false);
  });

  it("converte o formulário coerindo parcelas para número", () => {
    const input = adiantamentoFormParaInput({
      colaboradorId: base.colaboradorId,
      competencia: "2026-09",
      valor: "1.200,00",
      data: "2026-09-15",
      descricao: "",
      parcelas: "3",
    });
    expect(input.parcelas).toBe(3);
    expect(input.valor).toBe(1200);
  });
});
```

- [ ] **Step 6: Rodar e ver falhar, implementar, ver passar**

Run: `npx vitest run src/modules/rh/adiantamentos/schemas.test.ts` → FAIL.

Em `schemas.ts`, adicionar ao `adiantamentoSchema` (que hoje termina na linha 44) o campo e o refine cruzado:

```ts
  parcelas: z
    .number({ error: "Parcelas inválidas" })
    .int({ error: "Parcelas precisa ser um número inteiro" })
    .min(1, { error: "No mínimo 1 parcela" })
    .max(MAX_PARCELAS, { error: `No máximo ${MAX_PARCELAS} parcelas` }),
```

e envolver o objeto num `.refine` que usa `quantidadeCabeNoTotal(valor, parcelas)` com a mensagem "Parcelas demais para este valor: cada parcela ficaria em zero" e `path: ["parcelas"]`.

No `adiantamentoFormSchema`, `parcelas: z.string().trim().refine(...)` aceitando inteiro de 1 a 60. No `adiantamentoFormParaInput`, `parcelas: Number(dados.parcelas.trim())`.

Importar `MAX_PARCELAS` e `quantidadeCabeNoTotal` de `./parcelamento`.

Run: `npx vitest run src/modules/rh/adiantamentos/schemas.test.ts` → PASS.

- [ ] **Step 7: Portão e commit**

```bash
find src supabase -name "* [0-9].*" -delete
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
git add -A
git commit -m "feat(rh): divisão do adiantamento em parcelas iguais, com a sobra na primeira

A conta é em centavos inteiros para a soma das parcelas fechar exatamente com o
total. Teto de 60 parcelas e recusa quando a quantidade não cabe no valor (que
geraria parcela de zero). O à vista passa a ser o caso de 1 parcela.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Nota:** o `tsc` vai reclamar em `adiantamento-form-drawer.tsx` e onde `adiantamentoFormParaInput` é chamado, porque `parcelas` passou a ser obrigatório. Corrigir passando `"1"` como valor inicial nesses pontos, mantendo o comportamento atual até a Task 6 construir o campo na tela.

---

### Task 2: Tabela de parcelas e a concessão criando o plano

**Modelo sugerido:** opus (DDL de tabela nova com RLS/grants, e altera função de dinheiro).

**Files:**
- Migration nova: `adiantamento_parcelas`
- Modify: `fn_registrar_adiantamento` no banco (passa a criar as parcelas)
- Modify: `src/modules/rh/adiantamentos/actions.ts` (payload com `parcelas`)

**Interfaces:**
- Consumes: `dividirEmParcelas` (Task 1); `fn_registrar_adiantamento(p_dados jsonb) returns uuid` (assinatura **não muda**).
- Produces: tabela `rh_adiantamento_parcelas` (colunas na spec, seção 1); `p_dados` passa a aceitar a chave `parcelas` (default 1 quando ausente, para não quebrar chamada antiga).

- [ ] **Step 1: Ler o estado vivo**

```sql
select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='fn_registrar_adiantamento';

select relacl from pg_class where relname = 'folha_item_encargos';

select count(*) as adiantamentos_existentes from public.rh_adiantamentos;
```

Copiar a definição da `fn_registrar_adiantamento` para um scratch. Esperado: `adiantamentos_existentes = 0`. **Se for maior que zero, PARAR e reportar:** o plano assume tabela vazia para não migrar dado.

- [ ] **Step 2: Aplicar a migration da tabela**

Via `apply_migration`, nome `adiantamento_parcelas`:

```sql
create table if not exists public.rh_adiantamento_parcelas (
  id uuid primary key default gen_random_uuid(),
  adiantamento_id uuid not null references public.rh_adiantamentos(id) on delete cascade,
  numero integer not null check (numero >= 1),
  competencia date not null check (extract(day from competencia) = 1),
  valor_previsto numeric(14,2) not null check (valor_previsto > 0),
  valor_descontado numeric(14,2) not null default 0 check (valor_descontado >= 0),
  folha_id uuid references public.folhas(id),
  gerada_por_folha_id uuid references public.folhas(id),
  created_at timestamptz not null default now(),
  unique (adiantamento_id, numero),
  -- Nao da para descontar mais do que a parcela prevê.
  constraint rh_adiant_parcelas_descontado_ate_previsto
    check (valor_descontado <= valor_previsto),
  -- Descontado sem folha, ou folha sem valor, seria estado meio gravado.
  constraint rh_adiant_parcelas_descontado_com_folha
    check ((valor_descontado > 0) = (folha_id is not null))
);

create index if not exists idx_rh_adiant_parcelas_adiantamento
  on public.rh_adiantamento_parcelas (adiantamento_id);
create index if not exists idx_rh_adiant_parcelas_competencia_aberta
  on public.rh_adiantamento_parcelas (competencia) where folha_id is null;
create index if not exists idx_rh_adiant_parcelas_folha
  on public.rh_adiantamento_parcelas (folha_id);
create index if not exists idx_rh_adiant_parcelas_gerada_por
  on public.rh_adiantamento_parcelas (gerada_por_folha_id);

alter table public.rh_adiantamento_parcelas enable row level security;

create policy rh_adiant_parcelas_select on public.rh_adiantamento_parcelas
  for select to authenticated
  using ((select public.tem_permissao('rh.adiantamentos', 'ver')));

-- Escrita só pelas funções definer: sem policy e sem grant de DML.
grant select on public.rh_adiantamento_parcelas to authenticated;

create trigger trg_audit_rh_adiant_parcelas
  after insert or update or delete on public.rh_adiantamento_parcelas
  for each row execute function public.fn_audit();

do $$
declare v_ruim integer;
begin
  select count(*) into v_ruim
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'rh_adiantamento_parcelas'
    and (grantee = 'anon'
      or (grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')));
  if v_ruim > 0 then
    raise exception 'rh_adiantamento_parcelas tem % grant indevido (anon com acesso ou authenticated com DML)', v_ruim;
  end if;
end $$;
```

**Conferir o nome real do trigger de auditoria** (`fn_audit` ou outro) lendo um trigger existente antes de aplicar: `select pg_get_triggerdef(oid) from pg_trigger where tgname like '%audit%folha_guias%'`.

- [ ] **Step 3: Conferir no banco**

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.rh_adiantamento_parcelas'::regclass order by conname;

select relacl from pg_class where relname = 'rh_adiantamento_parcelas';

select policyname, cmd, qual from pg_policies
where tablename = 'rh_adiantamento_parcelas';
```

Esperado: os checks e o unique presentes; `relacl` com `authenticated=r` (sem `w`, `a`, `d`); uma policy só, de SELECT.

- [ ] **Step 4: `fn_registrar_adiantamento` cria o plano**

Via `apply_migration`, nome `adiantamento_registra_com_parcelas`. Recriar a função lida no Step 1 **inteira**, preservando tudo (permissão, valor maior que zero, `fn_exigir_competencia_aberta`, o lançamento com parcela e rateio, o `update lancamento_id`), e acrescentando **só** a criação das parcelas antes do `return`:

```sql
  -- Plano de desconto. Parcelas iguais em centavos, sobra na primeira, a partir
  -- da competencia informada. Sem a chave 'parcelas' no payload, 1 parcela: e o
  -- adiantamento a vista de sempre, sem ramo especial.
  v_qtd := coalesce((p_dados->>'parcelas')::integer, 1);
  if v_qtd < 1 or v_qtd > 60 then
    raise exception 'Parcelas fora do limite (1 a 60): %', v_qtd;
  end if;
  v_total_cent := round(v_valor * 100)::bigint;
  if v_qtd > v_total_cent then
    raise exception 'Parcelas demais para o valor: cada parcela ficaria em zero';
  end if;
  v_base_cent := v_total_cent / v_qtd;
  v_sobra_cent := v_total_cent - v_base_cent * v_qtd;

  insert into public.rh_adiantamento_parcelas
    (adiantamento_id, numero, competencia, valor_previsto)
  select v_adiant,
         n,
         (date_trunc('month', v_comp) + ((n - 1) || ' month')::interval)::date,
         ((v_base_cent + case when n = 1 then v_sobra_cent else 0 end)::numeric / 100)
  from generate_series(1, v_qtd) n;
```

Declarar `v_qtd integer; v_total_cent bigint; v_base_cent bigint; v_sobra_cent bigint;`.

**Rodar o `select` do insert isolado antes de embutir**, com valores fixos, e conferir que a soma fecha (a Global Constraint sobre SQL embutido existe por causa de um bug exatamente assim no bloco anterior).

- [ ] **Step 5: Provar que o plano bate com a lógica pura**

Em transação revertida, criar um colaborador e chamar a função com os mesmos casos do teste da Task 1 (1200/3, 1000/3, 100/7, 0,05/3, 1 parcela), conferindo para cada um: a quantidade de linhas, os valores por número, as competências em sequência mensal a partir da informada, e que `sum(valor_previsto) = valor do adiantamento` **exatamente**. Comparar os valores com os que o teste TS espera: **se divergir em um centavo, parar e reportar.**

- [ ] **Step 6: Action envia as parcelas**

Em `actions.ts`, `criarAdiantamento`, acrescentar `parcelas: validado.data.parcelas` ao objeto `p_dados`.

- [ ] **Step 7: Regenerar tipos, portão e commit**

```bash
find src supabase -name "* [0-9].*" -delete
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
git add -A
git commit -m "feat(rh): conceder adiantamento cria o plano de parcelas

Tabela rh_adiantamento_parcelas com o previsto por competência e o realizado
(descontado + folha que descontou), escrita só por função definer. A concessão
cria as parcelas na mesma transação do lançamento, e sem a chave parcelas no
payload cria uma, que é o adiantamento à vista de sempre.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `fn_gerar_folha` desconta por parcela (DINHEIRO)

**Modelo sugerido:** opus. É a task de dinheiro.

**Files:**
- Migration nova: `folha_desconta_parcela_adiantamento`
- Migration nova (contract): `adiantamento_dropa_folha_id`
- Modify: `src/modules/rh/adiantamentos/actions.ts` (`garantirEmAberto`)

**Interfaces:**
- Consumes: `rh_adiantamento_parcelas` (Task 2).
- Produces: `fn_proxima_competencia_desconto(p_apos date) returns date`; `fn_gerar_folha` descontando por parcela; `rh_adiantamentos.folha_id` **deixa de existir**.

- [ ] **Step 1: Ler a `fn_gerar_folha` viva e guardar num scratch**

```sql
select md5(prosrc) as antes, length(prosrc) as tamanho, prosrc
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='fn_gerar_folha';
```

Os três pontos que tocam adiantamento hoje são:

```sql
-- (1) no início, ao regenerar:
update public.rh_adiantamentos set folha_id = null where folha_id = v_folha
-- (2) no loop do colaborador:
select coalesce(sum(valor), 0) into v_adiant from public.rh_adiantamentos
 where colaborador_id = v_colab.id and date_trunc('month', competencia)::date = v_ini and folha_id is null
-- (3) depois do insert do item:
update public.rh_adiantamentos set folha_id = v_folha
 where colaborador_id = v_colab.id and date_trunc('month', competencia)::date = v_ini and folha_id is null
```

**Nada além desses três pontos e do cálculo do líquido pode mudar.** Diffar depois.

- [ ] **Step 2: Criar a função auxiliar de competência**

Via `apply_migration`, nome `proxima_competencia_desconto`:

```sql
-- Primeira competencia depois de p_apos cuja folha NAO esteja aprovada. Parcela
-- dentro de folha aprovada seria dinheiro que nunca vai ser descontado.
-- Procura 120 meses; se todos tiverem folha aprovada, estoura, porque isso e
-- dado absurdo e nao algo para resolver escolhendo um mes no escuro.
create or replace function public.fn_proxima_competencia_desconto(p_apos date)
returns date
language plpgsql
stable
set search_path to ''
as $function$
declare v_comp date; v_n integer := 1;
begin
  while v_n <= 120 loop
    v_comp := (date_trunc('month', p_apos) + (v_n || ' month')::interval)::date;
    if not exists (
      select 1 from public.folhas f
      where f.competencia = v_comp and f.status = 'aprovado'
    ) then
      return v_comp;
    end if;
    v_n := v_n + 1;
  end loop;
  raise exception 'Nao achei competencia sem folha aprovada nos 120 meses depois de %', p_apos;
end;
$function$;

revoke all on function public.fn_proxima_competencia_desconto(date) from public;
grant execute on function public.fn_proxima_competencia_desconto(date) to authenticated;
```

Provar isolada: sem folha nenhuma devolve o mês seguinte; com folha aprovada no mês seguinte pula para o subsequente; com folha em `rascunho` no mês seguinte **não** pula (rascunho é destino válido).

- [ ] **Step 3: Aplicar a `fn_gerar_folha` nova**

Via `apply_migration`, nome `folha_desconta_parcela_adiantamento`. Recriar a função **a partir da própria `pg_get_functiondef`** (o padrão que funcionou no bloco anterior: `replace()` cirúrgico em vez de redigitar 170 linhas), trocando os três pontos.

Ponto (1) vira:

```sql
    delete from public.rh_adiantamento_parcelas where gerada_por_folha_id = v_folha;
    update public.rh_adiantamento_parcelas
       set folha_id = null, valor_descontado = 0
     where folha_id = v_folha;
```

Ponto (2) e o cálculo do líquido viram, dentro do loop do colaborador, **depois** de `v_inss` e `v_irrf` estarem calculados e **antes** do `insert into folha_itens`:

```sql
    -- Adiantamento parcelado: desconta o que cabe, do adiantamento mais antigo
    -- para o mais novo (a ordem importa e e conferivel: por data do adiantamento,
    -- depois numero da parcela). O que nao couber vira parcela nova no fim do
    -- plano DAQUELE adiantamento, marcada com esta folha para a regeneracao
    -- poder desfazer.
    v_disponivel := greatest(v_colab.salario - v_inss - v_irrf, 0);
    v_adiant := 0;

    for v_par in
      select pa.id, pa.adiantamento_id, pa.valor_previsto
      from public.rh_adiantamento_parcelas pa
      join public.rh_adiantamentos a on a.id = pa.adiantamento_id
      where a.colaborador_id = v_colab.id
        and pa.competencia = v_ini
        and pa.folha_id is null
      order by a.data, pa.numero
    loop
      v_desc_par := least(v_par.valor_previsto, greatest(v_disponivel - v_adiant, 0));

      update public.rh_adiantamento_parcelas
         set folha_id = v_folha, valor_descontado = v_desc_par
       where id = v_par.id;

      v_adiant := v_adiant + v_desc_par;

      if v_par.valor_previsto > v_desc_par then
        insert into public.rh_adiantamento_parcelas
          (adiantamento_id, numero, competencia, valor_previsto, gerada_por_folha_id)
        select v_par.adiantamento_id,
               max(pa2.numero) + 1,
               public.fn_proxima_competencia_desconto(max(pa2.competencia)),
               v_par.valor_previsto - v_desc_par,
               v_folha
        from public.rh_adiantamento_parcelas pa2
        where pa2.adiantamento_id = v_par.adiantamento_id;
      end if;
    end loop;
```

**Atenção ao check `rh_adiant_parcelas_descontado_com_folha`:** ele exige `(valor_descontado > 0) = (folha_id is not null)`. Uma parcela que não coube nada (desconto zero) violaria o check se recebesse `folha_id`. Então o `update` acima **só marca `folha_id` quando `v_desc_par > 0`**; parcela com desconto zero fica intacta e aberta, e a sobra é o valor inteiro dela. Ajustar o `update` para `folha_id = case when v_desc_par > 0 then v_folha else null end` e **provar os dois caminhos**.

O líquido passa a ser `v_liquido := v_disponivel - v_adiant;` (nunca negativo). O ponto (3) **desaparece**: quem marca a folha agora é o `update` dentro do loop.

Depois de aplicar, diffar contra o scratch do Step 1 e confirmar que só esses trechos mudaram: INSS progressivo, IRRF, loop de encargos, `custo_total = salário + encargos`, snapshot do grupo e a guarda de status têm que estar intactos.

- [ ] **Step 4: Contract — dropar `rh_adiantamentos.folha_id`**

**Duas coisas já foram medidas no banco e você não precisa descobrir de novo:**

**(a) `fn_excluir_adiantamento` usa a coluna e vai quebrar no drop.** Ela faz:

```sql
select folha_id, lancamento_id into v_folha, v_lanc
from public.rh_adiantamentos where id = p_id for update
```

e usa `v_folha` para recusar exclusão de adiantamento já incluído em folha. **Recrie essa função inteira** (leia a definição viva, preserve o resto byte a byte) trocando essa checagem por "existe parcela descontada":

```sql
  select lancamento_id into v_lanc
  from public.rh_adiantamentos where id = p_id for update;

  if exists (
    select 1 from public.rh_adiantamento_parcelas
    where adiantamento_id = p_id and folha_id is not null
  ) then
    raise exception 'Nao da para excluir: este adiantamento ja teve parcela descontada em folha. Desaprove a folha e regere antes de excluir';
  end if;
```

Ajuste a declaração de `v_folha` se ela ficar sem uso. **Faça isso na mesma migration do drop**, senão a função fica quebrada entre as duas.

**(b) `fn_desaprovar_folha` NÃO toca `rh_adiantamentos`**, e isso está correto: quem solta o vínculo é a regeneração da folha (o ponto 1 desta task). Desaprovar volta a folha para rascunho mantendo os itens; se ela for regerada, as parcelas são liberadas; se for reenviada sem regerar, as parcelas seguem apontando para a folha certa. **Confirme esse raciocínio provando os dois caminhos** (desaprovar e regerar; desaprovar e reaprovar sem regerar) e reporte se encontrar inconsistência — não conserte em silêncio.

Antes de dropar, **grep-guard nos dois lados**:

```bash
grep -rn "folha_id" src/ | grep -i adiantamento     # tem que voltar vazio
```

```sql
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosrc like '%rh_adiantamentos%'
  and p.prosrc ~ 'rh_adiantamentos[^;]*folha_id|folha_id[^;]*rh_adiantamentos';
```

A consulta SQL tem que voltar **zero linha** (hoje volta `fn_excluir_adiantamento` e `fn_gerar_folha`; as duas são reescritas nesta task).

Ajustar `garantirEmAberto` em `actions.ts` **antes** do drop: a condição "já incluído numa folha" passa a ser "existe parcela descontada", via `exists` em `rh_adiantamento_parcelas` com `folha_id is not null`. A mensagem passa a dizer que o adiantamento já teve parcela descontada em folha. **Cuidado:** essa leitura passa por RLS e `rh_adiantamento_parcelas` só libera com `rh.adiantamentos:ver` — quem tem `editar` sem `ver` leria vazio e a trava falharia aberta. Use o predicado definer que já existe para o caso análogo (`fn_adiantamento_pagamento_comprometido`, do Bloco 8a) como modelo, e faça o gate **fail-closed**.

Então, migration `adiantamento_dropa_folha_id`: `alter table public.rh_adiantamentos drop column folha_id;`

- [ ] **Step 5: A prova de aceite desta task**

Em transação revertida, montar: 2 colaboradores CLT, faixas de INSS/IRRF, e adiantamentos assim:
- colaborador A: um adiantamento de 1.200 em 3 parcelas, salário confortável → desconta 400, sobra nada;
- colaborador B: salário baixo e um adiantamento cuja parcela **não cabe** → desconta o que cabe, líquido **zero**, e nasce parcela nova com a diferença e `gerada_por_folha_id` preenchido;
- colaborador A também recebe um **segundo** adiantamento no mesmo mês, com disponível insuficiente para os dois → provar a cascata: o mais antigo (por `data`) leva o desconto, o mais novo gera a sobra.

Provar, com saída literal:
- `sum(valor_descontado)` das parcelas da folha == a soma dos `folha_itens.adiantamentos`;
- **nenhum item com `valor_liquido < 0`** (era possível antes desta task, e não pode mais ser);
- a parcela com desconto zero ficou **aberta** e sem `folha_id`;
- **regenerar a folha três vezes**: contagem de parcelas, valores e vínculos idênticos, e zero parcela com `gerada_por_folha_id` órfã. Este é o teste que pega o `delete` de idempotência esquecido.

- [ ] **Step 6: Regenerar tipos, portão e commit**

```bash
find src supabase -name "* [0-9].*" -delete
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
git add -A
git commit -m "feat(rh): a folha desconta a parcela do adiantamento, e empurra o que não cabe

O desconto passa a ser limitado ao líquido disponível, então líquido negativo
deixa de ser possível: o que não cabe vira parcela nova no fim do plano, marcada
com a folha que a gerou para a regeneração poder desfazer. Com mais de um
adiantamento no mês, a cascata é do mais antigo para o mais novo.

rh_adiantamentos.folha_id sai (contract): o vínculo com a folha vive na parcela.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: A identidade de conferência e o texto que a explica

**Modelo sugerido:** opus (mexe no artefato que o contador usa para conferir dinheiro).

**Files:**
- Migration nova: `folha_aprovar_comentario_parcela_adiantamento`

**Interfaces:**
- Consumes: `fn_gerar_folha` nova (Task 3).
- Produces: `obj_description` da `fn_aprovar_folha` atualizado, com a consulta de diagnóstico refletindo o termo novo.

- [ ] **Step 1: Ler o comentário vivo e a consulta**

```sql
select obj_description('public.fn_aprovar_folha(uuid)'::regprocedure) as texto;
select md5(prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='fn_aprovar_folha';
```

O md5 do corpo é `a1261a1ccbff886980f0991da47a2446` e **não pode mudar nesta task**: só o comentário muda.

- [ ] **Step 2: Aplicar o comentário novo**

Via `apply_migration`, nome `folha_aprovar_comentario_parcela_adiantamento`. O texto tem que:

1. dizer que o termo do adiantamento na identidade é **o que foi descontado nesta folha** (soma de `valor_descontado` das parcelas com `folha_id` = a folha), e não o valor concedido;
2. explicar que o desembolso e o desconto ficam em competências diferentes quando há parcelamento, e que isso é esperado: o caixa vê a despesa na concessão, a folha vê o custo na amortização;
3. remover a causa de resíduo "líquido negativo", que deixou de ser alcançável, mantendo "líquido zero";
4. manter as causas "encargo sem grupo" e "retido sem grupo";
5. trazer a consulta de diagnóstico atualizada, **executável colada**, sem placeholder de cliente (`:folha` não é SQL fora do `psql`), com a coluna `explicado` que tem que dar `0.00`.

A trava `do $$` da migration tem que: conferir que `md5(prosrc)` da `fn_aprovar_folha` segue `a1261a1ccbff886980f0991da47a2446`; recusar se o texto contiver `:[a-zA-Z_]` (guarda de regressão que já existe no padrão do repo); e **extrair a consulta do próprio `obj_description` e executá-la**, para a migration falhar se o que ficou gravado não roda.

- [ ] **Step 3: Provar nos quatro estados**

Em transação revertida, com a consulta **extraída do `obj_description`** e executada:
- config completa, sem parcelamento e sem sobra → `explicado = 0.00`;
- com parcelamento e desconto integral → `explicado = 0.00`;
- com **parcela que não cabe** (houve empurrão) → `explicado = 0.00`, e o resíduo bate com as causas declaradas;
- `folha_parametros` vazia (estado de produção hoje) → `explicado = 0.00`, com a causa de retido sem grupo respondendo pela diferença.

- [ ] **Step 4: Portão e commit**

```bash
npx vitest run
git add -A
git commit -m "docs(rh): a identidade da folha passa a somar o adiantamento descontado

Com parcelamento, o valor concedido e o valor descontado ficam em competências
diferentes, e a identidade fecha pelo descontado. A causa de resíduo por líquido
negativo sai, porque a Task anterior tornou líquido negativo inalcançável. A
consulta de diagnóstico gravada no comentário foi atualizada e a migration prova
que ela roda extraindo do próprio comentário e executando.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Quitação antecipada e antecipação no desligamento

**Modelo sugerido:** opus (duas funções de dinheiro, e a segunda amarra em cadastro).

**Files:**
- Migration nova: `adiantamento_quitar_e_antecipar`
- Modify: `src/modules/rh/adiantamentos/actions.ts` (action de quitar)
- Modify: `src/modules/cadastros/colaboradores/actions.ts` (antecipar ao inativar)

**Interfaces:**
- Produces: `fn_quitar_adiantamento(p_adiantamento uuid, p_competencia date) returns void`; `fn_antecipar_adiantamentos_colaborador(p_colaborador uuid) returns jsonb` devolvendo `{"parcelas": n, "competencia": "yyyy-mm-dd"}`; action `quitarAdiantamento(id: string, competencia: string): Promise<ResultadoAcao>`.

- [ ] **Step 1: Escrever as duas funções**

Via `apply_migration`, nome `adiantamento_quitar_e_antecipar`.

`fn_quitar_adiantamento`: exige `rh.adiantamentos:editar`; recusa se a folha da competência informada estiver `aprovado` ou `pendente_aprovacao` (a segunda mudaria o número que o Admin está analisando); recusa se não houver parcela em aberto, com mensagem dizendo isso em vez de criar parcela de zero; apaga as parcelas em aberto e insere **uma** com a soma delas, `numero` = maior + 1, na competência informada. Competência **sem folha nenhuma é válida**.

`fn_antecipar_adiantamentos_colaborador`: sem permissão própria além de `cadastros.colaboradores:editar` (é consequência de inativar); escolhe a competência com a regra exata da spec (folha em `rascunho` de **menor** competência; se não houver, o mês corrente em `America/Rio_Branco`); junta o saldo em aberto **por adiantamento** (uma parcela por adiantamento, não uma global); devolve `jsonb` com a quantidade de parcelas criadas e a competência; sem saldo, devolve `{"parcelas": 0}` e não faz nada.

**Rodar cada consulta nova isolada antes de embutir.** Trava `do $$` fail-closed conferindo que `anon` não executa nenhuma das duas.

- [ ] **Step 2: Provar as duas em banco**

Em transação revertida:
- quitar: total preservado (`sum(valor_previsto)` das parcelas do adiantamento continua igual ao valor concedido), uma parcela em aberto no lugar de N;
- quitar recusa em competência com folha `aprovado` e com folha `pendente_aprovacao`;
- quitar recusa quando não há parcela em aberto;
- quitar **preserva** as parcelas já descontadas (só as em aberto são juntadas);
- antecipar escolhe a folha em rascunho de menor competência quando há duas;
- antecipar cai no mês corrente quando não há folha;
- antecipar com **dois** adiantamentos gera **duas** parcelas, uma por adiantamento;
- antecipar sem saldo devolve `parcelas: 0` e não cria nada.

- [ ] **Step 3: Action de quitar**

Em `actions.ts`, espelhando o formato das outras actions do módulo (checagem de permissão, `idSchema`, `erroAcao`, `revalidatePath`):

```ts
/** Junta as parcelas em aberto do adiantamento numa só, na competência informada. */
export async function quitarAdiantamento(
  id: string,
  competencia: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para quitar adiantamentos" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Adiantamento inválido" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_quitar_adiantamento", {
    p_adiantamento: idValido.data,
    p_competencia: competencia,
  });

  if (error) {
    return erroAcao(
      "rh.adiantamentos.quitar",
      error,
      error.message || "Não foi possível quitar o adiantamento",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
```

- [ ] **Step 4: Antecipar ao inativar**

Localizar a action que salva colaborador (`src/modules/cadastros/colaboradores/actions.ts`) e o ponto onde `ativo` é gravado. Antes de gravar, ler o `ativo` atual; se estava `true` e vai para `false`, chamar `fn_antecipar_adiantamentos_colaborador` **depois** do update bem-sucedido, e devolver no resultado da action a informação para o toast (quantidade e competência), sem falhar a inativação se a antecipação não tiver o que fazer.

**Não usar trigger.** O motivo está na spec: efeito financeiro dentro de um `UPDATE` de cadastro é o que ninguém encontra depois, e o bloco anterior mostrou o custo (o trigger de guarda da folha é `BEFORE UPDATE OF status` e ficava cego a outras colunas).

- [ ] **Step 5: Portão e commit**

```bash
find src supabase -name "* [0-9].*" -delete
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
git add -A
git commit -m "feat(rh): quitar o saldo do adiantamento, e antecipar ao inativar o colaborador

Quitar junta as parcelas em aberto numa só, preservando o total, e recusa
competência com folha aprovada ou em aprovação. Inativar colaborador com saldo
antecipa o restante para a folha em rascunho de menor competência, avisando quem
inativou. Não é trigger de propósito: efeito em dinheiro tem que ser visível
para quem o causou.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Telas

**Modelo sugerido:** sonnet (várias telas, padrões existentes, sem SQL de dinheiro).

**Files:**
- Modify: `src/modules/rh/adiantamentos/queries.ts`, `components/adiantamento-form-drawer.tsx`, `components/adiantamentos-tabela.tsx`
- Modify: `src/modules/rh/folha/components/holerite-dialog.tsx`
- Modify: `src/modules/rh/alertas/calculo.ts`, `queries.ts`, `components/painel-alertas.tsx`
- Test: `src/modules/rh/adiantamentos/parcelamento.test.ts` (prévia), `src/modules/rh/alertas/calculo.test.ts`

**Interfaces:**
- Consumes: `dividirEmParcelas`, `MAX_PARCELAS` (Task 1); `quitarAdiantamento` (Task 5).
- Produces: `AdiantamentoLista` ganha `parcelasTotal: number`, `parcelasDescontadas: number`, `saldo: number`; `montarPrevia(total: number, quantidade: number, competenciaInicial: string): { competencia: string; valor: number }[]`.

- [ ] **Step 1: Teste da prévia (falha primeiro)**

Em `parcelamento.test.ts`, acrescentar:

```ts
import { montarPrevia } from "@/modules/rh/adiantamentos/parcelamento";

describe("montarPrevia", () => {
  it("distribui as parcelas em meses consecutivos a partir da competência", () => {
    expect(montarPrevia(1200, 3, "2026-09")).toEqual([
      { competencia: "2026-09", valor: 400 },
      { competencia: "2026-10", valor: 400 },
      { competencia: "2026-11", valor: 400 },
    ]);
  });

  it("vira o ano", () => {
    expect(montarPrevia(600, 3, "2026-11")).toEqual([
      { competencia: "2026-11", valor: 200 },
      { competencia: "2026-12", valor: 200 },
      { competencia: "2027-01", valor: 200 },
    ]);
  });

  it("devolve lista vazia com entrada inválida, sem quebrar a tela", () => {
    expect(montarPrevia(0, 3, "2026-09")).toEqual([]);
    expect(montarPrevia(1200, 0, "2026-09")).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar, ver falhar, implementar `montarPrevia`, ver passar**

Implementar em `parcelamento.ts` usando `dividirEmParcelas` e aritmética de mês em UTC (o padrão de `vencimento.ts` do bloco anterior: `Date.UTC` para data civil, sem fuso).

Run: `npx vitest run src/modules/rh/adiantamentos/parcelamento.test.ts` → PASS.

- [ ] **Step 3: Queries com plano e saldo**

`listarAdiantamentos` passa a trazer, numa **única** leitura (embed de `rh_adiantamento_parcelas`), a contagem de parcelas, quantas foram descontadas e o saldo (`sum(valor_previsto) - sum(valor_descontado)`). A agregação é **função pura** em `parcelamento.ts`, testada, não três consultas: no bloco anterior a página do detalhe da folha teve que ser corrigida por fazer três leituras onde uma bastava.

- [ ] **Step 4: Form com o campo e a prévia**

`adiantamento-form-drawer.tsx`: campo "Parcelas" (`<Input type="number" min={1} max={60}>`, que é o padrão do repo para inteiro simples — `InputNumerico` não é exportado e os canônicos exportados são decimais), com valor inicial `"1"`, e uma prévia embaixo listando competência e valor de cada parcela, recalculada a cada mudança de valor, parcelas ou competência. Deixar explícito na tela que a prévia é informativa.

- [ ] **Step 5: Tabela, detalhe e ação de quitar**

Coluna de parcelamento ("3x de R$ 400,00", e "À vista" quando é uma), coluna de saldo com `MoneyText`, e no detalhe (ou numa expansão da linha) a lista de parcelas com competência, previsto, descontado e link para a folha que descontou — link só para quem pode ver folha, texto sem link para quem não pode, espelhando o que a coluna "No Financeiro" já faz.

Ação "Quitar saldo" com `ConfirmDialog` pedindo a competência de destino, visível só com `rh.adiantamentos:editar` e só quando há saldo em aberto.

- [ ] **Step 6: Holerite e alerta**

`holerite-dialog.tsx`: o desconto de adiantamento passa a identificar a parcela ("Adiantamento 2/3") quando houver mais de uma. Buscar a informação junto do item da folha, sem leitura extra por colaborador.

`alertas/calculo.ts`: categoria nova, colaborador **inativo** com saldo de adiantamento em aberto, com teste na função pura (inativo com saldo aparece; inativo sem saldo não; ativo com saldo não). É a rede para o registro que escapou da antecipação da Task 5.

- [ ] **Step 7: Portão e commit**

```bash
find src supabase -name "* [0-9].*" -delete
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
git add -A
git commit -m "feat(rh): tela do adiantamento mostra o plano de parcelas e o saldo

Campo de parcelas com prévia informativa (o servidor recalcula), colunas de
parcelamento e saldo, lista de parcelas com a folha que descontou, e ação de
quitar. Holerite identifica a parcela, e o painel de alertas ganha colaborador
inativo com saldo em aberto.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Portão final, prova de aceite e registro

**Modelo sugerido:** opus.

- [ ] **Step 1: Portão verde**

```bash
find src supabase -name "* [0-9].*" -delete
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

- [ ] **Step 2: Advisors** (segurança e performance). Baseline: 69 achados de segurança, dominados por 65 do lint `authenticated_security_definer_function_executable`. `rh_adiantamento_parcelas` **não** pode aparecer em `rls_enabled_no_policy`. Reportar qualquer achado novo.

- [ ] **Step 3: Prova de aceite ponta a ponta**

Em transação revertida, cenário com 3 colaboradores CLT em centros de custo distintos, faixas de INSS/IRRF, encargos em 2 grupos e um sem grupo, parâmetros completos, e:
- um adiantamento à vista (1 parcela);
- um parcelado em 3 que cabe;
- um parcelado cuja parcela **não cabe** no salário;
- dois adiantamentos no mesmo mês para o mesmo colaborador.

Provar: a identidade com o termo novo (`explicado = 0.00`, consulta extraída do `obj_description`); nenhum líquido negativo; a cascata na ordem declarada; regenerar a folha 3x com resultado idêntico; quitação; antecipação ao inativar.

Sobre desaprovar: a `fn_desaprovar_folha` **não** toca `rh_adiantamentos` nem as parcelas, por desenho — quem libera o vínculo é a regeneração. Prove os dois caminhos e reporte divergência em vez de consertar: **desaprovar e regerar** (as parcelas voltam a ficar em aberto, as geradas por empurrão são apagadas) e **desaprovar e reaprovar sem regerar** (as parcelas seguem apontando para a mesma folha, com os mesmos valores, e a identidade continua fechando).

- [ ] **Step 4: Conferir as migrations** — todas as versões novas com arquivo homônimo em `supabase/migrations/` e SQL executável igual ao ledger (receita normalizada de `docs/decisoes.md`). Reportar a tabela versão × md5.

- [ ] **Step 5: Registrar em `docs/decisoes.md`** uma entrada nova (seguindo o formato das existentes) com: a mudança de natureza do adiantamento (vale do mês → amortizado, com saldo a receber que o Financeiro mostra como despesa paga); a nova definição da identidade; a regra de cascata; e o fechamento do gap do líquido negativo.

- [ ] **Step 6: Não fazer merge.** O merge é do coordenador, depois do review amplo.

---

## Self-review deste plano

**Cobertura da spec:**

| seção da spec | task |
|---|---|
| 1. Modelo (tabela, `folha_id` sai, sem coluna de quantidade) | 2 e 3 (contract) |
| 2. Divisão em parcelas + limites nas três camadas | 1 (Zod e teste), 2 (check no banco), 6 (input) |
| 3. `fn_gerar_folha` (cálculo, cascata, empurrão, idempotência) | 3 |
| 4. Identidade e o texto que a explica | 4 |
| 5. Quitação antecipada | 5 |
| 6. Antecipação no desligamento | 5 |
| 7. Telas (form, listagem, detalhe, quitar, holerite, alertas) | 6 |
| 8. Testes e definição de pronto | 1, 3 (Step 5), 4 (Step 3), 5 (Step 2), 7 |

**Um ponto que a spec não previu e o plano acrescentou:** o check
`rh_adiant_parcelas_descontado_com_folha` cria um caso que a spec não trata — parcela que não
coube **nada** (desconto zero). O plano decide que ela fica **aberta e sem `folha_id`**, e o
Step 3 da Task 3 manda provar os dois caminhos. Sem isso, o `update` violaria o check e a
geração da folha abortaria no primeiro colaborador sem saldo disponível.

**Dois riscos, os dois já medidos no banco durante este self-review** (em vez de deixados como
dúvida para o implementador descobrir do jeito difícil):

1. **`fn_excluir_adiantamento` usa `rh_adiantamentos.folha_id`** e quebraria no contract. Ela é
   reescrita na mesma migration do drop, na Task 3, Step 4(a), com o SQL já no plano. As duas
   funções que citam a coluna hoje (essa e a `fn_gerar_folha`) são exatamente as duas que a
   Task 3 reescreve, e o grep-guard do Step 4 tem que voltar zero antes do drop.
2. **A trava `garantirEmAberto` vai ler uma tabela nova por RLS.** `rh_adiantamento_parcelas`
   libera select com `rh.adiantamentos:ver`, então um perfil com `editar` sem `ver` leria vazio e
   a trava falharia **aberta**. É o mesmo padrão que já mordeu este projeto três vezes (EPI no
   painel de alertas, a trava de pagamento do Bloco 8a, e a seção de lançamentos da folha). O
   Step 4 manda usar predicado definer com gate fail-closed, espelhando
   `fn_adiantamento_pagamento_comprometido`.

**Risco de execução que sobra:** `fn_gerar_folha` será alterada pela terceira vez em duas
semanas. O procedimento é o mesmo que funcionou nas duas anteriores: copiar a definição viva,
recriar a partir dela com `replace()` cirúrgico, e diffar depois esperando **apenas** os três
pontos de adiantamento e o cálculo do líquido.
