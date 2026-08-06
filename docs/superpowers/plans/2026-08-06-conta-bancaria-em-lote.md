# Conta bancária em lote nos lançamentos — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selecionar vários lançamentos na listagem do Financeiro e definir a conta bancária de todos numa ação, preenchendo só o que está vazio.

**Architecture:** Uma função `security definer` nova no banco faz o trabalho em uma transação, reusando a regra da `fn_definir_conta_lancamento` que já existe. Uma Server Action valida e chama a RPC. O `DataTable` canônico ganha seleção de linha **opt-in** (as outras 48 abas não mudam). A tela de lançamentos junta as peças: barra de lote, confirmação com contagem e valor, e resumo honesto no fim.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (Postgres 17, RLS, RPC), React Hook Form + Zod, TanStack Table, Vitest, sonner.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-06-conta-bancaria-em-lote-design.md`. Em caso de dúvida, a spec manda.
- **Migration é aplicada pelo MCP do Supabase (`apply_migration`), NUNCA por `supabase db push`.** Ver `docs/decisoes.md`, entrada de 06/08/2026: o push tentaria aplicar 155 migrations cujo efeito já está no banco.
- Toda função nova: `security definer`, `set search_path to ''`, `revoke all ... from public`, `grant execute ... to authenticated`.
- Dinheiro é `numeric(14,2)`. Exibição BRL via `MoneyText`, alinhado à direita, `tabular-nums`.
- Id de registro valida por `idSchema` de `@/lib/id` (`z.guid()`), nunca por `z.uuid()`. A carga da BR-364 tem id derivado de md5 que o `z.uuid()` recusa.
- Teto de **500** lançamentos por chamada, checado na action **antes** do banco e de novo na função.
- Textos de UI em pt-BR, sentence case, o botão diz o que faz.
- Portão de cada task: `npx tsc --noEmit`, `npm run lint` (0 erros; 46 warnings é o baseline), `npx vitest run`. Antes do tsc, limpar duplicata do iCloud: `find .next \( -name "* [0-9].ts" -o -name "* [0-9].tsx" -o -name "* [0-9].d.ts" \) -delete`.
- Commits em português, no padrão do repo (`feat(financeiro): ...`).

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260806120001_conta_bancaria_em_lote.sql` (criar) | `fn_definir_conta_lancamentos_lote`, grants |
| `supabase/provas/conta_bancaria_em_lote.sql` (criar) | Prova em banco, `begin ... rollback` |
| `src/modules/financeiro/lancamentos/lote.ts` (criar) | Regra pura: elegibilidade, teto, texto do resumo |
| `src/modules/financeiro/lancamentos/lote.test.ts` (criar) | Testes da regra pura |
| `src/modules/financeiro/lancamentos/actions.ts` (modificar) | `definirContaLancamentosLote` |
| `src/modules/financeiro/lancamentos/queries.ts` (modificar) | `listarIdsLancamentosFiltrados` |
| `src/components/canonicos/data-table.tsx` (modificar) | Prop `selecao` opt-in + coluna de checkbox |
| `src/components/canonicos/data-table-selecao.test.tsx` (criar) | Testes da seleção, inclusive "sem a prop nada muda" |
| `src/modules/financeiro/lancamentos/components/lote-conta-bancaria.tsx` (criar) | Barra de lote + confirmação |
| `src/modules/financeiro/lancamentos/components/lote-conta-bancaria.test.tsx` (criar) | Testes do componente |
| `src/modules/financeiro/lancamentos/components/lancamentos-tabela.tsx` (modificar) | Liga seleção e barra na tela |

---

### Task 1: Função de lote no banco

**Files:**
- Create: `supabase/migrations/20260806120001_conta_bancaria_em_lote.sql`
- Create: `supabase/provas/conta_bancaria_em_lote.sql`

**Interfaces:**
- Consumes: `public.fn_aplicar_regra_pagamento(uuid)` e `public.tem_permissao(text, text)`, ambas já existem.
- Produces: `public.fn_definir_conta_lancamentos_lote(p_lanc_ids uuid[], p_conta_id uuid) returns jsonb`. O jsonb tem as chaves `definidos`, `pulados_com_conta`, `pulados_sem_parcela_pendente`, `nao_encontrados`, todas inteiras.

- [ ] **Step 1: Escrever a migration**

