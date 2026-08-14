# Relatórios interativos do Financeiro — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicar em qualquer dimensão dos 6 relatórios do Financeiro abre, em aba nova, os lançamentos daquela fatia com o mesmo filtro do relatório, e o total da lista fecha com a célula clicada; mais os filtros de análise no relatório de centro de custo.

**Architecture:** Um módulo puro (`relatorios/drill.ts`) monta a URL de destino a partir do estado do relatório e da célula clicada. A listagem de Lançamentos ganha dois parâmetros (`sem_cancelado` e `recorte`) e um campo `valorRecorte` que faz os cartões somarem a fatia em vez do valor cheio do documento. O relatório de centro de custo ganha contrato de URL próprio com 4 modos de período.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase (Postgres 17, RPC `fn_rel_*`), Vitest, Tailwind v4 + shadcn/ui, Recharts.

**Spec:** `docs/superpowers/specs/2026-08-14-relatorios-interativos-design.md`

## Global Constraints

- Dinheiro é `NUMERIC(14,2)`; somar em **centavos inteiros** e dividir por 100 só na borda (use `centavos`/`reais` de `resumo.ts` e `paraCentavos`/`paraReais` de `calculo.ts`). Float em valor é proibido.
- Timezone de exibição: `America/Rio_Branco`. Banco guarda `timestamptz` em UTC.
- `tsc --noEmit`, lint e build passando. **Sem `any` novo, sem `console.log`.**
- Migrations aplicadas **só** pelo MCP `apply_migration` no projeto `vsesgvqjgqpapoxhnbqx`. **`supabase db push` é PROIBIDO.** Arquivo versionado em `supabase/migrations/`, rollback em `supabase/rollbacks/`.
- RPC nova: `language sql`, `stable`, `set search_path to ''`, **sem `security definer`** (roda como o chamador, RLS do usuário vale). Grant de `execute` explícito para `authenticated`; `anon` não recebe nada.
- Dropdown é o **Combobox canônico com busca** (`FiltroSelect` na barra de filtros), nunca o `Select` do shadcn.
- Textos de UI em pt-BR, sentence case, voz ativa.
- Antes de rodar `tsc`, limpar duplicatas do iCloud: `find .next \( -name "* [0-9].ts" -o -name "* [0-9].tsx" -o -name "* [0-9].d.ts" \) -delete`
- Rodar os testes com `npx vitest run <arquivo>`.
- Nenhum teste deste plano pode ser escrito só contra o retrato de hoje: a base tem **0 cancelados, 0 previstos, 0 parcelas sem vencimento**, então o caminho errado passa. Todo teste de dinheiro constrói o caso parcial na mão.
- Asserção de BRL **pelo formatador** (`formatarBRL(...)`), nunca por literal: ele usa espaço não separável e `"R$ 1.234,56"` nunca bate.

---

### Task 1: `recorte.ts` — a fatia de parcela como valor tipado

**Files:**
- Create: `src/modules/financeiro/lancamentos/recorte.ts`
- Test: `src/modules/financeiro/lancamentos/recorte.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type FaixaAgingRecorte = "a_vencer" | "v_1_7" | "v_8_15" | "v_16_30" | "v_31_60" | "v_60_mais"`
  - `type Recorte = { tipo: "aging"; faixa: FaixaAgingRecorte; tipoLancamento: "a_pagar" | "a_receber" } | { tipo: "fluxo"; mes: string; realizado: boolean } | { tipo: "conta_paga" }`
  - `function lerRecorte(valor: string | string[] | undefined): Recorte | undefined`
  - `function escreverRecorte(recorte: Recorte): string`
  - `function rotuloRecorte(recorte: Recorte): string`
  - `function medidaDoRecorte(recorte: Recorte): "valor" | "liquido"`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import {
  escreverRecorte,
  lerRecorte,
  medidaDoRecorte,
  rotuloRecorte,
} from "@/modules/financeiro/lancamentos/recorte";

describe("lerRecorte", () => {
  it("lê a fatia de aging com faixa e tipo", () => {
    expect(lerRecorte("aging:v_8_15:a_pagar")).toEqual({
      tipo: "aging",
      faixa: "v_8_15",
      tipoLancamento: "a_pagar",
    });
  });

  it("lê a fatia de fluxo realizado e previsto", () => {
    expect(lerRecorte("fluxo:2026-07:realizado")).toEqual({
      tipo: "fluxo",
      mes: "2026-07",
      realizado: true,
    });
    expect(lerRecorte("fluxo:2026-07:previsto")).toEqual({
      tipo: "fluxo",
      mes: "2026-07",
      realizado: false,
    });
  });

  it("lê a fatia de conta paga", () => {
    expect(lerRecorte("conta_paga")).toEqual({ tipo: "conta_paga" });
  });

  // Lixo na URL não pode virar recorte: recorte inválido que passasse faria os
  // cartões somarem uma fatia que ninguém pediu, sem erro na tela.
  it.each([
    undefined,
    "",
    "banana",
    "aging",
    "aging:banana:a_pagar",
    "aging:v_8_15:a_prazo",
    "aging:v_8_15",
    "fluxo:2026-13:realizado",
    "fluxo:2026-7:realizado",
    "fluxo:2026-07:talvez",
    "fluxo:2026-07",
    "conta_paga:extra",
  ])("recusa %s", (entrada) => {
    expect(lerRecorte(entrada as string | undefined)).toBeUndefined();
  });

  it("recusa parâmetro repetido na URL (chega como array)", () => {
    expect(lerRecorte(["conta_paga", "aging:v_1_7:a_pagar"])).toBeUndefined();
  });
});

describe("escreverRecorte", () => {
  it("fecha o ciclo com lerRecorte", () => {
    for (const texto of [
      "aging:v_60_mais:a_receber",
      "fluxo:2026-01:previsto",
      "conta_paga",
    ]) {
      const recorte = lerRecorte(texto);
      expect(recorte).toBeDefined();
      expect(escreverRecorte(recorte!)).toBe(texto);
    }
  });
});

describe("rotuloRecorte", () => {
  it("descreve a fatia em pt-BR para o chip da barra", () => {
    expect(rotuloRecorte({ tipo: "aging", faixa: "v_8_15", tipoLancamento: "a_pagar" }))
      .toBe("Parcelas a pagar vencidas 8 a 15 dias");
    expect(rotuloRecorte({ tipo: "fluxo", mes: "2026-07", realizado: true }))
      .toBe("Parcelas pagas em 07/2026");
    expect(rotuloRecorte({ tipo: "fluxo", mes: "2026-07", realizado: false }))
      .toBe("Parcelas previstas para 07/2026");
    expect(rotuloRecorte({ tipo: "conta_paga" })).toBe("Parcelas pagas");
  });
});