```sql
-- Define a conta bancaria de VARIOS lancamentos numa transacao.
--
-- Reusa a regra da fn_definir_conta_lancamento (migration
-- 20260730210001_conta_bancaria_portao_da_aprovacao.sql) e nao reimplementa
-- nada dela: mesma permissao, mesma exigencia de conta ativa, mesmo
-- `status <> 'pago'`, e o mesmo fn_aplicar_regra_pagamento no fim, que e o que
-- faz dinheiro e cartao andarem.
--
-- DIFERENCA DE PROPOSITO, decidida pelo Tiago em 06/08/2026: o lote SO PREENCHE
-- VAZIO. O `conta_bancaria_id is null` no where e o que garante isso no nivel da
-- PARCELA, e nao so do lancamento: lancamento "parcial" (uma parcela com conta,
-- duas sem) e completado nas vazias e nao perde a que ja tinha. Trocar conta ja
-- definida continua sendo um a um no detalhe do lancamento.
--
-- TETO de 500 por chamada: sem ele um clique vira update em milhares de parcelas
-- dentro de uma transacao, segurando lock numa tabela que o resto da empresa
-- esta usando.
create or replace function public.fn_definir_conta_lancamentos_lote(
  p_lanc_ids uuid[],
  p_conta_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ids uuid[];
  v_total int;
  v_existentes uuid[];
  v_elegiveis uuid[];
  v_com_conta int;
  v_sem_pendente int;
  v_id uuid;
begin
  if not public.tem_permissao('financeiro.lancamentos', 'editar') then
    raise exception 'Sem permissao para editar lancamentos';
  end if;

  -- Deduplica e tira nulos: id repetido na lista nao pode contar duas vezes no
  -- resumo, senao o numero que aparece para o usuario mente.
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
  from unnest(coalesce(p_lanc_ids, '{}'::uuid[])) as x
  where x is not null;

  v_total := coalesce(array_length(v_ids, 1), 0);
  if v_total = 0 then
    raise exception 'Nenhum lancamento informado';
  end if;
  if v_total > 500 then
    raise exception 'Limite de 500 lancamentos por vez (recebidos %)', v_total;
  end if;

  if p_conta_id is null then
    raise exception 'Selecione a conta bancaria';
  end if;
  if not exists (
    select 1 from public.contas_bancarias c where c.id = p_conta_id and c.ativo
  ) then
    raise exception 'Conta bancaria invalida ou inativa';
  end if;

  select coalesce(array_agg(l.id), '{}'::uuid[]) into v_existentes
  from public.lancamentos l where l.id = any(v_ids);

  -- Elegivel = tem ao menos uma parcela nao paga E sem conta.
  select coalesce(array_agg(distinct lp.lancamento_id), '{}'::uuid[])
  into v_elegiveis
  from public.lancamento_parcelas lp
  where lp.lancamento_id = any(v_existentes)
    and lp.status <> 'pago'
    and lp.conta_bancaria_id is null;

  -- Tem parcela pendente, mas todas ja com conta.
  select count(distinct lp.lancamento_id) into v_com_conta
  from public.lancamento_parcelas lp
  where lp.lancamento_id = any(v_existentes)
    and lp.status <> 'pago'
    and not (lp.lancamento_id = any(v_elegiveis));

  v_sem_pendente := coalesce(array_length(v_existentes, 1), 0)
    - coalesce(array_length(v_elegiveis, 1), 0)
    - v_com_conta;

  update public.lancamento_parcelas
  set conta_bancaria_id = p_conta_id
  where lancamento_id = any(v_elegiveis)
    and status <> 'pago'
    and conta_bancaria_id is null;

  -- Um por um de proposito: a regra de pagamento e por lancamento e pode mudar
  -- o status dele (dinheiro e cartao andam sozinhos quando a conta aparece).
  foreach v_id in array v_elegiveis loop
    perform public.fn_aplicar_regra_pagamento(v_id);
  end loop;

  return jsonb_build_object(
    'definidos', coalesce(array_length(v_elegiveis, 1), 0),
    'pulados_com_conta', v_com_conta,
    'pulados_sem_parcela_pendente', v_sem_pendente,
    'nao_encontrados', v_total - coalesce(array_length(v_existentes, 1), 0)
  );
end;
$$;

revoke all on function public.fn_definir_conta_lancamentos_lote(uuid[], uuid) from public;
grant execute on function public.fn_definir_conta_lancamentos_lote(uuid[], uuid) to authenticated;
```

- [ ] **Step 2: Escrever a prova em banco**

Criar `supabase/provas/conta_bancaria_em_lote.sql` com um `begin ... rollback` que monta 4 lançamentos e prova, com `assert`:

```sql
begin;

-- Cenario: 4 lancamentos, um de cada caso.
--   A: 2 parcelas nao pagas, ambas sem conta        -> elegivel, 2 gravadas
--   B: 2 parcelas, 1 com conta e 1 sem ("parcial")  -> elegivel, 1 gravada, a outra INTACTA
--   C: 2 parcelas nao pagas, ambas com conta        -> pulado_com_conta
--   D: 1 parcela paga sem conta                     -> pulado_sem_parcela_pendente
-- (usar os ids reais das obras/fornecedores/contas do banco; criar duas contas
--  bancarias ativas, CONTA_NOVA e CONTA_VELHA)

-- ... insert dos 4 lancamentos e das parcelas ...

select public.fn_definir_conta_lancamentos_lote(
  array[:'id_a', :'id_b', :'id_c', :'id_d']::uuid[],
  :'conta_nova'
) into temp resultado;

-- 1. o resumo conta a verdade
do $$ begin
  assert (select (r->>'definidos')::int from resultado r) = 2,
    'A e B deveriam ser os elegiveis';
  assert (select (r->>'pulados_com_conta')::int from resultado r) = 1, 'C';
  assert (select (r->>'pulados_sem_parcela_pendente')::int from resultado r) = 1, 'D';
  assert (select (r->>'nao_encontrados')::int from resultado r) = 0, 'nenhum sumiu';
end $$;

-- 2. parcela PAGA nunca e tocada
do $$ begin
  assert (select count(*) from public.lancamento_parcelas
          where status = 'pago' and conta_bancaria_id is not null
            and lancamento_id = :'id_d'::uuid) = 0,
    'parcela paga do D ganhou conta, e nao devia';
end $$;

-- 3. a parcela do B que JA tinha conta continua com a conta VELHA
do $$ begin
  assert (select count(*) from public.lancamento_parcelas
          where lancamento_id = :'id_b'::uuid
            and conta_bancaria_id = :'conta_velha'::uuid) = 1,
    'lote sobrescreveu conta que alguem ja tinha escolhido';
end $$;

-- 4. as parcelas de C continuam com a conta velha (nada sobrescrito)
do $$ begin
  assert (select count(*) from public.lancamento_parcelas
          where lancamento_id = :'id_c'::uuid
            and conta_bancaria_id = :'conta_nova'::uuid) = 0, 'C foi sobrescrito';
end $$;

-- 5. teto
do $$ declare v int; begin
  begin
    perform public.fn_definir_conta_lancamentos_lote(
      (select array_agg(gen_random_uuid()) from generate_series(1, 501)), :'conta_nova');
    assert false, 'aceitou 501, e o teto e 500';
  exception when others then null;
  end;
end $$;

-- 6. conta inativa e recusada
-- 7. lista vazia e recusada

rollback;
```

- [ ] **Step 3: Aplicar a migration em produção pelo MCP**

Usar o MCP do Supabase: `apply_migration` com `project_id` `vsesgvqjgqpapoxhnbqx` e `name` `20260806120001_conta_bancaria_em_lote`. **Não** usar `supabase db push`.

- [ ] **Step 4: Rodar a prova contra o banco**

Rodar o conteúdo de `supabase/provas/conta_bancaria_em_lote.sql` por `execute_sql` do MCP. Esperado: nenhum `assert` falha, e o `rollback` no fim não deixa nada.

- [ ] **Step 5: Rodar os advisors**

`get_advisors` com `type: "security"` e `type: "performance"`. Corrigir o que aparecer sobre a função nova.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260806120001_conta_bancaria_em_lote.sql supabase/provas/conta_bancaria_em_lote.sql
git commit -m "feat(financeiro): função de banco para definir conta bancária em lote"
```

---

### Task 2: Regra pura do lote

**Files:**
- Create: `src/modules/financeiro/lancamentos/lote.ts`
- Test: `src/modules/financeiro/lancamentos/lote.test.ts`

**Interfaces:**
- Produces:
  - `export const LIMITE_LOTE = 500`
  - `export interface ResumoLote { definidos: number; puladosComConta: number; puladosSemParcelaPendente: number; naoEncontrados: number }`
  - `export function textoResumoLote(resumo: ResumoLote): string`
  - `export function ehElegivelParaLote(linha: { revisao: FiltroRevisao }): boolean`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";

import {
  ehElegivelParaLote,
  LIMITE_LOTE,
  textoResumoLote,
} from "@/modules/financeiro/lancamentos/lote";

describe("ehElegivelParaLote", () => {
  it("sem conta e conta parcial entram", () => {
    expect(ehElegivelParaLote({ revisao: "sem_conta" })).toBe(true);
    // Parcial é lançamento quebrado (a conta deveria ser a mesma em todas as
    // pendentes) e o lote completa as vazias.
    expect(ehElegivelParaLote({ revisao: "parcial" })).toBe(true);
  });

  it("revisado não entra: já tem conta em tudo que está pendente", () => {
    expect(ehElegivelParaLote({ revisao: "revisado" })).toBe(false);
  });
});

describe("textoResumoLote", () => {
  it("caso limpo diz só o que foi feito", () => {
    expect(
      textoResumoLote({
        definidos: 275,
        puladosComConta: 0,
        puladosSemParcelaPendente: 0,
        naoEncontrados: 0,
      }),
    ).toBe("Conta definida em 275 lançamentos");
  });

  it("singular não diz '1 lançamentos'", () => {
    expect(
      textoResumoLote({
        definidos: 1,
        puladosComConta: 0,
        puladosSemParcelaPendente: 0,
        naoEncontrados: 0,
      }),
    ).toBe("Conta definida em 1 lançamento");
  });

  it("diz quantos foram pulados e por quê", () => {
    expect(
      textoResumoLote({
        definidos: 275,
        puladosComConta: 12,
        puladosSemParcelaPendente: 3,
        naoEncontrados: 0,
      }),
    ).toBe(
      "Conta definida em 275 lançamentos. 12 já tinham conta e 3 não tinham parcela em aberto: pulados",
    );
  });

  it("id que sumiu é dito, não escondido", () => {
    expect(
      textoResumoLote({
        definidos: 4,
        puladosComConta: 0,
        puladosSemParcelaPendente: 0,
        naoEncontrados: 2,
      }),
    ).toBe(
      "Conta definida em 4 lançamentos. 2 não foram encontrados: a lista estava velha, recarregue a tela",
    );
  });

  it("nada feito é dito como nada feito", () => {
    expect(
      textoResumoLote({
        definidos: 0,
        puladosComConta: 9,
        puladosSemParcelaPendente: 0,
        naoEncontrados: 0,
      }),
    ).toBe("Nenhuma conta definida. 9 já tinham conta: pulados");
  });
});

describe("LIMITE_LOTE", () => {
  it("é 500, o mesmo número que a função do banco recusa passar", () => {
    expect(LIMITE_LOTE).toBe(500);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/financeiro/lancamentos/lote.test.ts`
Expected: FAIL, "Failed to resolve import ... /lote".

- [ ] **Step 3: Implementar**

```ts
import type { FiltroRevisao } from "@/modules/financeiro/lancamentos/schemas";

/**
 * Teto de lançamentos por chamada. O MESMO número que a
 * `fn_definir_conta_lancamentos_lote` recusa passar: sem teto, um clique vira
 * update em milhares de parcelas dentro de uma transação, segurando lock numa
 * tabela que o resto da empresa está usando.
 */
export const LIMITE_LOTE = 500;

/** O que a função do banco devolve, já em camelCase. */
export interface ResumoLote {
  definidos: number;
  puladosComConta: number;
  puladosSemParcelaPendente: number;
  naoEncontrados: number;
}

/**
 * Lançamento em que o lote tem o que fazer.
 *
 * `parcial` entra: é um estado quebrado (a conta deveria ser a mesma em todas as
 * parcelas pendentes) e o lote completa as vazias, sem tocar na que já tem conta.
 */
export function ehElegivelParaLote(linha: { revisao: FiltroRevisao }): boolean {
  return linha.revisao === "sem_conta" || linha.revisao === "parcial";
}

function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

/** Frase do toast depois do lote. Diz o que foi feito e o que não foi. */
export function textoResumoLote(resumo: ResumoLote): string {
  const feito =
    resumo.definidos === 0
      ? "Nenhuma conta definida"
      : `Conta definida em ${plural(resumo.definidos, "lançamento", "lançamentos")}`;

  const ressalvas: string[] = [];
  if (resumo.puladosComConta > 0) {
    ressalvas.push(`${resumo.puladosComConta} já tinham conta`);
  }
  if (resumo.puladosSemParcelaPendente > 0) {
    ressalvas.push(
      `${resumo.puladosSemParcelaPendente} não tinham parcela em aberto`,
    );
  }

  const partes = [feito];
  if (ressalvas.length > 0) {
    partes.push(`${ressalvas.join(" e ")}: pulados`);
  }
  if (resumo.naoEncontrados > 0) {
    partes.push(
      `${resumo.naoEncontrados} não foram encontrados: a lista estava velha, recarregue a tela`,
    );
  }
  return partes.join(". ");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/financeiro/lancamentos/lote.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/lancamentos/lote.ts src/modules/financeiro/lancamentos/lote.test.ts
git commit -m "feat(financeiro): regra pura do lote de conta bancária"
```