describe("medidaDoRecorte", () => {
  // Cada fatia soma o que o relatório de origem soma. Aging é dívida viva (sem
  // desconto ainda); fluxo e posição bancária passaram pelo caixa, e o que passou
  // foi o líquido.
  it("aging soma valor, fluxo e conta paga somam líquido", () => {
    expect(medidaDoRecorte({ tipo: "aging", faixa: "a_vencer", tipoLancamento: "a_pagar" })).toBe("valor");
    expect(medidaDoRecorte({ tipo: "fluxo", mes: "2026-07", realizado: true })).toBe("liquido");
    expect(medidaDoRecorte({ tipo: "fluxo", mes: "2026-07", realizado: false })).toBe("liquido");
    expect(medidaDoRecorte({ tipo: "conta_paga" })).toBe("liquido");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/financeiro/lancamentos/recorte.test.ts`
Expected: FAIL — `Failed to resolve import ".../recorte"`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { rotuloMes } from "@/modules/financeiro/relatorios/calculo";

/**
 * A FATIA que um relatório recortou, quando essa fatia é de nível de PARCELA.
 *
 * Existe como valor tipado, e num parâmetro só da URL (`recorte`), por dois
 * motivos.
 *
 * Primeiro: não é filtro de usuário. O aging classifica faixa por dias de atraso
 * dentro de `fn_rel_aging`, e o fluxo de caixa agrupa o realizado pelo mês do
 * PAGAMENTO. Remontar isso no destino com `venc_de`/`venc_ate` erraria em 694
 * parcelas da base de hoje (as pagas em mês diferente do vencimento, medido em
 * 14/08/2026) e descartaria parcela sem vencimento, que o aging conta como "a
 * vencer". A fatia viaja pela chave da própria dimensão, nunca por uma
 * reconstrução dela.
 *
 * Segundo: cinco parâmetros soltos convidariam a combinações que nenhum relatório
 * produz e que ninguém validou. Um valor fechado só tem os estados que existem.
 *
 * Módulo puro: nada de banco, nada de React.
 */

export type FaixaAgingRecorte =
  | "a_vencer"
  | "v_1_7"
  | "v_8_15"
  | "v_16_30"
  | "v_31_60"
  | "v_60_mais";

export type TipoLancamentoRecorte = "a_pagar" | "a_receber";

export type Recorte =
  | { tipo: "aging"; faixa: FaixaAgingRecorte; tipoLancamento: TipoLancamentoRecorte }
  | { tipo: "fluxo"; mes: string; realizado: boolean }
  | { tipo: "conta_paga" };

/** Como cada fatia é somada: a MESMA medida do relatório que a gerou. */
export type MedidaRecorte = "valor" | "liquido";

const FAIXAS: FaixaAgingRecorte[] = [
  "a_vencer",
  "v_1_7",
  "v_8_15",
  "v_16_30",
  "v_31_60",
  "v_60_mais",
];

const TIPOS: TipoLancamentoRecorte[] = ["a_pagar", "a_receber"];

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

const ROTULO_FAIXA: Record<FaixaAgingRecorte, string> = {
  a_vencer: "a vencer",
  v_1_7: "vencidas 1 a 7 dias",
  v_8_15: "vencidas 8 a 15 dias",
  v_16_30: "vencidas 16 a 30 dias",
  v_31_60: "vencidas 31 a 60 dias",
  v_60_mais: "vencidas mais de 60 dias",
};

/** Lê e valida o `recorte` da URL. Qualquer coisa fora do contrato é undefined. */
export function lerRecorte(
  valor: string | string[] | undefined,
): Recorte | undefined {
  if (typeof valor !== "string" || valor === "") return undefined;

  if (valor === "conta_paga") return { tipo: "conta_paga" };

  const partes = valor.split(":");

  if (partes[0] === "aging" && partes.length === 3) {
    const faixa = partes[1] as FaixaAgingRecorte;
    const tipoLancamento = partes[2] as TipoLancamentoRecorte;
    if (!FAIXAS.includes(faixa) || !TIPOS.includes(tipoLancamento)) {
      return undefined;
    }
    return { tipo: "aging", faixa, tipoLancamento };
  }

  if (partes[0] === "fluxo" && partes.length === 3) {
    const mes = partes[1];
    if (!MES.test(mes)) return undefined;
    if (partes[2] !== "realizado" && partes[2] !== "previsto") return undefined;
    return { tipo: "fluxo", mes, realizado: partes[2] === "realizado" };
  }

  return undefined;
}

/** Serializa a fatia para a URL. Fecha o ciclo com `lerRecorte`. */
export function escreverRecorte(recorte: Recorte): string {
  switch (recorte.tipo) {
    case "aging":
      return `aging:${recorte.faixa}:${recorte.tipoLancamento}`;
    case "fluxo":
      return `fluxo:${recorte.mes}:${recorte.realizado ? "realizado" : "previsto"}`;
    case "conta_paga":
      return "conta_paga";
  }
}

/** Texto do chip da barra de filtros: diz que fatia está valendo. */
export function rotuloRecorte(recorte: Recorte): string {
  switch (recorte.tipo) {
    case "aging": {
      const tipo = recorte.tipoLancamento === "a_pagar" ? "a pagar" : "a receber";
      return `Parcelas ${tipo} ${ROTULO_FAIXA[recorte.faixa]}`;
    }
    case "fluxo":
      return recorte.realizado
        ? `Parcelas pagas em ${rotuloMes(recorte.mes)}`
        : `Parcelas previstas para ${rotuloMes(recorte.mes)}`;
    case "conta_paga":
      return "Parcelas pagas";
  }
}

/**
 * Aging soma `valor` (é dívida viva, o desconto só nasce no ato do pagamento);
 * fluxo e posição bancária somam o LÍQUIDO, porque foi o que passou no caixa.
 * É a mesma escolha que `fn_rel_aging`, `fn_rel_fluxo_caixa` e
 * `fn_rel_posicao_bancaria` fazem, e ela tem que continuar igual dos dois lados.
 */
export function medidaDoRecorte(recorte: Recorte): MedidaRecorte {
  return recorte.tipo === "aging" ? "valor" : "liquido";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/financeiro/lancamentos/recorte.test.ts`
Expected: PASS, todos os casos.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/lancamentos/recorte.ts src/modules/financeiro/lancamentos/recorte.test.ts
git commit -m "feat(financeiro): recorte de parcela como valor tipado da URL"
```

---

### Task 2: `sem_cancelado` e `recorte` no contrato de filtros da listagem

**Files:**
- Modify: `src/modules/financeiro/lancamentos/filtros.ts`
- Modify: `src/modules/financeiro/lancamentos/queries.ts` (só a interface `ListarLancamentosParams`)
- Test: `src/modules/financeiro/lancamentos/filtros.test.ts` (acréscimo)

**Interfaces:**
- Consumes: `lerRecorte`, `Recorte` da Task 1.
- Produces: `FiltrosLancamentos` ganha `semCancelado?: boolean` e `recorte?: Recorte`; `ValoresFiltrosLancamentos` ganha `semCancelado: string` (`"1"` ou `""`) e `recorte: string`.

- [ ] **Step 1: Write the failing test**

Acrescente ao fim de `filtros.test.ts`:

```ts
describe("lerFiltrosLancamentos: sem_cancelado e recorte", () => {
  it("lê sem_cancelado=1 como filtro e devolve o valor para a barra", () => {
    const { filtros, valores } = lerFiltrosLancamentos({ sem_cancelado: "1" });
    expect(filtros.semCancelado).toBe(true);
    expect(valores.semCancelado).toBe("1");
  });

  it("ignora sem_cancelado com qualquer outro valor", () => {
    for (const valor of ["0", "sim", "true", ""]) {
      const { filtros, valores } = lerFiltrosLancamentos({ sem_cancelado: valor });
      expect(filtros.semCancelado).toBeUndefined();
      expect(valores.semCancelado).toBe("");
    }
  });

  it("lê o recorte válido", () => {
    const { filtros, valores } = lerFiltrosLancamentos({
      recorte: "aging:v_16_30:a_pagar",
    });
    expect(filtros.recorte).toEqual({
      tipo: "aging",
      faixa: "v_16_30",
      tipoLancamento: "a_pagar",
    });
    expect(valores.recorte).toBe("aging:v_16_30:a_pagar");
  });

  // Recorte inválido não pode aparecer preenchido na barra: o usuário leria que
  // a lista está recortada quando ela não está.
  it("descarta recorte inválido do filtro E da barra", () => {
    const { filtros, valores } = lerFiltrosLancamentos({ recorte: "aging:banana:a_pagar" });
    expect(filtros.recorte).toBeUndefined();
    expect(valores.recorte).toBe("");
  });

  it("convive com os filtros que já existiam", () => {
    const { filtros } = lerFiltrosLancamentos({
      centro: "0a327d7e-6e2d-40d9-a87b-cf9b4a76be2e",
      mes: "2026-07",
      tipo: "a_pagar",
      sem_cancelado: "1",
    });
    expect(filtros.centroCustoId).toBe("0a327d7e-6e2d-40d9-a87b-cf9b4a76be2e");
    expect(filtros.mesCompetencia).toBe("2026-07-01");
    expect(filtros.tipo).toBe("a_pagar");
    expect(filtros.semCancelado).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/financeiro/lancamentos/filtros.test.ts`
Expected: FAIL — `filtros.semCancelado` e `filtros.recorte` não existem no tipo nem no retorno.

- [ ] **Step 3: Write minimal implementation**

Em `filtros.ts`, no topo, acrescente o import:

```ts
import { lerRecorte, type Recorte } from "@/modules/financeiro/lancamentos/recorte";
```

Em `ValoresFiltrosLancamentos`, acrescente os dois campos:

```ts
  /** "1" quando cancelados estão fora da lista, "" quando entram. */
  semCancelado: string;
  /** A fatia de parcela recortada por um relatório, como veio na URL. */
  recorte: string;
```

Dentro de `lerFiltrosLancamentos`, junto das outras leituras:

```ts
  // Só o literal "1" liga: qualquer outro texto é URL mal montada, e ligar um
  // filtro por engano some com linha da lista sem dizer por quê.
  const semCancelado = params.sem_cancelado === "1" ? true : undefined;
  const recorte = lerRecorte(params.recorte);
```

E no objeto de retorno, em `filtros` e em `valores`:

```ts
    filtros: {
      // ... o que já existia
      semCancelado,
      recorte,
    },
    valores: {
      // ... o que já existia
      semCancelado: semCancelado ? "1" : "",
      recorte: recorte ? params.recorte as string : "",
    },
```

Em `queries.ts`, em `ListarLancamentosParams`, acrescente:

```ts
  /**
   * Tira os cancelados da lista. Os relatórios de custo somam
   * `status <> 'cancelado'`, e o filtro de `status` só sabe escolher UM status,
   * não excluir um.
   */
  semCancelado?: boolean;
  /**
   * Fatia de nível de parcela recortada por um relatório. Ver
   * `lancamentos/recorte.ts`: ela decide quais lançamentos entram E como o
   * `valorRecorte` de cada um é somado.
   */
  recorte?: Recorte;
```

com o import correspondente em `queries.ts`:

```ts
import type { Recorte } from "@/modules/financeiro/lancamentos/recorte";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/financeiro/lancamentos/filtros.test.ts`
Expected: PASS, incluindo os testes que já existiam.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/lancamentos/filtros.ts src/modules/financeiro/lancamentos/filtros.test.ts src/modules/financeiro/lancamentos/queries.ts
git commit -m "feat(financeiro): sem_cancelado e recorte no contrato de filtros da listagem"
```

---

### Task 3: `valorRecorte` no resumo — o núcleo de dinheiro

**Files:**
- Modify: `src/modules/financeiro/lancamentos/resumo.ts`
- Modify: `src/modules/financeiro/lancamentos/queries.ts` (interface `LancamentoLista`)
- Test: `src/modules/financeiro/lancamentos/resumo.test.ts` (acréscimo)

**Interfaces:**
- Consumes: `Recorte`, `medidaDoRecorte` da Task 1.
- Produces:
  - `LancamentoLista` ganha `valorRecorte: number | null`
  - `ResumoLancamentos` ganha `valorNoRecorte: number` e `temRecorte: boolean`
  - `function valorDasParcelasNoRecorte(parcelas: ParcelaParaResumo[], medida: MedidaRecorte): number`

- [ ] **Step 1: Write the failing test**

Acrescente ao fim de `resumo.test.ts`:

```ts
import {
  resumirLancamentos,
  valorDasParcelasNoRecorte,
} from "@/modules/financeiro/lancamentos/resumo";

/** Uma linha de listagem mínima, para montar o caso na mão. */
function linha(
  parcial: Partial<LancamentoLista> & { valor: number },
): LancamentoLista {
  return {
    id: parcial.id ?? "id",
    numero: null,
    tipo: "a_pagar",
    origem: "manual",
    descricao: "x",
    categoriaNome: null,
    fornecedorNome: null,
    dataVencimento: null,
    status: "a_pagar",
    qtdParcelas: 1,
    dataCompra: "2026-07-01",
    mesCompetencia: "2026-07-01",
    criadoEm: "2026-07-01T00:00:00Z",
    valorPago: 0,
    valorAberto: 0,
    valorVencido: 0,
    descontoObtido: 0,
    revisao: "nao-se-aplica",
    valorRecorte: null,
    ...parcial,
  };
}

describe("valorDasParcelasNoRecorte", () => {
  it("soma pelo valor quando a medida é valor", () => {
    const total = valorDasParcelasNoRecorte(
      [
        { status: "pendente", valor: 100, valorLiquido: 100, desconto: 0, dataVencimento: null },
        { status: "pago", valor: 200, valorLiquido: 180, desconto: 20, dataVencimento: null },
      ],
      "valor",
    );
    expect(total).toBe(300);
  });

  it("soma pelo líquido quando a medida é líquido", () => {
    const total = valorDasParcelasNoRecorte(
      [{ status: "pago", valor: 200, valorLiquido: 180, desconto: 20, dataVencimento: null }],
      "liquido",
    );
    expect(total).toBe(180);
  });

  // valor_liquido aceita nulo no banco (parcela antiga). Cair no valor cheio é a
  // mesma defesa que dinheiroDasParcelas já faz.
  it("cai no valor cheio quando o líquido é nulo", () => {
    const total = valorDasParcelasNoRecorte(
      [{ status: "pago", valor: 200, valorLiquido: null, desconto: 0, dataVencimento: null }],
      "liquido",
    );
    expect(total).toBe(200);
  });

  it("soma em centavos: 3 parcelas de 0,10 dão 0,30 exato", () => {
    const total = valorDasParcelasNoRecorte(
      [0.1, 0.1, 0.1].map((valor) => ({
        status: "pendente" as const,
        valor,
        valorLiquido: valor,
        desconto: 0,
        dataVencimento: null,
      })),
      "valor",
    );
    expect(total).toBe(0.3);
  });
});

describe("resumirLancamentos com recorte", () => {
  it("sem recorte, o total continua sendo o valor do documento", () => {
    const resumo = resumirLancamentos([linha({ valor: 100 }), linha({ valor: 50 })]);
    expect(resumo.valorTotal).toBe(150);
    expect(resumo.temRecorte).toBe(false);
    expect(resumo.valorNoRecorte).toBe(150);
  });

  // O caso que motivou tudo: lançamento rateado entre duas obras. A célula do
  // relatório contou só a parte daquele centro, e a lista tem que fechar com ela.
  it("com recorte, soma a fatia e não o valor cheio", () => {
    const resumo = resumirLancamentos([
      linha({ valor: 100_000, valorRecorte: 40_000 }),
      linha({ valor: 6_576, valorRecorte: 6_576 }),
    ]);
    expect(resumo.valorTotal).toBe(106_576);
    expect(resumo.temRecorte).toBe(true);
    expect(resumo.valorNoRecorte).toBe(46_576);
  });

  // Caso PARCIAL, não o extremo: uma linha recortada entre várias sem recorte.
  // Se o código somasse `valorRecorte ?? 0`, este teste pegaria; se somasse
  // sempre `valor`, este teste pegaria. Um caso "todas recortadas" não pega
  // nenhum dos dois.
  it("linha sem recorte no meio de linhas recortadas cai no valor cheio", () => {
    const resumo = resumirLancamentos([
      linha({ valor: 100, valorRecorte: 40 }),
      linha({ valor: 70, valorRecorte: null }),
      linha({ valor: 30, valorRecorte: 30 }),
    ]);
    expect(resumo.temRecorte).toBe(true);
    expect(resumo.valorNoRecorte).toBe(140);
  });

  it("recorte zerado é fatia de zero, não ausência de fatia", () => {
    const resumo = resumirLancamentos([linha({ valor: 100, valorRecorte: 0 })]);
    expect(resumo.temRecorte).toBe(true);
    expect(resumo.valorNoRecorte).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/financeiro/lancamentos/resumo.test.ts`
Expected: FAIL — `valorDasParcelasNoRecorte` não existe, `valorRecorte`/`temRecorte`/`valorNoRecorte` não existem nos tipos.

- [ ] **Step 3: Write minimal implementation**

Em `queries.ts`, em `LancamentoLista`, acrescente:

```ts
  /**
   * Quanto DESTE lançamento pertence à fatia que a URL recortou, ou `null`
   * quando não há recorte (e aí o total é o `valor` do documento, como sempre).
   *
   * Existe porque relatório e listagem somam grãos diferentes: o custo por centro
   * de custo soma `lancamento_rateios.valor`, e nos 121 lançamentos rateados
   * entre obras o valor do documento é MAIOR que a parte daquele centro. Sem este
   * campo, clicar numa célula de R$ 3,23 mi abriria uma lista somando R$ 3,29 mi,
   * e quem confere concluiria que um dos dois está errado.
   *
   * Zero é fatia de zero, e é diferente de `null`.
   */
  valorRecorte: number | null;
```

Em `resumo.ts`, acrescente a função e os dois campos do resumo:

```ts
import { type MedidaRecorte } from "@/modules/financeiro/lancamentos/recorte";

/**
 * Soma as parcelas JÁ FILTRADAS pela fatia, na medida que o relatório de origem
 * usa. Quem escolhe as parcelas é a consulta; aqui é só a soma, em centavos.
 */
export function valorDasParcelasNoRecorte(
  parcelas: ParcelaParaResumo[],
  medida: MedidaRecorte,
): number {
  let total = 0;
  for (const parcela of parcelas) {
    total +=
      medida === "liquido"
        ? centavos(parcela.valorLiquido ?? parcela.valor)
        : centavos(parcela.valor);
  }
  return reais(total);
}
```

Em `ResumoLancamentos`:

```ts
  /**
   * Soma da FATIA quando a URL recorta (rateio de um centro, ou parcelas de uma
   * faixa/mês/conta). Sem recorte é igual a `valorTotal`.
   */
  valorNoRecorte: number;
  /** Há recorte valendo? Decide se a tela mostra a coluna e o cartão da fatia. */
  temRecorte: boolean;
```

Em `VAZIO`, acrescente `valorNoRecorte: 0` e `temRecorte: false`.

Dentro do laço de `resumirLancamentos`:

```ts
    // `?? valor` e não `?? 0`: linha sem recorte contribui com o documento
    // inteiro. Zero é fatia de zero, e o `??` respeita isso.
    valorNoRecorte += centavos(item.valorRecorte ?? item.valor);
    if (item.valorRecorte !== null) temRecorte = true;
```

declarando `let valorNoRecorte = 0;` e `let temRecorte = false;` com os outros
acumuladores, e devolvendo `valorNoRecorte: reais(valorNoRecorte), temRecorte` no
objeto final.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/financeiro/lancamentos/resumo.test.ts`
Expected: PASS, e os testes que já existiam continuam passando sem alteração (o campo novo nasce `null`).

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/lancamentos/resumo.ts src/modules/financeiro/lancamentos/resumo.test.ts src/modules/financeiro/lancamentos/queries.ts
git commit -m "feat(financeiro): valorRecorte no resumo da listagem"
```

---

### Task 4: aplicar `sem_cancelado` e `recorte` na consulta, e preencher `valorRecorte`

**Files:**
- Modify: `src/modules/financeiro/lancamentos/queries.ts`
- Create: `supabase/migrations/20260814130000_fn_lancamentos_do_recorte.sql`
- Create: `supabase/rollbacks/20260814130000_fn_lancamentos_do_recorte_rollback.sql`

**Interfaces:**
- Consumes: `Recorte`, `medidaDoRecorte` (Task 1); `valorDasParcelasNoRecorte` (Task 3).
- Produces: `listarLancamentos` respeita `semCancelado` e `recorte`, e devolve `valorRecorte` preenchido.

- [ ] **Step 1: Escrever a migration da RPC de ids do recorte**

A classificação de faixa do aging e o mês do fluxo **não** podem ser reescritos em
TypeScript: eles são de `fn_rel_aging` e `fn_rel_fluxo_caixa`, e duas cópias divergem.
A RPC devolve, para uma fatia, o id do lançamento e quanto dele está na fatia.

```sql
-- Ids de lançamento e valor NA FATIA, para as fatias de nível de parcela que os
-- relatórios recortam (aging, fluxo de caixa, posição bancária).
--
-- Existe para a listagem de Lançamentos não reescrever em TypeScript a
-- classificação que já vive em fn_rel_aging (faixa por dias de atraso) e em
-- fn_rel_fluxo_caixa (mês do PAGAMENTO no realizado, mês programado no previsto).
-- Duas cópias da mesma regra divergem, e o sintoma é uma lista que abre sem erro
-- somando diferente da célula que foi clicada. Medido em 14/08/2026: 694 parcelas
-- foram pagas em mês diferente do vencimento, então a divergência não é hipótese.
--
-- Devolve o AGREGADO por lançamento (não a parcela), porque é disso que a
-- listagem precisa: quais lançamentos entram, e quanto de cada um está na fatia.
create or replace function public.fn_lancamentos_do_recorte(
  p_tipo_recorte text,
  p_faixa text default null,
  p_tipo_lancamento text default null,
  p_mes text default null,
  p_realizado boolean default null,
  p_conta uuid default null,
  p_hoje date default null
)
returns table (lancamento_id uuid, valor_no_recorte numeric)
language sql
stable
set search_path to ''
as $function$
  with corte as (
    select coalesce(p_hoje, (now() at time zone 'America/Rio_Branco')::date) as hoje
  ),
  parcela as (
    select
      p.lancamento_id,
      l.tipo as tipo_lancamento,
      p.status,
      p.valor,
      -- Mesma defesa de dinheiroDasParcelas: valor_liquido aceita nulo em
      -- parcela antiga, e aí o valor cheio é a melhor verdade disponível.
      coalesce(p.valor_liquido, p.valor) as liquido,
      p.conta_bancaria_id,
      p.data_vencimento - c.hoje as dias,
      case
        when p.status = 'pago'
          then to_char(coalesce(p.data_pagamento, p.data_vencimento), 'YYYY-MM')
        else to_char(coalesce(p.data_programada, p.data_vencimento), 'YYYY-MM')
      end as mes_fluxo
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    cross join corte c
    where l.status <> 'cancelado'
  ),
  -- Faixa de aging, idêntica à de fn_rel_aging: parcela sem vencimento é
  -- 'a_vencer', e as bordas usam >= para não deixar dia nenhum entre duas faixas.
  aging as (
    select lancamento_id, sum(valor) as total
    from (
      select b.lancamento_id, b.valor,
        case
          when b.dias is null  then 'a_vencer'
          when b.dias >= 0     then 'a_vencer'
          when b.dias >= -7    then 'v_1_7'
          when b.dias >= -15   then 'v_8_15'
          when b.dias >= -30   then 'v_16_30'
          when b.dias >= -60   then 'v_31_60'
          else                      'v_60_mais'
        end as faixa
      from parcela b
      where b.status in ('pendente', 'em_revisao', 'aprovado')
        and b.tipo_lancamento = p_tipo_lancamento
    ) f
    where p_tipo_recorte = 'aging' and f.faixa = p_faixa
    group by lancamento_id
  ),
  fluxo as (
    select lancamento_id, sum(liquido) as total
    from parcela
    where p_tipo_recorte = 'fluxo'
      and status <> 'cancelado'
      and mes_fluxo = p_mes
      and (status = 'pago') = p_realizado
    group by lancamento_id
  ),
  conta_paga as (
    select lancamento_id, sum(liquido) as total
    from parcela
    where p_tipo_recorte = 'conta_paga'
      and status = 'pago'
      and conta_bancaria_id is not null
      and (p_conta is null or conta_bancaria_id = p_conta)
    group by lancamento_id
  )
  select lancamento_id, total from aging
  union all
  select lancamento_id, total from fluxo
  union all
  select lancamento_id, total from conta_paga
$function$;

comment on function public.fn_lancamentos_do_recorte is
  'Ids e valor na fatia para os recortes de parcela (aging, fluxo, conta paga). Reusa a classificação de fn_rel_aging e fn_rel_fluxo_caixa para o total do drill-down fechar com a célula do relatório.';

-- Sem security definer: roda como o chamador, então a RLS de lancamentos e
-- lancamento_parcelas continua valendo. Grant explícito, anon não recebe nada.
revoke all on function public.fn_lancamentos_do_recorte(text, text, text, text, boolean, uuid, date) from public;
grant execute on function public.fn_lancamentos_do_recorte(text, text, text, text, boolean, uuid, date) to authenticated;
```

O rollback:

```sql
-- Rollback de 20260814130000_fn_lancamentos_do_recorte.sql
drop function if exists public.fn_lancamentos_do_recorte(text, text, text, text, boolean, uuid, date);
```

- [ ] **Step 2: Aplicar a migration e conferir que ela roda**

Aplique com o MCP `apply_migration`, `name = 20260814130000_fn_lancamentos_do_recorte`.

Depois confira que ela devolve linha, com `execute_sql`:

```sql
select count(*) as lancamentos, to_char(sum(valor_no_recorte),'FM999G999G999D00') as total
from fn_lancamentos_do_recorte('conta_paga', null, null, null, null, null, null);
```

Expected: contagem > 0 e total > 0 (há 7.701 parcelas, todas com conta e a maioria paga).

- [ ] **Step 3: Ligar os dois filtros na consulta**

Em `queries.ts`, junto de `idsPorCentroCusto`, acrescente o leitor da fatia:

```ts
/** Valor na fatia, por lançamento, para o recorte de nível de parcela. */
async function valoresDoRecorte(
  supabase: ClienteSupabase,
  recorte: Recorte,
): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc("fn_lancamentos_do_recorte", {
    p_tipo_recorte: recorte.tipo,
    p_faixa: recorte.tipo === "aging" ? recorte.faixa : null,
    p_tipo_lancamento: recorte.tipo === "aging" ? recorte.tipoLancamento : null,
    p_mes: recorte.tipo === "fluxo" ? recorte.mes : null,
    p_realizado: recorte.tipo === "fluxo" ? recorte.realizado : null,
    p_conta: null,
  });

  if (error) {
    // A mensagem do banco vai junto: sem ela, a falha chega como "não foi
    // possível" e descobrir o motivo vira adivinhação.
    throw new Error(`Não foi possível ler o recorte: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((linha) => [
      linha.lancamento_id,
      paraReais(paraCentavos(linha.valor_no_recorte)),
    ]),
  );
}
```

Em `listarLancamentos`, junto das outras listas de ids:

```ts
  // O recorte é filtro E medida: os ids entram na interseção, e o valor na fatia
  // vira o `valorRecorte` de cada linha mais adiante.
  const valoresRecorte = params.recorte
    ? await valoresDoRecorte(supabase, params.recorte)
    : null;
  if (valoresRecorte) listasDeIds.push([...valoresRecorte.keys()]);
```

e o `sem_cancelado` como predicado direto:

```ts
  if (params.semCancelado) consulta = consulta.neq("status", "cancelado");
```

No `map` que monta `LancamentoLista`, acrescente o campo:

```ts
      valorRecorte: valoresRecorte?.get(lancamento.id) ?? null,
```

Se `params.centroCustoId` estiver presente, o recorte por centro ganha precedência
(ver Task 5); aqui, o valor do recorte de parcela é o único que existe.

- [ ] **Step 4: Conferir que compila e que os testes seguem verdes**

Run: `find .next \( -name "* [0-9].ts" -o -name "* [0-9].tsx" -o -name "* [0-9].d.ts" \) -delete; npx tsc --noEmit`
Expected: sem erro.

Run: `npx vitest run src/modules/financeiro/lancamentos`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/lancamentos/queries.ts supabase/migrations/20260814130000_fn_lancamentos_do_recorte.sql supabase/rollbacks/20260814130000_fn_lancamentos_do_recorte_rollback.sql
git commit -m "feat(financeiro): consulta da listagem respeita sem_cancelado e recorte de parcela"
```

---

### Task 5: `valorRecorte` por centro de custo, com a precedência declarada

**Files:**
- Modify: `src/modules/financeiro/lancamentos/queries.ts`
- Test: `src/modules/financeiro/lancamentos/resumo.test.ts` (um teste de precedência)

**Interfaces:**
- Consumes: Task 4.
- Produces: com `centro` na URL, `valorRecorte` é a soma dos rateios daquele lançamento naquele centro, e ganha do recorte de parcela.

- [ ] **Step 1: Write the failing test**

Em `resumo.test.ts`, o teste da regra de precedência (a função pura que decide):

```ts
import { escolherValorRecorte } from "@/modules/financeiro/lancamentos/resumo";

describe("escolherValorRecorte", () => {
  it("sem nada, não há recorte", () => {
    expect(escolherValorRecorte(null, null)).toBeNull();
  });

  it("só centro: o recorte é o rateio", () => {
    expect(escolherValorRecorte(40_000, null)).toBe(40_000);
  });

  it("só parcela: o recorte é a fatia da parcela", () => {
    expect(escolherValorRecorte(null, 180)).toBe(180);
  });

  // Ratear o valor da parcela pela proporção do centro seria uma conta que
  // nenhum relatório pede. O centro ganha, e isso está travado aqui.
  it("os dois juntos: o centro ganha, não é o produto dos dois", () => {
    expect(escolherValorRecorte(40_000, 180)).toBe(40_000);
  });

  it("centro com zero ganha de parcela com valor (zero é fatia, não ausência)", () => {
    expect(escolherValorRecorte(0, 180)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/financeiro/lancamentos/resumo.test.ts`
Expected: FAIL — `escolherValorRecorte` não existe.

- [ ] **Step 3: Write minimal implementation**

Em `resumo.ts`:

```ts
/**
 * Qual fatia vale, quando a URL recorta por centro de custo E por parcela.
 *
 * O centro ganha. O produto dos dois (a parte do centro dentro das parcelas da
 * fatia) é uma conta que NENHUM relatório pede: o relatório de centro de custo
 * não tem dimensão de parcela, e os de parcela não têm dimensão de centro.
 * Inventar essa conta seria pior que não tê-la, porque ela apareceria na tela como
 * um número com aparência de verdade que ninguém sabe conferir.
 *
 * Zero é fatia de zero e ganha normalmente: a comparação é com `null`, não com
 * falsidade.
 */
export function escolherValorRecorte(
  valorNoCentro: number | null,
  valorNaParcela: number | null,
): number | null {
  if (valorNoCentro !== null) return valorNoCentro;
  return valorNaParcela;
}
```

Em `queries.ts`, `idsPorCentroCusto` passa a devolver também o valor por lançamento.
Acrescente uma função irmã (a existente continua servindo o filtro):

```ts
/** Valor rateado no centro, por lançamento: o recorte do centro de custo. */
async function valoresPorCentroCusto(
  supabase: ClienteSupabase,
  centroCustoId: string,
): Promise<Map<string, number>> {
  const rateios = await lerEmPaginas((de, ate) =>
    supabase
      .from("lancamento_rateios")
      .select("lancamento_id, valor")
      .eq("centro_custo_id", centroCustoId)
      .order("lancamento_id")
      .order("id")
      .range(de, ate),
  );

  // Um lançamento pode ter MAIS DE UM rateio no mesmo centro (nada no banco
  // impede), então soma em vez de sobrescrever.
  const porLancamento = new Map<string, number>();
  for (const rateio of rateios) {
    const atual = porLancamento.get(rateio.lancamento_id) ?? 0;
    porLancamento.set(
      rateio.lancamento_id,
      reaisDeCentavos(centavosDe(atual) + centavosDe(rateio.valor)),
    );
  }
  return porLancamento;
}
```

usando `paraCentavos`/`paraReais` de `calculo.ts` (importe-os com os nomes
`centavosDe`/`reaisDeCentavos` via alias para não colidir com os helpers locais):

```ts
import {
  paraCentavos as centavosDe,
  paraReais as reaisDeCentavos,
} from "@/modules/financeiro/relatorios/calculo";
```

Em `listarLancamentos`, troque o uso de `idsPorCentroCusto` por este, mantendo o
filtro:

```ts
  const valoresCentro = params.centroCustoId
    ? await valoresPorCentroCusto(supabase, params.centroCustoId)
    : null;
  if (valoresCentro) listasDeIds.push([...valoresCentro.keys()]);
```

e no `map`:

```ts
      valorRecorte: escolherValorRecorte(
        valoresCentro?.get(lancamento.id) ?? null,
        valoresRecorte?.get(lancamento.id) ?? null,
      ),
```

Remova `idsPorCentroCusto` se ela ficar sem uso, para não deixar duas leituras do
mesmo rateio no arquivo.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/financeiro/lancamentos`
Expected: PASS.

Run: `find .next \( -name "* [0-9].ts" -o -name "* [0-9].tsx" -o -name "* [0-9].d.ts" \) -delete; npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/lancamentos/resumo.ts src/modules/financeiro/lancamentos/resumo.test.ts src/modules/financeiro/lancamentos/queries.ts
git commit -m "feat(financeiro): recorte por centro de custo ganha do recorte de parcela"
```

---

### Task 6: a coluna e o cartão da fatia na tela de Lançamentos

**Files:**
- Modify: `src/modules/financeiro/lancamentos/components/lancamentos-tabela.tsx`
- Modify: `src/modules/financeiro/lancamentos/components/resumo-lancamentos-cartoes.tsx`
- Test: manual (é layout), mais o `tsc` e o build.

**Interfaces:**
- Consumes: `valorRecorte` em `LancamentoLista`, `valorNoRecorte`/`temRecorte` em `ResumoLancamentos`, `rotuloRecorte` (Task 1).
- Produces: nada que outra task consuma.

- [ ] **Step 1: Ler a tabela para achar onde a coluna entra**

Run: `grep -n "accessorKey\|id:\|header:" src/modules/financeiro/lancamentos/components/lancamentos-tabela.tsx | head -40`

A coluna nova entra **depois** de "Valor", porque ela só faz sentido lida ao lado
dele (o par "valor cheio / parte que é desta fatia").

- [ ] **Step 2: Acrescentar a coluna, visível só com recorte**

Na definição de colunas, depois da coluna de valor:

```tsx
  // Só existe quando a URL recorta. Coluna sempre visível mostrando o mesmo
   // número da de Valor em 99% das navegações seria ruído, e some com a largura
   // das colunas que importam.
  ...(temRecorte
    ? [
        {
          id: "valorRecorte",
          header: rotuloColunaRecorte,
          alinharDireita: true,
          cell: ({ row }: { row: { original: LancamentoLista } }) => (
            <MoneyText
              valor={row.original.valorRecorte ?? row.original.valor}
              className="text-detalhe"
            />
          ),
        },
      ]
    : []),
```

onde `temRecorte` e `rotuloColunaRecorte` chegam por prop da página. O rótulo é
`"No centro"` quando o recorte é de centro de custo, e `rotuloRecorte(recorte)`
quando é de parcela.

- [ ] **Step 3: Acrescentar o cartão da fatia**

Em `resumo-lancamentos-cartoes.tsx`, quando `resumo.temRecorte`, o **primeiro**
cartão passa a ser a fatia, porque é o número que a pessoa veio conferir:

```tsx
      {resumo.temRecorte ? (
        <KPICard
          titulo="Total no recorte"
          valor={<MoneyText valor={resumo.valorNoRecorte} />}
          detalhe={detalheRecorte}
        />
      ) : null}
```

com `detalheRecorte` dizendo de que fatia se trata (ex: "No centro 009 - Manutenção
da Rodovia BR-364/AC - Lote 09 & 10" ou "Parcelas pagas em 07/2026").

- [ ] **Step 4: Conferir tipos e build**

Run: `find .next \( -name "* [0-9].ts" -o -name "* [0-9].tsx" -o -name "* [0-9].d.ts" \) -delete; npx tsc --noEmit && npx next lint --dir src`
Expected: sem erro, sem `any` novo.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/lancamentos/components/
git commit -m "feat(financeiro): coluna e cartao da fatia recortada na listagem"
```

---

### Task 7: `drill.ts` — a URL de destino de cada relatório

**Files:**
- Create: `src/modules/financeiro/relatorios/drill.ts`
- Test: `src/modules/financeiro/relatorios/drill.test.ts`

**Interfaces:**
- Consumes: `escreverRecorte`, `Recorte` (Task 1).
- Produces:
  - `const ROTA_LANCAMENTOS = "/financeiro/lancamentos"`
  - `interface PeriodoCompetencia { mes?: string; de?: string; ate?: string }`
  - `interface FiltrosDoRelatorioDeCusto { categoriaId?: string; fornecedorId?: string; incluirPrevisto?: boolean }`
  - `function drillCentroCusto(a: { centroCustoId: string; periodo: PeriodoCompetencia; filtros: FiltrosDoRelatorioDeCusto }): string`
  - `function drillCategoriaCompetencia(a: { categoriaId: string; mes: string; tipo: "a_pagar" | "a_receber" }): string`
  - `function drillGrupoInsumo(a: { grupoId: string | null; periodo: PeriodoCompetencia }): string`
  - `function drillFluxoCaixa(a: { mes: string; tipo: "a_pagar" | "a_receber"; realizado: boolean }): string`
  - `function drillAging(a: { faixa: FaixaAgingRecorte; tipo: "a_pagar" | "a_receber" }): string`
  - `function drillContaBancaria(a: { contaId: string; tipo: "a_pagar" | "a_receber" }): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import {
  drillAging,
  drillCategoriaCompetencia,
  drillCentroCusto,
  drillContaBancaria,
  drillFluxoCaixa,
  drillGrupoInsumo,
} from "@/modules/financeiro/relatorios/drill";

/** Os parâmetros da URL, para asserir sem depender da ordem em que saem. */
function params(url: string): Record<string, string> {
  const [rota, query] = url.split("?");
  expect(rota).toBe("/financeiro/lancamentos");
  return Object.fromEntries(new URLSearchParams(query ?? ""));
}

describe("drillCentroCusto", () => {
  // Os filtros IMPLÍCITOS do relatório têm que viajar: ele soma a_pagar e exclui
  // cancelado. Sem eles o total da lista não fecha com a célula clicada.
  it("carrega centro, mês, tipo a_pagar e sem_cancelado", () => {
    const url = drillCentroCusto({
      centroCustoId: "fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0",
      periodo: { mes: "2026-07" },
      filtros: {},
    });
    expect(params(url)).toEqual({
      centro: "fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0",
      mes: "2026-07",
      tipo: "a_pagar",
      sem_cancelado: "1",
    });
  });

  it("traduz o período de/até em faixa de mês de referência", () => {
    const url = drillCentroCusto({
      centroCustoId: "fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0",
      periodo: { de: "2025-01", ate: "2026-07" },
      filtros: {},
    });
    const p = params(url);
    expect(p.comp_de).toBe("2025-01-01");
    expect(p.comp_ate).toBe("2026-07-31");
    expect(p.mes).toBeUndefined();
  });

  it("período total não manda limite nenhum de data", () => {
    const p = params(
      drillCentroCusto({
        centroCustoId: "fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0",
        periodo: {},
        filtros: {},
      }),
    );
    expect(p.mes).toBeUndefined();
    expect(p.comp_de).toBeUndefined();
    expect(p.comp_ate).toBeUndefined();
  });

  it("leva os filtros do relatório junto", () => {
    const p = params(
      drillCentroCusto({
        centroCustoId: "fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0",
        periodo: { mes: "2026-07" },
        filtros: {
          categoriaId: "11111111-1111-1111-1111-111111111111",
          fornecedorId: "22222222-2222-2222-2222-222222222222",
        },
      }),
    );
    expect(p.categoria).toBe("11111111-1111-1111-1111-111111111111");
    expect(p.fornecedor).toBe("22222222-2222-2222-2222-222222222222");
  });

  // O relatório exclui cancelado SEMPRE, mas previsto só quando o usuário pediu.
  it("com incluirPrevisto, não trava o status", () => {
    const p = params(
      drillCentroCusto({
        centroCustoId: "fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0",
        periodo: { mes: "2026-07" },
        filtros: { incluirPrevisto: true },
      }),
    );
    expect(p.sem_cancelado).toBe("1");
    expect(p.status).toBeUndefined();
  });
});

describe("drillCategoriaCompetencia", () => {
  it("leva categoria, mês e o tipo da linha do DRE", () => {
    expect(
      params(
        drillCategoriaCompetencia({
          categoriaId: "11111111-1111-1111-1111-111111111111",
          mes: "2026-07",
          tipo: "a_receber",
        }),
      ),
    ).toEqual({
      categoria: "11111111-1111-1111-1111-111111111111",
      mes: "2026-07",
      tipo: "a_receber",
      sem_cancelado: "1",
    });
  });
});

describe("drillGrupoInsumo", () => {
  it("grupo nulo (lançamento avulso) leva só o período", () => {
    expect(params(drillGrupoInsumo({ grupoId: null, periodo: { mes: "2026-07" } }))).toEqual({
      mes: "2026-07",
      tipo: "a_pagar",
      sem_cancelado: "1",
    });
  });

  // O grupo com insumo soma ITEM DE OC, não lançamento. Enquanto o destino for a
  // lista de lançamentos, esse total não fecha — então recusa em vez de abrir uma
  // lista que soma diferente da célula e ninguém percebe.
  it("recusa grupo com insumo, porque o total não fecharia", () => {
    expect(() =>
      drillGrupoInsumo({
        grupoId: "33333333-3333-3333-3333-333333333333",
        periodo: { mes: "2026-07" },
      }),
    ).toThrow(/item de OC/i);
  });
});

describe("drillFluxoCaixa", () => {
  it("realizado vira recorte de fluxo pago", () => {
    expect(params(drillFluxoCaixa({ mes: "2026-07", tipo: "a_pagar", realizado: true }))).toEqual({
      recorte: "fluxo:2026-07:realizado",
      tipo: "a_pagar",
    });
  });

  it("previsto vira recorte de fluxo previsto", () => {
    expect(params(drillFluxoCaixa({ mes: "2026-07", tipo: "a_receber", realizado: false }))).toEqual({
      recorte: "fluxo:2026-07:previsto",
      tipo: "a_receber",
    });
  });

  // Regime de CAIXA: mandar `mes` (que é competência) daria outra lista, sem erro.
  it("não manda mes de competência num drill de caixa", () => {
    expect(params(drillFluxoCaixa({ mes: "2026-07", tipo: "a_pagar", realizado: true })).mes)
      .toBeUndefined();
  });
});

describe("drillAging", () => {
  it("leva a faixa pela classificação do banco, não por datas", () => {
    const p = params(drillAging({ faixa: "v_8_15", tipo: "a_pagar" }));
    expect(p.recorte).toBe("aging:v_8_15:a_pagar");
    expect(p.venc_de).toBeUndefined();
    expect(p.venc_ate).toBeUndefined();
  });
});

describe("drillContaBancaria", () => {
  it("leva conta e o recorte de parcela paga", () => {
    expect(
      params(drillContaBancaria({ contaId: "44444444-4444-4444-4444-444444444444", tipo: "a_pagar" })),
    ).toEqual({
      conta: "44444444-4444-4444-4444-444444444444",
      recorte: "conta_paga",
      tipo: "a_pagar",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/financeiro/relatorios/drill.test.ts`
Expected: FAIL — `Failed to resolve import ".../drill"`.

- [ ] **Step 3: Write minimal implementation**

Nota: os testes usam `comp_de`/`comp_ate` (faixa de mês de referência), que **não
existe** hoje em `lancamentos/filtros.ts`. Acrescente-os lá também, no mesmo molde de
`periodo()`, lendo `params.comp_de`/`params.comp_ate` para
`competenciaDe`/`competenciaAte`, e aplique em `listarLancamentos` com
`.gte("mes_competencia", ...)` / `.lte("mes_competencia", ...)`. Sem isso o modo
`periodo` do relatório não tem para onde apontar.

```ts
import {
  escreverRecorte,
  type FaixaAgingRecorte,
  type TipoLancamentoRecorte,
} from "@/modules/financeiro/lancamentos/recorte";
import { proximoMes } from "@/modules/financeiro/relatorios/calculo";

/**
 * A URL de destino de cada clique nos relatórios.
 *
 * Mora num módulo próprio, e não dentro de cada componente de tabela, pelo mesmo
 * motivo que `lancamentos/filtros.ts` existe para a exportação: duas montagens da
 * mesma URL divergem no primeiro filtro que alguém acrescenta de um lado só, e o
 * sintoma é o pior possível — a lista abre sem erro nenhum mostrando um conjunto
 * diferente do que a célula somou.
 *
 * REGRA DO MÓDULO: o drill carrega a chave da dimensão do próprio relatório,
 * nunca uma reconstrução dela. Ver `lancamentos/recorte.ts` para o porquê medido.
 *
 * Cada função aceita só o recorte do REGIME do seu relatório, então trocar
 * competência por caixa não compila em vez de abrir a lista errada.
 *
 * Módulo puro: nada de React, nada de banco.
 */

export const ROTA_LANCAMENTOS = "/financeiro/lancamentos";

/** Período em regime de COMPETÊNCIA. Vazio significa sem limite (tudo). */
export interface PeriodoCompetencia {
  /** Um mês só (yyyy-MM). Exclui `de`/`ate`. */
  mes?: string;
  de?: string;
  ate?: string;
}

/** Os filtros do relatório de custo que viajam no clique. */
export interface FiltrosDoRelatorioDeCusto {
  categoriaId?: string;
  fornecedorId?: string;
  /** O relatório incluiu Previsto? Só muda o que NÃO é enviado. */
  incluirPrevisto?: boolean;
}

function montar(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== "") query.set(chave, valor);
  }
  const texto = query.toString();
  return texto ? `${ROTA_LANCAMENTOS}?${texto}` : ROTA_LANCAMENTOS;
}

/** Último dia do mês (yyyy-MM-dd), para fechar a ponta de cima do período. */
function fimDoMes(mes: string): string {
  const primeiroDoSeguinte = proximoMes(mes);
  const [ano, mesSeguinte] = primeiroDoSeguinte.split("-").map(Number);
  const anterior = new Date(Date.UTC(ano, mesSeguinte - 1, 0));
  return anterior.toISOString().slice(0, 10);
}

function periodoNaUrl(periodo: PeriodoCompetencia): Record<string, string | undefined> {
  if (periodo.mes) return { mes: periodo.mes };
  return {
    comp_de: periodo.de ? `${periodo.de}-01` : undefined,
    comp_ate: periodo.ate ? fimDoMes(periodo.ate) : undefined,
  };
}

/**
 * Filtros que o relatório de custo aplica SEMPRE, e que precisam viajar para o
 * total da lista fechar: ele soma `tipo = 'a_pagar'` e `status <> 'cancelado'`.
 */
const IMPLICITOS_CUSTO = { tipo: "a_pagar", sem_cancelado: "1" } as const;

export function drillCentroCusto({
  centroCustoId,
  periodo,
  filtros,
}: {
  centroCustoId: string;
  periodo: PeriodoCompetencia;
  filtros: FiltrosDoRelatorioDeCusto;
}): string {
  return montar({
    ...IMPLICITOS_CUSTO,
    centro: centroCustoId,
    ...periodoNaUrl(periodo),
    categoria: filtros.categoriaId,
    fornecedor: filtros.fornecedorId,
  });
}

export function drillCategoriaCompetencia({
  categoriaId,
  mes,
  tipo,
}: {
  categoriaId: string;
  mes: string;
  tipo: TipoLancamentoRecorte;
}): string {
  return montar({
    categoria: categoriaId,
    mes,
    tipo,
    sem_cancelado: "1",
  });
}

export function drillGrupoInsumo({
  grupoId,
  periodo,
}: {
  grupoId: string | null;
  periodo: PeriodoCompetencia;
}): string {
  if (grupoId !== null) {
    // Grupo com insumo soma `oc_itens.quantidade * preco_unitario`, não o valor
    // do lançamento. Abrir a lista de lançamentos aqui daria um total diferente
    // da célula, e é exatamente o defeito que este bloco existe para matar. Não
    // acontece hoje (há 0 ordens de compra), e falha alto no dia em que houver.
    throw new Error(
      "Drill de grupo com insumo não está implementado: o grupo soma item de OC, e a lista de lançamentos não fecharia com ele.",
    );
  }
  return montar({ ...IMPLICITOS_CUSTO, ...periodoNaUrl(periodo) });
}

export function drillFluxoCaixa({
  mes,
  tipo,
  realizado,
}: {
  mes: string;
  tipo: TipoLancamentoRecorte;
  realizado: boolean;
}): string {
  return montar({
    tipo,
    recorte: escreverRecorte({ tipo: "fluxo", mes, realizado }),
  });
}

export function drillAging({
  faixa,
  tipo,
}: {
  faixa: FaixaAgingRecorte;
  tipo: TipoLancamentoRecorte;
}): string {
  return montar({
    recorte: escreverRecorte({ tipo: "aging", faixa, tipoLancamento: tipo }),
  });
}

export function drillContaBancaria({
  contaId,
  tipo,
}: {
  contaId: string;
  tipo: TipoLancamentoRecorte;
}): string {
  return montar({
    conta: contaId,
    tipo,
    recorte: escreverRecorte({ tipo: "conta_paga" }),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/financeiro/relatorios/drill.test.ts src/modules/financeiro/lancamentos/filtros.test.ts`
Expected: PASS nos dois.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/relatorios/drill.ts src/modules/financeiro/relatorios/drill.test.ts src/modules/financeiro/lancamentos/filtros.ts src/modules/financeiro/lancamentos/queries.ts
git commit -m "feat(financeiro): contrato de drill-down dos relatorios e faixa de competencia na listagem"
```

---

### Task 8: contrato de URL do relatório de centro de custo

**Files:**
- Create: `src/modules/financeiro/relatorios/filtros-custo-cc.ts`
- Test: `src/modules/financeiro/relatorios/filtros-custo-cc.test.ts`

**Interfaces:**
- Consumes: `PeriodoCompetencia` (Task 7).
- Produces:
  - `type ModoPeriodo = "mes" | "periodo" | "total" | "vida"`
  - `interface FiltrosCustoCc { modo: ModoPeriodo; mes: string; de: string; ate: string; centroId?: string; categoriaId?: string; fornecedorId?: string; incluirPrevisto: boolean; tipoCentro?: "obra" | "escritorio" | "manutencao"; comparar: boolean }`
  - `function lerFiltrosCustoCc(params: ParametrosUrl, mesCorrente: string): { filtros: FiltrosCustoCc; erroDoModo?: string }`
  - `function periodoDoModo(filtros: FiltrosCustoCc, primeiroMesDoCentro?: string): PeriodoCompetencia`
  - `function periodoAnterior(periodo: PeriodoCompetencia): PeriodoCompetencia | null`
  - `function comparacaoPermitida(modo: ModoPeriodo): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import {
  comparacaoPermitida,
  lerFiltrosCustoCc,
  periodoAnterior,
  periodoDoModo,
} from "@/modules/financeiro/relatorios/filtros-custo-cc";

const MES_CORRENTE = "2026-08";
const CENTRO = "fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0";

describe("lerFiltrosCustoCc", () => {
  it("sem parâmetro nenhum, é o mês corrente", () => {
    const { filtros } = lerFiltrosCustoCc({}, MES_CORRENTE);
    expect(filtros.modo).toBe("mes");
    expect(filtros.mes).toBe(MES_CORRENTE);
    expect(filtros.comparar).toBe(false);
    expect(filtros.incluirPrevisto).toBe(false);
  });

  it("modo inválido cai no mês, sem inventar período", () => {
    const { filtros } = lerFiltrosCustoCc({ modo: "sempre" }, MES_CORRENTE);
    expect(filtros.modo).toBe("mes");
  });

  it("mês inválido na URL não vira filtro", () => {
    const { filtros } = lerFiltrosCustoCc({ mes: "2026-13" }, MES_CORRENTE);
    expect(filtros.mes).toBe(MES_CORRENTE);
  });

  it("período invertido é trocado de lado", () => {
    const { filtros } = lerFiltrosCustoCc(
      { modo: "periodo", de: "2026-07", ate: "2025-01" },
      MES_CORRENTE,
    );
    expect(filtros.de).toBe("2025-01");
    expect(filtros.ate).toBe("2026-07");
  });

  // Vida é por centro: sem centro escolhido, o modo não tem de onde tirar o
  // início e precisa DIZER isso, não cair calado em outro período.
  it("modo vida sem centro devolve o motivo", () => {
    const { filtros, erroDoModo } = lerFiltrosCustoCc({ modo: "vida" }, MES_CORRENTE);
    expect(filtros.modo).toBe("vida");
    expect(erroDoModo).toMatch(/centro de custo/i);
  });

  it("modo vida com centro não tem erro", () => {
    const { erroDoModo } = lerFiltrosCustoCc({ modo: "vida", centro: CENTRO }, MES_CORRENTE);
    expect(erroDoModo).toBeUndefined();
  });

  it("lê os demais filtros", () => {
    const { filtros } = lerFiltrosCustoCc(
      {
        categoria: "11111111-1111-1111-1111-111111111111",
        fornecedor: "22222222-2222-2222-2222-222222222222",
        previsto: "1",
        tipo_centro: "obra",
        comparar: "1",
      },
      MES_CORRENTE,
    );
    expect(filtros.categoriaId).toBe("11111111-1111-1111-1111-111111111111");
    expect(filtros.fornecedorId).toBe("22222222-2222-2222-2222-222222222222");
    expect(filtros.incluirPrevisto).toBe(true);
    expect(filtros.tipoCentro).toBe("obra");
    expect(filtros.comparar).toBe(true);
  });

  it("tipo_centro fora do catálogo não vira filtro", () => {
    const { filtros } = lerFiltrosCustoCc({ tipo_centro: "almoxarifado" }, MES_CORRENTE);
    expect(filtros.tipoCentro).toBeUndefined();
  });
});

describe("periodoDoModo", () => {
  it("mes devolve o mês", () => {
    const { filtros } = lerFiltrosCustoCc({ mes: "2026-07" }, MES_CORRENTE);
    expect(periodoDoModo(filtros)).toEqual({ mes: "2026-07" });
  });

  it("periodo devolve as duas pontas", () => {
    const { filtros } = lerFiltrosCustoCc(
      { modo: "periodo", de: "2025-01", ate: "2026-07" },
      MES_CORRENTE,
    );
    expect(periodoDoModo(filtros)).toEqual({ de: "2025-01", ate: "2026-07" });
  });

  it("total não devolve limite nenhum", () => {
    const { filtros } = lerFiltrosCustoCc({ modo: "total" }, MES_CORRENTE);
    expect(periodoDoModo(filtros)).toEqual({});
  });

  it("vida vai do primeiro mês do centro até o mês corrente", () => {
    const { filtros } = lerFiltrosCustoCc({ modo: "vida", centro: CENTRO }, MES_CORRENTE);
    expect(periodoDoModo(filtros, "2025-01")).toEqual({ de: "2025-01", ate: MES_CORRENTE });
  });

  // Centro sem lançamento nenhum: período vazio é honesto, um período inventado
  // mostraria zero como se fosse um dado.
  it("vida sem primeiro mês devolve período vazio", () => {
    const { filtros } = lerFiltrosCustoCc({ modo: "vida", centro: CENTRO }, MES_CORRENTE);
    expect(periodoDoModo(filtros, undefined)).toEqual({});
  });
});

describe("periodoAnterior", () => {
  it("do mês, é o mês anterior", () => {
    expect(periodoAnterior({ mes: "2026-01" })).toEqual({ mes: "2025-12" });
  });

  it("do período, é a janela de mesmo tamanho imediatamente antes", () => {
    // 3 meses (jan, fev, mar) -> os 3 anteriores (out, nov, dez)
    expect(periodoAnterior({ de: "2026-01", ate: "2026-03" })).toEqual({
      de: "2025-10",
      ate: "2025-12",
    });
  });

  it("de um mês só em de/ate, é o mês anterior", () => {
    expect(periodoAnterior({ de: "2026-03", ate: "2026-03" })).toEqual({
      de: "2026-02",
      ate: "2026-02",
    });
  });

  it("não existe anterior a tudo", () => {
    expect(periodoAnterior({})).toBeNull();
  });
});

describe("comparacaoPermitida", () => {
  // Em total não existe anterior a "tudo", e em vida o anterior ao primeiro
  // lançamento é vazio: os dois mostrariam variação de 100% contra zero, que se
  // lê como a obra tendo dobrado de custo.
  it("vale no mês e no período, não no total nem na vida", () => {
    expect(comparacaoPermitida("mes")).toBe(true);
    expect(comparacaoPermitida("periodo")).toBe(true);
    expect(comparacaoPermitida("total")).toBe(false);
    expect(comparacaoPermitida("vida")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/financeiro/relatorios/filtros-custo-cc.test.ts`
Expected: FAIL — `Failed to resolve import ".../filtros-custo-cc"`.

- [ ] **Step 3: Write minimal implementation**

Escreva `filtros-custo-cc.ts` com as funções da seção **Interfaces**, seguindo o
padrão de `lancamentos/filtros.ts`: validar contra lista fechada, devolver só o que
passou, e trocar de lado o período invertido. Pontos que os testes travam e que a
implementação tem que respeitar:

- `MES = /^\d{4}-(0[1-9]|1[0-2])$/` para validar mês; mês inválido cai em `mesCorrente`.
- `modo` validado contra `["mes", "periodo", "total", "vida"]`, com fallback `"mes"`.
- `previsto` e `comparar` ligam **só** no literal `"1"`.
- `tipo_centro` validado contra `["obra", "escritorio", "manutencao"]`.
- `erroDoModo` preenchido só quando `modo === "vida"` e não há `centro`, com texto
  citando "centro de custo".
- `periodoAnterior` conta os meses da janela e recua a mesma quantidade; use
  aritmética de ano/mês em inteiros (nada de `Date` com fuso).
- `comparacaoPermitida(modo)` é `modo === "mes" || modo === "periodo"`.

Cada função leva um comentário dizendo POR QUE ela existe, no tom do resto do módulo
(os testes acima têm o motivo escrito; leve o motivo para o código, não o teste).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/financeiro/relatorios/filtros-custo-cc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/relatorios/filtros-custo-cc.ts src/modules/financeiro/relatorios/filtros-custo-cc.test.ts
git commit -m "feat(financeiro): contrato de URL do relatorio de centro de custo"
```

---

### Task 9: as RPCs do relatório de centro de custo

**Files:**
- Create: `supabase/migrations/20260814140000_rel_custo_cc_filtros_e_vida.sql`
- Create: `supabase/rollbacks/20260814140000_rel_custo_cc_filtros_e_vida_rollback.sql`
- Modify: `src/modules/financeiro/relatorios/queries.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `fn_rel_custo_centro_custo(p_inicio, p_fim, p_categoria, p_fornecedor, p_incluir_previsto, p_tipo_centro)`
  - `fn_rel_custo_centro_vida(p_centro) returns date`
  - `fn_rel_custo_centro_serie(p_centro, p_inicio, p_fim)`
  - `custoPorCentroCusto(params)` em TS aceita os filtros novos; `primeiroMesDoCentro(centroId)`; `serieDoCentro(...)`

- [ ] **Step 1: Escrever a migration**

`fn_rel_custo_centro_custo` ganha parâmetros **com default null**, então nenhuma
chamada existente quebra. A assinatura muda, portanto o `create or replace` não basta:
faça `drop function` da assinatura antiga e crie a nova, num só arquivo.

```sql
-- Filtros de análise no custo por centro de custo, e as duas funções da "vida do
-- centro" (o acumulado desde o primeiro lançamento dele).
--
-- Os parâmetros novos entram com default null, então quem já chamava com
-- (p_inicio, p_fim) continua chamando igual.
--
-- 'previsto' fica FORA por padrão, igual a hoje: o relatório é de custo
-- incorrido, e previsto é intenção. Entra só quando o usuário pede.

drop function if exists public.fn_rel_custo_centro_custo(date, date);

create or replace function public.fn_rel_custo_centro_custo(
  p_inicio date default null,
  p_fim date default null,
  p_categoria uuid default null,
  p_fornecedor uuid default null,
  p_incluir_previsto boolean default false,
  p_tipo_centro text default null
)
returns table (centro_custo_id uuid, nome text, codigo text, total numeric)
language sql
stable
set search_path to ''
as $function$
  select r.centro_custo_id, cc.nome, cc.codigo, sum(r.valor) as total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join public.centros_custo cc on cc.id = r.centro_custo_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and (coalesce(p_incluir_previsto, false) or l.status <> 'previsto')
    and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
    and (p_fim is null or l.mes_competencia < p_fim)
    and (p_categoria is null or l.categoria_id = p_categoria)
    and (p_fornecedor is null or l.fornecedor_id = p_fornecedor)
    and (p_tipo_centro is null or cc.tipo = p_tipo_centro)
  group by r.centro_custo_id, cc.nome, cc.codigo
$function$;

-- Primeiro mês de competência com custo NAQUELE centro: o início da vida dele.
-- Null quando o centro nunca teve lançamento, e quem chama tem que tratar isso
-- como "sem período" em vez de inventar uma data.
create or replace function public.fn_rel_custo_centro_vida(p_centro uuid)
returns date
language sql
stable
set search_path to ''
as $function$
  select min(l.mes_competencia)
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  where r.centro_custo_id = p_centro
    and l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
$function$;

-- Série mensal de um centro, para o gráfico do modo vida.
--
-- Devolve mês sem custo como ZERO em vez de omitir a linha: série com buraco faz
-- o gráfico ligar dois meses distantes por uma reta, e some com a informação de
-- que a obra parou naquele intervalo.
create or replace function public.fn_rel_custo_centro_serie(
  p_centro uuid,
  p_inicio date default null,
  p_fim date default null
)
returns table (mes text, total numeric)
language sql
stable
set search_path to ''
as $function$
  with limites as (
    select
      coalesce(date_trunc('month', p_inicio)::date,
               (select min(l.mes_competencia)
                  from public.lancamento_rateios r
                  join public.lancamentos l on l.id = r.lancamento_id
                 where r.centro_custo_id = p_centro
                   and l.tipo = 'a_pagar' and l.status <> 'cancelado')) as inicio,
      coalesce(p_fim,
               (select max(l.mes_competencia)
                  from public.lancamento_rateios r
                  join public.lancamentos l on l.id = r.lancamento_id
                 where r.centro_custo_id = p_centro
                   and l.tipo = 'a_pagar' and l.status <> 'cancelado')) as fim
  ),
  meses as (
    select generate_series(l.inicio, l.fim, interval '1 month')::date as mes
    from limites l
    where l.inicio is not null and l.fim is not null
  ),
  custo as (
    select l.mes_competencia as mes, sum(r.valor) as total
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    where r.centro_custo_id = p_centro
      and l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
    group by l.mes_competencia
  )
  select to_char(m.mes, 'YYYY-MM'), coalesce(c.total, 0)
  from meses m
  left join custo c on c.mes = m.mes
  order by m.mes
$function$;

revoke all on function public.fn_rel_custo_centro_custo(date, date, uuid, uuid, boolean, text) from public;
grant execute on function public.fn_rel_custo_centro_custo(date, date, uuid, uuid, boolean, text) to authenticated;
revoke all on function public.fn_rel_custo_centro_vida(uuid) from public;
grant execute on function public.fn_rel_custo_centro_vida(uuid) to authenticated;
revoke all on function public.fn_rel_custo_centro_serie(uuid, date, date) from public;
grant execute on function public.fn_rel_custo_centro_serie(uuid, date, date) to authenticated;
```

O rollback recria a assinatura antiga e derruba as novas:

```sql
-- Rollback de 20260814140000_rel_custo_cc_filtros_e_vida.sql
drop function if exists public.fn_rel_custo_centro_serie(uuid, date, date);
drop function if exists public.fn_rel_custo_centro_vida(uuid);
drop function if exists public.fn_rel_custo_centro_custo(date, date, uuid, uuid, boolean, text);

create or replace function public.fn_rel_custo_centro_custo(
  p_inicio date default null,
  p_fim date default null
)
returns table (centro_custo_id uuid, nome text, codigo text, total numeric)
language sql
stable
set search_path to ''
as $function$
  select r.centro_custo_id, cc.nome, cc.codigo, sum(r.valor) as total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join public.centros_custo cc on cc.id = r.centro_custo_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
    and (p_fim is null or l.mes_competencia < p_fim)
  group by r.centro_custo_id, cc.nome, cc.codigo
$function$;

revoke all on function public.fn_rel_custo_centro_custo(date, date) from public;
grant execute on function public.fn_rel_custo_centro_custo(date, date) to authenticated;
```

- [ ] **Step 2: Aplicar e provar que o total não mudou**

Aplique com `apply_migration`, `name = 20260814140000_rel_custo_cc_filtros_e_vida`.

Prove que a mudança de assinatura não mexeu no número de hoje, com `execute_sql`:

```sql
select
  (select to_char(sum(total),'FM999G999G999D00') from fn_rel_custo_centro_custo('2026-07-01','2026-08-01')) as julho_agora,
  '6.409.595,65' as julho_esperado,
  (select to_char(fn_rel_custo_centro_vida('fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0'),'YYYY-MM')) as vida_009,
  (select count(*) from fn_rel_custo_centro_serie('fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0')) as meses_na_serie;
```

Expected: `julho_agora` = `6.409.595,65`, `vida_009` preenchido, `meses_na_serie` > 1.

- [ ] **Step 3: Rodar os advisors**

Rode `get_advisors` para `security` e para `performance`. Nenhuma função nova pode
aparecer em aviso de `search_path` mutável nem de `security definer`. Advisors de
nível ERROR são bloqueio; corrija antes de seguir.

- [ ] **Step 4: Ligar os filtros no TypeScript**

Em `relatorios/queries.ts`, `custoPorCentroCusto` passa a receber os filtros e
repassá-los à RPC, e entram as duas leituras novas:

```ts
export interface ParamsCustoCentroCusto {
  inicio?: string;
  fim?: string;
  categoriaId?: string;
  fornecedorId?: string;
  incluirPrevisto?: boolean;
  tipoCentro?: "obra" | "escritorio" | "manutencao";
}

/** Primeiro mês (yyyy-MM) com custo no centro. Null se ele nunca teve. */
export async function primeiroMesDoCentro(centroId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_rel_custo_centro_vida", {
    p_centro: centroId,
  });
  if (error) {
    throw new Error(`Não foi possível ler o início do centro: ${error.message}`);
  }
  return typeof data === "string" ? data.slice(0, 7) : null;
}

export interface PontoSerieCentro {
  mes: string;
  valor: number;
}

export async function serieDoCentro(
  centroId: string,
  periodo?: { inicio?: string; fim?: string },
): Promise<PontoSerieCentro[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_rel_custo_centro_serie", {
    p_centro: centroId,
    p_inicio: periodo?.inicio ?? null,
    p_fim: periodo?.fim ?? null,
  });
  if (error) {
    throw new Error(`Não foi possível ler a série do centro: ${error.message}`);
  }
  return (data ?? []).map((linha) => ({
    mes: linha.mes,
    valor: paraReais(paraCentavos(linha.total)),
  }));
}
```

Regenere os tipos do banco se o projeto os versiona:
`npx supabase gen types typescript --linked` (só se já houver arquivo gerado no repo;
confira com `git status` que nada mais mudou).

- [ ] **Step 5: Conferir e commitar**

Run: `find .next \( -name "* [0-9].ts" -o -name "* [0-9].tsx" -o -name "* [0-9].d.ts" \) -delete; npx tsc --noEmit && npx vitest run src/modules/financeiro`
Expected: PASS.

```bash
git add supabase/migrations/20260814140000_rel_custo_cc_filtros_e_vida.sql supabase/rollbacks/20260814140000_rel_custo_cc_filtros_e_vida_rollback.sql src/modules/financeiro/relatorios/queries.ts
git commit -m "feat(financeiro): filtros de analise e vida do centro nas RPCs de custo"
```

---

### Task 10: a tela do relatório de centro de custo

**Files:**
- Modify: `src/app/(app)/financeiro/relatorios/page.tsx`
- Create: `src/modules/financeiro/relatorios/components/filtros-custo-cc-barra.tsx`
- Create: `src/modules/financeiro/relatorios/components/custo-cc-serie.tsx`
- Create: `src/modules/financeiro/relatorios/components/custo-cc-serie-impl.tsx`
- Modify: `src/modules/financeiro/relatorios/components/custo-cc-tabela.tsx`

**Interfaces:**
- Consumes: Task 8 (`lerFiltrosCustoCc`, `periodoDoModo`, `periodoAnterior`, `comparacaoPermitida`), Task 9 (`custoPorCentroCusto` com filtros, `primeiroMesDoCentro`, `serieDoCentro`), Task 7 (`drillCentroCusto`).
- Produces: nada que outra task consuma.

- [ ] **Step 1: A barra de filtros**

Use `BarraFiltrosConfiguravel` (a tela não tem um DataTable onde os filtros possam
morar), com `idTabela="relatorio-custo-cc"` — id PRÓPRIO, senão apaga a preferência de
colunas de outra tabela. Os elementos:

- `FiltroSelect` para o modo (Mês, Período, Total, Vida do centro)
- `FiltroMes` para o mês (só no modo `mes`)
- dois `FiltroMes` de/até (só no modo `periodo`)
- `FiltroSelect` para centro de custo (obrigatório no modo `vida`), categoria,
  fornecedor e tipo de centro
- um toggle para incluir Previsto e outro para comparar, o de comparar
  **desabilitado** quando `comparacaoPermitida(modo)` é falso, com o motivo no title

Escreva a barra como Client Component usando `useFiltrosUrl().setMuitos`, para trocar
modo e limpar o que não se aplica **numa navegação só** (trocar de `periodo` para `mes`
tem que limpar `de`/`ate` no mesmo passo, senão eles ficam na URL e voltam sozinhos
depois).

- [ ] **Step 2: O conteúdo do relatório**

Em `page.tsx`, `ConteudoCustoCc` passa a receber os filtros lidos e a resolver o
período:

```tsx
async function ConteudoCustoCc({
  filtros,
  erroDoModo,
}: {
  filtros: FiltrosCustoCc;
  erroDoModo?: string;
}) {
  if (erroDoModo) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Escolha um centro de custo"
        descricao={erroDoModo}
      />
    );
  }

  const primeiroMes = filtros.modo === "vida" && filtros.centroId
    ? await primeiroMesDoCentro(filtros.centroId)
    : undefined;

  const periodo = periodoDoModo(filtros, primeiroMes ?? undefined);
  // ... custoPorCentroCusto com o período + filtros
  // ... quando comparar e comparacaoPermitida(filtros.modo), busca o anterior
  //     com periodoAnterior(periodo) e calcula a variação
  // ... quando modo vida, busca serieDoCentro e desenha CustoCcSerie
}
```

A variação é calculada em centavos e só existe quando o anterior é maior que zero;
com anterior zero, a coluna mostra "—" em vez de "+100%", que leria como a obra tendo
dobrado de custo quando na verdade ela acabou de começar.

- [ ] **Step 3: A tabela clicável**

Em `custo-cc-tabela.tsx`, o nome do centro vira link:

```tsx
<TableCell className="py-2 text-center text-detalhe">
  <a
    href={drillCentroCusto({
      centroCustoId: centro.centroCustoId,
      periodo,
      filtros: filtrosDoDrill,
    })}
    target="_blank"
    rel="noopener"
    className="text-foreground underline-offset-2 hover:underline hover:text-primario"
  >
    {centro.nome}
  </a>
</TableCell>
```

Link de verdade, não `onClick` com `router.push`: assim o meio-clique, o "abrir em
nova aba" do sistema e o copiar-link funcionam, e a URL é compartilhável com o
financeiro. `rel="noopener"` porque `target="_blank"` sem ele dá à aba nova acesso ao
`window.opener`.

A linha "Sem centro de custo" (id nulo) **não** vira link: não há centro para filtrar,
e um link que abre a lista inteira mentiria sobre o que ele mostra.

- [ ] **Step 4: Conferir**

Run: `find .next \( -name "* [0-9].ts" -o -name "* [0-9].tsx" -o -name "* [0-9].d.ts" \) -delete; npx tsc --noEmit && npx next lint --dir src && npx vitest run`
Expected: tudo PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/financeiro/relatorios/page.tsx src/modules/financeiro/relatorios/components/
git commit -m "feat(financeiro): filtros de analise e drill-down no relatorio de centro de custo"
```

---

### Task 11: os outros cinco relatórios clicáveis

**Files:**
- Modify: `src/modules/financeiro/relatorios/components/dre-tabela.tsx`
- Modify: `src/modules/financeiro/relatorios/components/custo-grupo-tabela.tsx`
- Modify: `src/modules/financeiro/relatorios/components/aging-tabela.tsx`
- Modify: `src/modules/financeiro/relatorios/components/aging-grafico-impl.tsx`
- Modify: `src/modules/financeiro/relatorios/components/posicao-bancaria-tabela.tsx`
- Modify: `src/modules/financeiro/relatorios/components/fluxo-caixa-grafico-impl.tsx`
- Modify: `src/modules/financeiro/relatorios/components/custo-cc-grafico-impl.tsx`

**Interfaces:**
- Consumes: todas as funções de `drill.ts` (Task 7).
- Produces: nada.

- [ ] **Step 1: As tabelas**

Em cada tabela, a célula da dimensão vira o mesmo `<a target="_blank" rel="noopener">`
da Task 10, chamando a função de drill do relatório:

- `dre-tabela.tsx`: linha de categoria → `drillCategoriaCompetencia({ categoriaId, mes, tipo })`, com `tipo` `"a_receber"` na seção de receitas e `"a_pagar"` na de despesas. Linha de TOTAL não vira link.
- `custo-grupo-tabela.tsx`: linha do grupo → `drillGrupoInsumo({ grupoId, periodo })`. Como a função **lança** para grupo com insumo, renderize o link só quando `grupoId === null` e deixe o nome como texto puro nos outros (não há grupo com insumo hoje: 0 OC). Linha de subcategoria e de insumo continuam sem link, pelo mesmo motivo.
- `aging-tabela.tsx`: célula de valor de cada faixa → `drillAging({ faixa, tipo })`, uma por coluna (a pagar e a receber).
- `posicao-bancaria-tabela.tsx`: nome da conta → `drillContaBancaria({ contaId, tipo: "a_pagar" })`.

- [ ] **Step 2: Os gráficos (Recharts)**

Em cada `*-grafico-impl.tsx`, a barra ganha `onClick` abrindo a mesma URL em aba nova:

```tsx
const abrir = (url: string) => {
  window.open(url, "_blank", "noopener");
};
```

- `custo-cc-grafico-impl.tsx`: `onClick` da barra → `drillCentroCusto(...)`
- `aging-grafico-impl.tsx`: `onClick` da barra → `drillAging({ faixa, tipo })`
- `fluxo-caixa-grafico-impl.tsx`: `onClick` da barra → `drillFluxoCaixa({ mes, tipo, realizado })`, e `realizado` sai da série clicada (a série "Realizado" é `true`, a projetada é `false`)

Acrescente `cursor="pointer"` nas barras clicáveis, senão nada na tela diz que elas
clicam.

No gráfico o clique é `onClick` porque Recharts desenha `<path>`, não âncora — e é por
isso que a TABELA usa link de verdade: quem quer copiar o link usa a tabela, que é a
mesma informação.

- [ ] **Step 3: Conferir**

Run: `find .next \( -name "* [0-9].ts" -o -name "* [0-9].tsx" -o -name "* [0-9].d.ts" \) -delete; npx tsc --noEmit && npx next lint --dir src && npx vitest run`
Expected: tudo PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/financeiro/relatorios/components/
git commit -m "feat(financeiro): drill-down nos outros cinco relatorios"
```

---

### Task 12: a prova de que o total do drill fecha com a célula

**Files:**
- Create: `supabase/provas/drill_fecha_com_a_celula.sql`

**Interfaces:**
- Consumes: as RPCs das Tasks 4 e 9.
- Produces: nada.

Esta é a task mais importante do plano. As outras podem passar com a conta errada se o
teste for escrito com a mesma cabeça que escreveu o código; esta compara dois caminhos
independentes contra o banco e entrega colunas que **têm que dar zero**.

- [ ] **Step 1: Escrever a prova**

```sql
-- Prova: o total do drill-down fecha com a célula do relatório, nos seis.
--
-- Roda em TRANSAÇÃO REVERTIDA e CONSTRÓI o caso parcial antes de conferir, porque
-- o retrato de hoje esconde o defeito: medido em 14/08/2026 a base tem 0
-- cancelados, 0 previstos e 0 parcelas sem vencimento, então o caminho errado
-- (não excluir cancelado, não tratar líquido nulo, reconstruir faixa por data)
-- daria o mesmo número do caminho certo e a prova passaria por sorte.
--
-- Cada coluna `dif_*` tem que dar 0. Qualquer outra coisa é o drill somando
-- diferente da célula que foi clicada.
begin;

-- Caso parcial: um lançamento rateado 60/40 entre duas obras, um cancelado no
-- mesmo mês e centro, um previsto, e uma parcela paga em mês diferente do
-- vencimento.
-- (montagem: inserir em lancamentos / lancamento_parcelas / lancamento_rateios
--  com centros e categorias já existentes, valores redondos para a conta ser
--  conferível de cabeça)

-- 1. Custo por centro de custo
with celula as (
  select centro_custo_id, total
  from fn_rel_custo_centro_custo('2026-07-01', '2026-08-01')
),
drill as (
  select r.centro_custo_id, sum(r.valor) as total
  from lancamento_rateios r
  join lancamentos l on l.id = r.lancamento_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and l.mes_competencia >= '2026-07-01' and l.mes_competencia < '2026-08-01'
  group by r.centro_custo_id
)
select 'custo_centro' as relatorio,
       coalesce(sum(abs(coalesce(c.total,0) - coalesce(d.total,0))), 0) as dif
from celula c full join drill d on d.centro_custo_id = c.centro_custo_id;

-- 2. Aging, faixa por faixa: a soma das faixas do drill tem que dar a mesma
--    coisa que a célula, e a faixa de cada parcela tem que ser a MESMA nos dois.
select 'aging' as relatorio,
       coalesce(sum(abs(a.total - coalesce(d.total, 0))), 0) as dif
from (
  select faixa_aging, tipo, sum(total) as total from fn_rel_aging() group by 1,2
) a
left join (
  select p_faixa as faixa_aging, p_tipo as tipo, sum(valor_no_recorte) as total
  from (
    select f.faixa as p_faixa, t.tipo as p_tipo, r.valor_no_recorte
    from (values ('a_vencer'),('v_1_7'),('v_8_15'),('v_16_30'),('v_31_60'),('v_60_mais')) f(faixa)
    cross join (values ('a_pagar'),('a_receber')) t(tipo)
    cross join lateral fn_lancamentos_do_recorte('aging', f.faixa, t.tipo, null, null, null, null) r
  ) x
  group by 1,2
) d on d.faixa_aging = a.faixa_aging and d.tipo = a.tipo;

-- 3. Fluxo de caixa, mês a mês e realizado/previsto
select 'fluxo' as relatorio,
       coalesce(sum(abs(f.total - coalesce(d.total,0))), 0) as dif
from (select mes, tipo, realizado, sum(total) as total from fn_rel_fluxo_caixa() group by 1,2,3) f
left join lateral (
  select sum(valor_no_recorte) as total
  from fn_lancamentos_do_recorte('fluxo', null, null, f.mes, f.realizado, null, null)
) d on true;

-- 4. Posição bancária, conta a conta
select 'posicao' as relatorio,
       coalesce(sum(abs(p.total - coalesce(d.total,0))), 0) as dif
from (select conta_bancaria_id, sum(total) as total from fn_rel_posicao_bancaria() group by 1) p
left join lateral (
  select sum(r.valor_no_recorte) as total
  from fn_lancamentos_do_recorte('conta_paga', null, null, null, null, p.conta_bancaria_id, null) r
) d on true;

-- 5 e 6. DRE e grupo de insumo somam o valor do lançamento, que é o que a
--        listagem já soma: a prova é que a soma dos rateios de um lançamento é
--        igual ao valor dele (a invariante que fn_salvar_lancamento garante).
select 'rateio_fecha_com_valor' as relatorio,
       count(*) as dif
from lancamentos l
join (select lancamento_id, sum(valor) as soma from lancamento_rateios group by 1) r
  on r.lancamento_id = l.id
where r.soma <> l.valor;

rollback;
```

- [ ] **Step 2: Completar a montagem do caso parcial**

Substitua o comentário do passo 1 pelos `insert` de verdade: um lançamento de
R$ 100.000 rateado 60/40 entre `009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10`
e `007 - AC 405 - Lote 2`, com competência `2026-07-01`; um lançamento cancelado de
R$ 50.000 no mesmo mês e centro; um previsto de R$ 30.000; e uma parcela paga com
`data_pagamento` em `2026-08-10` e `data_vencimento` em `2026-07-25`. Use os ids reais
de centro e categoria (leia-os com um `select` no começo do arquivo).

- [ ] **Step 3: Rodar a prova**

Rode o arquivo inteiro com `execute_sql`.
Expected: **toda** coluna `dif` = 0, nas seis linhas de resultado.

Se alguma der diferente de zero, o defeito é real: pare, ache de que lado está a
divergência (a célula ou o drill) e conserte o código, não a prova.

- [ ] **Step 4: Commit**

```bash
git add supabase/provas/drill_fecha_com_a_celula.sql
git commit -m "test(financeiro): prova de que o total do drill fecha com a celula do relatorio"
```

---

### Task 13: fechamento — definição de pronto

**Files:**
- Modify: `docs/decisoes.md`

- [ ] **Step 1: Rodar a suíte inteira**

```bash
find .next \( -name "* [0-9].ts" -o -name "* [0-9].tsx" -o -name "* [0-9].d.ts" \) -delete
npx tsc --noEmit && npx next lint --dir src && npx vitest run && npx next build
```
Expected: tudo verde. Sem `any` novo, sem `console.log`.

- [ ] **Step 2: Conferir permissão**

O drill leva para `/financeiro/lancamentos`, que exige `financeiro.lancamentos` `ver`.
Quem tem `financeiro.relatorios` mas **não** tem `financeiro.lancamentos` clicaria e
cairia num `notFound()`. Confira com `execute_sql` quantos usuários estão nessa
situação:

```sql
select count(*) from usuarios u
where exists (select 1 from usuario_permissoes p
               where p.usuario_id = u.id and p.recurso = 'financeiro.relatorios' and p.acao = 'ver')
  and not exists (select 1 from usuario_permissoes p
               where p.usuario_id = u.id and p.recurso = 'financeiro.lancamentos' and p.acao = 'ver');
```

Se for maior que zero, o link tem que sair da tela para esse usuário (a página do
relatório já sabe o usuário: passe um `podeVerLancamentos` para as tabelas e renderize
texto puro em vez de link). Não deixe o link levar a um 404.

- [ ] **Step 3: Registrar a decisão**

Acrescente uma seção a `docs/decisoes.md` com a data de hoje contando: o total do
drill fecha com a célula e por que isso exigiu `valorRecorte`; por que a fatia de
parcela viaja num parâmetro só em vez de cinco (as 694 parcelas pagas em mês diferente
do vencimento); a precedência centro > parcela e por que o produto dos dois não
existe; e as quatro análises que o esquema suporta mas o dado ainda não permite
(orçamento vazio, centros todos raiz, 0 OC, categorias todas raiz).

- [ ] **Step 4: Commit e PR**

```bash
git add docs/decisoes.md
git commit -m "docs: decisoes dos relatorios interativos"
git push -u origin feat-relatorios-interativos
gh pr create --title "feat(financeiro): relatorios interativos com drill-down que fecha" --body "..."
```

Espere o CI ficar verde antes de mergear.

---

## Self-review

**Cobertura do spec:**

| seção do spec | task |
|---|---|
| `drill.ts`, contrato do clique | 7 |
| `sem_cancelado` | 2, 4 |
| `recorte` (parâmetro único) | 1, 2, 4 |
| `valorRecorte` e precedência | 3, 5 |
| coluna e cartão da fatia | 6 |
| filtros do centro de custo, 4 modos | 8, 9, 10 |
| comparação com período anterior | 8, 10 |
| gráfico da vida do centro | 9, 10 |
| os 6 clicáveis | 10, 11 |
| RPCs novas, sem definer, com grant | 9 |
| prova SQL no caso parcial | 12 |
| fora de escopo (orçamento, hierarquia, grupo) | declarado nas Tasks 7 e 11 |

**Lacuna encontrada e coberta:** o spec fala em filtrar o relatório por período de/até
em regime de competência, mas a listagem de Lançamentos **não tinha** faixa de mês de
referência (só `mes` exato). Sem isso o modo `periodo` não teria destino. Entrou como
`comp_de`/`comp_ate` na Task 7, Step 3.

**Consistência de tipos:** `Recorte`, `MedidaRecorte`, `FaixaAgingRecorte` e
`TipoLancamentoRecorte` são definidos na Task 1 e usados com o mesmo nome nas Tasks 2,
3, 4, 5 e 7. `PeriodoCompetencia` é definido na Task 7 e consumido na 8 e na 10.
`valorRecorte` (campo), `valorNoRecorte` e `temRecorte` (resumo) mantêm o nome nas
Tasks 3, 5 e 6.