---

### Task 3: Server Action e query dos ids do filtro

**Files:**
- Modify: `src/modules/financeiro/lancamentos/actions.ts`
- Modify: `src/modules/financeiro/lancamentos/queries.ts`

**Interfaces:**
- Consumes: `LIMITE_LOTE` e `ResumoLote` da Task 2; `fn_definir_conta_lancamentos_lote` da Task 1; `idSchema` de `@/lib/id`; `ListarLancamentosParams` (já existe em `queries.ts`).
- Produces:
  - `definirContaLancamentosLote(ids: string[], contaId: string): Promise<{ ok: true; resumo: ResumoLote } | { erro: string }>`
  - `listarIdsLancamentosFiltrados(params: Omit<ListarLancamentosParams, "pagina" | "tamanho">): Promise<string[]>`

- [ ] **Step 1: Escrever a action**

Em `actions.ts`, logo depois de `definirContaLancamento`:

```ts
/**
 * Define a mesma conta bancária em vários lançamentos, numa transação.
 *
 * Recebe IDS e não o filtro, de propósito: o que o usuário viu na tela é o que
 * muda, e lançamento criado entre o clique e a execução não entra de carona. O
 * preço é a lista poder envelhecer, e a resposta então diz quantos não foram
 * encontrados em vez de fingir sucesso.
 *
 * Só PREENCHE VAZIO: quem já tem conta é pulado e contado. A trava real está no
 * `where` da função do banco; aqui é validação de entrada e contrato.
 */
export async function definirContaLancamentosLote(
  ids: string[],
  contaId: string,
): Promise<{ ok: true; resumo: ResumoLote } | { erro: string }> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar lançamentos" };
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return { erro: "Selecione ao menos um lançamento" };
  }
  // Deduplica antes de contar: id repetido não pode consumir o teto nem inflar
  // o número que aparece para o usuário.
  const unicos = [...new Set(ids)];
  if (unicos.length > LIMITE_LOTE) {
    return {
      erro: `Selecione no máximo ${LIMITE_LOTE} lançamentos por vez (você selecionou ${unicos.length})`,
    };
  }
  if (unicos.some((id) => !idSchema.safeParse(id).success)) {
    return { erro: "Seleção inválida" };
  }

  const contaValida = idSchema.safeParse(contaId);
  if (!contaValida.success) return { erro: "Selecione a conta bancária" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "fn_definir_conta_lancamentos_lote",
    { p_lanc_ids: unicos, p_conta_id: contaValida.data },
  );

  if (error) {
    return erroAcao(
      "financeiro.lancamentos.definirContaLancamentosLote",
      error,
      error.message || "Não foi possível definir a conta bancária",
    );
  }

  const bruto = (data ?? {}) as Record<string, number>;
  revalidatePath(ROTA);
  revalidatePath("/financeiro/aprovacao-pagamentos");
  return {
    ok: true,
    resumo: {
      definidos: bruto.definidos ?? 0,
      puladosComConta: bruto.pulados_com_conta ?? 0,
      puladosSemParcelaPendente: bruto.pulados_sem_parcela_pendente ?? 0,
      naoEncontrados: bruto.nao_encontrados ?? 0,
    },
  };
}
```

Imports a acrescentar no topo de `actions.ts`:

```ts
import {
  LIMITE_LOTE,
  type ResumoLote,
} from "@/modules/financeiro/lancamentos/lote";
```

- [ ] **Step 2: Escrever a query dos ids do filtro**

Em `queries.ts`. **Reusar a montagem de filtro que `listarLancamentos` já faz** (extraia o trecho que aplica os filtros num helper interno `aplicarFiltros(query, params)` e chame dos dois lugares; duas montagens de filtro divergem no primeiro filtro novo).

```ts
/**
 * Só os ids do conjunto filtrado, para o "selecionar todos do filtro".
 *
 * Devolve id e nada mais: a tela não precisa da linha inteira para montar uma
 * seleção, e trazer 500 linhas completas para jogar fora é desperdício no
 * caminho mais quente da tela.
 *
 * Corta em LIMITE_LOTE + 1 de propósito: com um a mais que o teto, a tela sabe
 * dizer "tem mais que o limite, refine o filtro" sem contar tudo.
 */
export async function listarIdsLancamentosFiltrados(
  params: Omit<ListarLancamentosParams, "pagina" | "tamanho">,
): Promise<string[]> {
  const supabase = await createClient();
  let query = supabase.from("lancamentos").select("id");
  query = aplicarFiltros(query, params);
  const { data, error } = await query.limit(LIMITE_LOTE + 1);
  if (error) {
    logErroServidor("financeiro.lancamentos.listarIdsLancamentosFiltrados", error);
    return [];
  }
  return (data ?? []).map((linha) => linha.id);
}
```

- [ ] **Step 3: Portão**

```bash
find .next \( -name "* [0-9].ts" -o -name "* [0-9].tsx" -o -name "* [0-9].d.ts" \) -delete
npx tsc --noEmit && npm run lint && npx vitest run
```
Expected: tsc 0 erros, lint 0 erros, todos os testes passando.

- [ ] **Step 4: Commit**

```bash
git add src/modules/financeiro/lancamentos/actions.ts src/modules/financeiro/lancamentos/queries.ts
git commit -m "feat(financeiro): action e query do lote de conta bancária"
```

---

### Task 4: Seleção de linha no DataTable canônico

**Files:**
- Modify: `src/components/canonicos/data-table.tsx`
- Test: `src/components/canonicos/data-table-selecao.test.tsx`

**Interfaces:**
- Produces: prop `selecao` em `DataTableProps<TData>`:

```ts
export interface SelecaoDataTable<TData> {
  /** Chave estável da linha. */
  idDaLinha: (linha: TData) => string;
  selecionados: string[];
  onSelecionadosChange: (ids: string[]) => void;
  /** Desabilita o checkbox de certas linhas. Não usada na tela de lançamentos. */
  habilitada?: (linha: TData) => boolean;
}
```

- [ ] **Step 1: Escrever o teste que falha**

```tsx
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { DataTable } from "@/components/canonicos/data-table";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/financeiro/lancamentos",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

interface Linha {
  id: string;
  nome: string;
}

const DADOS: Linha[] = [
  { id: "a", nome: "LAN-1" },
  { id: "b", nome: "LAN-2" },
];

const COLUNAS = [{ accessorKey: "nome", header: "Nome" }] as never;

afterEach(cleanup);

describe("DataTable sem a prop selecao", () => {
  it("não renderiza checkbox nenhum: as outras 48 abas não mudam", () => {
    render(<DataTable columns={COLUNAS} data={DADOS} />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("DataTable com selecao", () => {
  it("marca uma linha e avisa quem manda", () => {
    const aoMudar = vi.fn();
    render(
      <DataTable
        columns={COLUNAS}
        data={DADOS}
        selecao={{
          idDaLinha: (l: Linha) => l.id,
          selecionados: [],
          onSelecionadosChange: aoMudar,
        }}
      />,
    );
    const caixas = screen.getAllByRole("checkbox");
    // 1 no cabeçalho + 1 por linha
    expect(caixas).toHaveLength(3);
    caixas[1].click();
    expect(aoMudar).toHaveBeenCalledWith(["a"]);
  });

  it("desmarca linha já selecionada", () => {
    const aoMudar = vi.fn();
    render(
      <DataTable
        columns={COLUNAS}
        data={DADOS}
        selecao={{
          idDaLinha: (l: Linha) => l.id,
          selecionados: ["a", "b"],
          onSelecionadosChange: aoMudar,
        }}
      />,
    );
    screen.getAllByRole("checkbox")[1].click();
    expect(aoMudar).toHaveBeenCalledWith(["b"]);
  });

  it("o checkbox do cabeçalho marca a página inteira", () => {
    const aoMudar = vi.fn();
    render(
      <DataTable
        columns={COLUNAS}
        data={DADOS}
        selecao={{
          idDaLinha: (l: Linha) => l.id,
          selecionados: [],
          onSelecionadosChange: aoMudar,
        }}
      />,
    );
    screen.getAllByRole("checkbox")[0].click();
    expect(aoMudar).toHaveBeenCalledWith(["a", "b"]);
  });

  it("o do cabeçalho desmarca a página sem apagar seleção de outra página", () => {
    const aoMudar = vi.fn();
    render(
      <DataTable
        columns={COLUNAS}
        data={DADOS}
        selecao={{
          idDaLinha: (l: Linha) => l.id,
          // "z" veio de outra página e não pode ser perdido.
          selecionados: ["a", "b", "z"],
          onSelecionadosChange: aoMudar,
        }}
      />,
    );
    screen.getAllByRole("checkbox")[0].click();
    expect(aoMudar).toHaveBeenCalledWith(["z"]);
  });

  it("habilitada=false não rende checkbox naquela linha", () => {
    render(
      <DataTable
        columns={COLUNAS}
        data={DADOS}
        selecao={{
          idDaLinha: (l: Linha) => l.id,
          selecionados: [],
          onSelecionadosChange: vi.fn(),
          habilitada: (l: Linha) => l.id !== "b",
        }}
      />,
    );
    // cabeçalho + só a linha "a"
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/canonicos/data-table-selecao.test.tsx`
Expected: FAIL. O primeiro teste passa (não há checkbox), os outros falham porque a prop `selecao` não existe.

- [ ] **Step 3: Implementar**

Em `data-table.tsx`: exportar a interface `SelecaoDataTable<TData>`, acrescentar `selecao?: SelecaoDataTable<TData>` em `DataTableProps`, e **prepender** a coluna de checkbox ao array de colunas quando a prop existe. Usar o `Checkbox` de `@/components/ui/checkbox`.

```tsx
/**
 * Coluna de seleção, prependada só quando a prop `selecao` existe.
 *
 * Fica fora da personalização de coluna (não entra no menu "Colunas" nem pode
 * ser reordenada ou redimensionada): esconder o checkbox por preferência
 * deixaria a barra de lote sem como marcar nada, e o usuário sem entender por quê.
 */
function colunaSelecao<TData>(
  selecao: SelecaoDataTable<TData>,
  linhasDaPagina: TData[],
): ColumnDef<TData, unknown> {
  const idsDaPagina = linhasDaPagina
    .filter((linha) => selecao.habilitada?.(linha) ?? true)
    .map(selecao.idDaLinha);
  const marcados = new Set(selecao.selecionados);
  const todosDaPagina =
    idsDaPagina.length > 0 && idsDaPagina.every((id) => marcados.has(id));

  return {
    id: "__selecao__",
    enableHiding: false,
    enableResizing: false,
    enableSorting: false,
    size: 44,
    header: () => (
      <Checkbox
        checked={todosDaPagina}
        aria-label="Selecionar todos desta página"
        onCheckedChange={() => {
          if (todosDaPagina) {
            // Só a página sai. Seleção de outra página é preservada.
            const daPagina = new Set(idsDaPagina);
            selecao.onSelecionadosChange(
              selecao.selecionados.filter((id) => !daPagina.has(id)),
            );
            return;
          }
          selecao.onSelecionadosChange([
            ...new Set([...selecao.selecionados, ...idsDaPagina]),
          ]);
        }}
      />
    ),
    cell: ({ row }) => {
      const linha = row.original;
      if (!(selecao.habilitada?.(linha) ?? true)) return null;
      const id = selecao.idDaLinha(linha);
      const marcado = marcados.has(id);
      return (
        <Checkbox
          checked={marcado}
          aria-label={`Selecionar ${id}`}
          // Sem isto, marcar o checkbox dispara o onRowClick e navega para o
          // detalhe no meio da seleção.
          onClick={(evento) => evento.stopPropagation()}
          onCheckedChange={() => {
            selecao.onSelecionadosChange(
              marcado
                ? selecao.selecionados.filter((outro) => outro !== id)
                : [...selecao.selecionados, id],
            );
          }}
        />
      );
    },
  };
}
```

No corpo do `DataTable`, montar as colunas finais:

```tsx
const colunasFinais = React.useMemo(
  () =>
    selecao
      ? [colunaSelecao(selecao, data), ...colunasComAcoes]
      : colunasComAcoes,
  [selecao, data, colunasComAcoes],
);
```

e passar `colunasFinais` no lugar de `colunasComAcoes` para o `useReactTable`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/components/canonicos/data-table-selecao.test.tsx`
Expected: PASS, 6 testes.

- [ ] **Step 5: Portão completo, porque este arquivo é usado por 49 telas**

```bash
find .next \( -name "* [0-9].ts" -o -name "* [0-9].tsx" -o -name "* [0-9].d.ts" \) -delete
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```
Expected: tudo verde, e a contagem de testes que já existia **não cai**.

- [ ] **Step 6: Commit**

```bash
git add src/components/canonicos/data-table.tsx src/components/canonicos/data-table-selecao.test.tsx
git commit -m "feat(tabelas): seleção de linha opt-in no DataTable canônico"
```

---

### Task 5: Barra de lote e confirmação

**Files:**
- Create: `src/modules/financeiro/lancamentos/components/lote-conta-bancaria.tsx`
- Test: `src/modules/financeiro/lancamentos/components/lote-conta-bancaria.test.tsx`

**Interfaces:**
- Consumes: `definirContaLancamentosLote` (Task 3), `textoResumoLote` e `LIMITE_LOTE` (Task 2), `ConfirmDialog` e `Combobox` canônicos, `MoneyText`.
- Produces:

```ts
export interface LoteContaBancariaProps {
  selecionados: string[];
  /** Valor total dos selecionados, para a confirmação mostrar o tamanho do estrago possível. */
  valorSelecionado: number;
  /** Quantos dos selecionados já têm conta (aparecem como pulados na confirmação). */
  jaComConta: number;
  contas: { valor: string; rotulo: string }[];
  onLimparSelecao: () => void;
  onConcluido: () => void;
}
```

- [ ] **Step 1: Escrever o teste que falha**

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

import { LoteContaBancaria } from "@/modules/financeiro/lancamentos/components/lote-conta-bancaria";
import { definirContaLancamentosLote } from "@/modules/financeiro/lancamentos/actions";

vi.mock("@/modules/financeiro/lancamentos/actions", () => ({
  definirContaLancamentosLote: vi.fn(async () => ({
    ok: true as const,
    resumo: {
      definidos: 2,
      puladosComConta: 1,
      puladosSemParcelaPendente: 0,
      naoEncontrados: 0,
    },
  })),
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

const CONTAS = [
  { valor: "conta-1", rotulo: "Caixa 1234" },
  { valor: "conta-2", rotulo: "Bradesco 5678" },
];

function montar(props: Partial<React.ComponentProps<typeof LoteContaBancaria>> = {}) {
  return render(
    <LoteContaBancaria
      selecionados={["a", "b", "c"]}
      valorSelecionado={4200000}
      jaComConta={1}
      contas={CONTAS}
      onLimparSelecao={vi.fn()}
      onConcluido={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.mocked(definirContaLancamentosLote).mockClear();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});
afterEach(cleanup);

describe("LoteContaBancaria", () => {
  it("não aparece sem seleção", () => {
    montar({ selecionados: [] });
    expect(screen.queryByText(/selecionado/i)).not.toBeInTheDocument();
  });

  it("mostra a contagem da seleção", () => {
    montar();
    expect(screen.getByText("3 selecionados")).toBeInTheDocument();
  });

  it("singular não diz '1 selecionados'", () => {
    montar({ selecionados: ["a"] });
    expect(screen.getByText("1 selecionado")).toBeInTheDocument();
  });

  it("acima do teto avisa e não deixa aplicar", () => {
    const muitos = Array.from({ length: 501 }, (_, i) => `id-${i}`);
    montar({ selecionados: muitos });
    expect(
      screen.getByText(/no máximo 500 lançamentos por vez/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /definir conta bancária/i }),
    ).toBeDisabled();
  });

  it("a confirmação diz quantos recebem, quantos são pulados, a conta e o valor", async () => {
    montar();
    await act(async () => {
      screen.getByRole("button", { name: /definir conta bancária/i }).click();
    });
    // escolhe a conta e confirma
    // (o Combobox canônico é aberto pelo gatilho e a opção é escolhida por texto)
    expect(screen.getByText(/2 lançamentos recebem/i)).toBeInTheDocument();
    expect(screen.getByText(/1 já tem conta e será pulado/i)).toBeInTheDocument();
    expect(screen.getByText(/R\$ 4.200.000,00/)).toBeInTheDocument();
  });

  it("erro da action vira toast de erro e a seleção fica", async () => {
    vi.mocked(definirContaLancamentosLote).mockResolvedValueOnce({
      erro: "Conta bancária invalida ou inativa",
    });
    const onLimpar = vi.fn();
    montar({ onLimparSelecao: onLimpar });
    // abre, escolhe conta, confirma
    // ...
    expect(toastMock.error).toHaveBeenCalledWith(
      "Conta bancária invalida ou inativa",
    );
    expect(onLimpar).not.toHaveBeenCalled();
  });

  it("sucesso mostra o resumo real e limpa a seleção", async () => {
    const onLimpar = vi.fn();
    const onConcluido = vi.fn();
    montar({ onLimparSelecao: onLimpar, onConcluido });
    // abre, escolhe conta, confirma
    // ...
    expect(toastMock.success).toHaveBeenCalledWith(
      "Conta definida em 2 lançamentos. 1 já tinham conta: pulados",
    );
    expect(onLimpar).toHaveBeenCalled();
    expect(onConcluido).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/financeiro/lancamentos/components/lote-conta-bancaria.test.tsx`
Expected: FAIL, "Failed to resolve import ... /lote-conta-bancaria".

- [ ] **Step 3: Implementar o componente**

Regras que o componente cumpre:
- Só renderiza quando `selecionados.length > 0`.
- Mostra `N selecionado(s)`, um botão "Definir conta bancária", e um "Limpar seleção".
- Acima de `LIMITE_LOTE`, mostra o aviso com o número e **desabilita** o botão.
- O botão abre um passo de escolha da conta (`Combobox` canônico, com busca, nunca o `Select` do shadcn) e depois o `ConfirmDialog`, cuja `descricao` diz: quantos recebem (`selecionados.length - jaComConta`), quantos são pulados e por quê, o **rótulo** da conta escolhida, e o valor total via `MoneyText`.
- Ao confirmar: chama a action, e em `erro` faz `toast.error(erro)` mantendo a seleção; em `ok` faz `toast.success(textoResumoLote(resumo))`, `onLimparSelecao()` e `onConcluido()`.
- O botão fica em estado de carregando durante a chamada, e não deixa clicar duas vezes.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/financeiro/lancamentos/components/lote-conta-bancaria.test.tsx`
Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/lancamentos/components/lote-conta-bancaria.tsx src/modules/financeiro/lancamentos/components/lote-conta-bancaria.test.tsx
git commit -m "feat(financeiro): barra de lote e confirmação da conta bancária"
```

---

### Task 6: Ligar na tela de lançamentos

**Files:**
- Modify: `src/modules/financeiro/lancamentos/components/lancamentos-tabela.tsx`
- Modify: `src/app/(app)/financeiro/lancamentos/page.tsx`

**Interfaces:**
- Consumes: tudo das tasks 2 a 5.

- [ ] **Step 1: Estado da seleção na tela**

```tsx
// A seleção vive na tela, e não no DataTable: quem sabe o que é elegível e o
// que fazer com a seleção é a tela. Sai da sessão de propósito (não usa
// useFiltroSessao): seleção lembrada entre visitas faria o usuário aplicar
// lote numa lista que ele não está mais olhando.
const [selecionados, setSelecionados] = React.useState<string[]>([]);

// Trocar de filtro ou de página zera a seleção: o que está marcado tem que ser
// o que está à vista.
React.useEffect(() => {
  setSelecionados([]);
}, [revisao, tipo, status, busca, pagina]);
```

- [ ] **Step 2: Passar a prop ao DataTable e montar a barra**

```tsx
<DataTable
  /* ...props que já existem... */
  selecao={{
    idDaLinha: (linha) => linha.id,
    selecionados,
    onSelecionadosChange: setSelecionados,
  }}
/>
```

E acima da tabela:

```tsx
<LoteContaBancaria
  selecionados={selecionados}
  valorSelecionado={linhas
    .filter((l) => selecionados.includes(l.id))
    .reduce((soma, l) => soma + l.valor, 0)}
  jaComConta={
    linhas.filter((l) => selecionados.includes(l.id) && !ehElegivelParaLote(l))
      .length
  }
  contas={opcoesContas}
  onLimparSelecao={() => setSelecionados([])}
  onConcluido={() => router.refresh()}
/>
```

- [ ] **Step 3: "Selecionar os N do filtro"**

Botão ao lado da contagem, visível quando `total > linhas.length`. Chama uma action fina que embrulha `listarIdsLancamentosFiltrados` com os filtros atuais, e:
- vindo `<= LIMITE_LOTE` ids, `setSelecionados(ids)`;
- vindo `LIMITE_LOTE + 1`, mostra `toast.error("O filtro achou mais de 500 lançamentos. Refine o filtro para aplicar em lote")` e **não** seleciona nada.

- [ ] **Step 4: Portão completo**

```bash
find .next \( -name "* [0-9].ts" -o -name "* [0-9].tsx" -o -name "* [0-9].d.ts" \) -delete
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

- [ ] **Step 5: Commit e PR**

```bash
git add -A src/
git commit -m "feat(financeiro): define a conta bancária de vários lançamentos de uma vez"
```

Abrir PR descrevendo: o problema (carga sem conta, um por um), as duas decisões do Tiago (checkbox + todos do filtro; só preenche vazio), as duas técnicas (ids e não filtro; teto de 500), e o portão. Esperar CI verde, mergear.

---

### Task 7: Companheiro, duração do toast por tipo

Trabalho independente, **PR separado**. Não misturar com as tasks 1 a 6.

**Files:**
- Create: `src/components/canonicos/toast.ts`
- Test: `src/components/canonicos/toast.test.ts`
- Modify: os 97 arquivos que importam `toast` de `"sonner"` (por codemod)

**Interfaces:**
- Produces: `export const toast` com a mesma superfície usada no app (`success`, `error`, `warning`, `info`), cada um aplicando a duração padrão do seu tipo e aceitando override por chamada.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it, vi } from "vitest";

const sonner = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: sonner }));

const { toast, DURACAO_TOAST } = await import("@/components/canonicos/toast");

describe("duração por tipo", () => {
  it("sucesso é curto: é confirmação, e o Tiago vê centenas por dia", () => {
    toast.success("Conta bancária definida");
    expect(sonner.success).toHaveBeenCalledWith("Conta bancária definida", {
      duration: DURACAO_TOAST.sucesso,
    });
    expect(DURACAO_TOAST.sucesso).toBeLessThan(DURACAO_TOAST.erro);
  });

  it("erro fica mais tempo: em app de dinheiro precisa de tempo de leitura", () => {
    toast.error("Não foi possível definir a conta bancária");
    expect(sonner.error).toHaveBeenCalledWith(
      "Não foi possível definir a conta bancária",
      { duration: DURACAO_TOAST.erro },
    );
    expect(DURACAO_TOAST.erro).toBeGreaterThanOrEqual(4000);
  });

  it("quem chamar pode passar duração própria e ela ganha", () => {
    toast.success("pronto", { duration: 100 });
    expect(sonner.success).toHaveBeenCalledWith("pronto", { duration: 100 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar.** Run: `npx vitest run src/components/canonicos/toast.test.ts`. Expected: FAIL, módulo não existe.

- [ ] **Step 3: Implementar**

```ts
import { toast as sonner } from "sonner";

/**
 * Quanto tempo cada tipo fica na tela, em ms.
 *
 * Sucesso é curto porque é confirmação de coisa que deu certo, e quem trabalha
 * em lote vê centenas por dia (foi o relato do Tiago em 06/08/2026, com print de
 * um "Conta bancária definida" atravessando a tela). Erro fica mais tempo: em
 * app de dinheiro, mensagem de erro que some antes de ser lida é pior do que
 * mensagem nenhuma.
 *
 * O sonner só tem duração GLOBAL, não por tipo, e é por isso que este módulo
 * existe em vez de um número no `<Toaster>`.
 */
export const DURACAO_TOAST = {
  sucesso: 2000,
  info: 3000,
  aviso: 5000,
  erro: 6000,
} as const;

type Opcoes = Parameters<typeof sonner.success>[1];

/** Mesma superfície do `toast` do sonner, com a duração certa por tipo. */
export const toast = {
  success: (mensagem: string, opcoes?: Opcoes) =>
    sonner.success(mensagem, { duration: DURACAO_TOAST.sucesso, ...opcoes }),
  error: (mensagem: string, opcoes?: Opcoes) =>
    sonner.error(mensagem, { duration: DURACAO_TOAST.erro, ...opcoes }),
  warning: (mensagem: string, opcoes?: Opcoes) =>
    sonner.warning(mensagem, { duration: DURACAO_TOAST.aviso, ...opcoes }),
  info: (mensagem: string, opcoes?: Opcoes) =>
    sonner.info(mensagem, { duration: DURACAO_TOAST.info, ...opcoes }),
};
```

- [ ] **Step 4: Rodar e ver passar.** Expected: PASS, 3 testes.

- [ ] **Step 5: Codemod nos 97 arquivos**

Trocar `import { toast } from "sonner";` por `import { toast } from "@/components/canonicos/toast";`. Só essa linha; nenhuma das 300 chamadas muda.

```bash
grep -rl 'from "sonner"' src/ --include='*.tsx' --include='*.ts' \
  | grep -v 'components/ui/sonner.tsx' \
  | grep -v 'components/canonicos/toast' \
  | xargs sed -i '' 's|import { toast } from "sonner";|import { toast } from "@/components/canonicos/toast";|'
```

Conferir que sobrou só o esperado importando do sonner direto:

```bash
grep -rn 'from "sonner"' src/ | grep -v components/ui/sonner.tsx | grep -v canonicos/toast
```
Expected: nada, ou só mocks de teste (que devem passar a mockar `@/components/canonicos/toast`).

- [ ] **Step 6: Portão completo + Commit**

```bash
find .next \( -name "* [0-9].ts" -o -name "* [0-9].tsx" -o -name "* [0-9].d.ts" \) -delete
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
git add -A src/
git commit -m "feat(ui): toast de sucesso sai rápido, o de erro fica"
```

---

## Auto-revisão deste plano

**Cobertura da spec:** Problema e objetivo → Tasks 1-6. Reuso da `fn_definir_conta_lancamento` → Task 1. Decisão 1 (checkbox + todos do filtro) → Tasks 4 e 6. Decisão 2 (só preenche vazio, `parcial` completado) → Task 1 Step 1 (o `is null` no where) e Task 2 (`ehElegivelParaLote`). Decisão 3 (ids, não filtro) → Task 3. Decisão 4 (teto 500) → Tasks 1, 2, 3 e 5. Retorno jsonb → Task 1, consumido na Task 3. Seleção opt-in no DataTable → Task 4, com o teste "sem a prop nada muda". Tabela de erros da spec → Task 3 (validação), Task 5 (toast de erro), Task 1 (exceptions). Testes (Vitest puro, componente, prova em banco) → Tasks 1, 2, 4, 5. Fora de escopo → respeitado: nenhuma task desfaz lote, agenda pagamento, aplica conta diferente por linha, ou espalha seleção para outras abas. Companheiro do toast → Task 7. **Sem lacuna.**

**Placeholders:** nenhum "TBD"/"depois"/"similar à Task N". Os dois pontos em que o plano descreve em vez de mostrar código são a Task 5 Step 3 (regras do componente, listadas uma por uma) e a Task 6 Step 3, e nos dois casos o comportamento exigido está enumerado e testado pelos testes escritos no step anterior, que são a especificação executável.

**Consistência de tipos:** `ResumoLote` em camelCase é criado na Task 2 e é o que a Task 3 devolve e a Task 5 consome. As chaves snake_case (`pulados_com_conta`) só existem no jsonb da Task 1 e são traduzidas uma única vez, na Task 3. `LIMITE_LOTE` = 500 é o mesmo número da função do banco, e a Task 2 tem teste amarrando os dois. `ehElegivelParaLote` recebe `{ revisao }`, e `LancamentoLista` tem esse campo (`queries.ts:83`). `SelecaoDataTable<TData>` é definida na Task 4 e usada na Task 6 com `idDaLinha: (linha) => linha.id`.
