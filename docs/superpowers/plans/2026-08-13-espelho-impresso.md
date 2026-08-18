# Espelho impresso de documento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Imprimir um espelho completo (cabeçalho, filhos, rateio, trilha, anexos) de OC, lançamento e pagamento, a partir da listagem (linhas marcadas) ou do detalhe.

**Architecture:** Um grupo de rota `(espelho)` sem AppShell, com uma rota por documento que aceita `?ids=` e atende 1 ou N com o mesmo código. O enfeite da página vive no canônico `EspelhoImpresso`; cada documento fornece só o conteúdo. A seleção de linha reusa a prop `selecao` que o `DataTable` já tem. Impressão pelo navegador (`window.print()`), sem biblioteca de PDF.

**Tech Stack:** Next.js 16 App Router (Server Components), React 19, TypeScript strict, Tailwind v4, shadcn/ui, lucide-react, Zod 4, Supabase (Postgres + RLS), Vitest 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-13-espelho-impresso-de-documento-design.md`

## Global Constraints

- **Id valida por `idSchema` de `@/lib/id` (`z.guid()`), nunca por `z.uuid()`.** O `uuid()` do Zod 4 exige os bits de versão e variante do RFC 9562; a coluna `uuid` do Postgres não exige nada disso, e milhares de registros da carga do maiscontrole têm id derivado de `md5(...)::uuid` (exemplo real em produção: `c4e0f922-3aec-8c72-7089-225523e04557`). Validar com `z.uuid()` recusa justamente o histórico, **e passa em todo teste escrito com uuid novo**.
- **Buscar por lista de ids sempre em lotes de `LOTE_IDS_POSTGREST` (200).** `in` vai na query string de um GET; 1000 uuids dão 37 KB de URL e o PostgREST responde 400 antes de olhar RLS.
- **Dinheiro só por `MoneyText`** (`R$ 1.234,56`, `tabular-nums`). Float proibido para valor.
- **Data pelos formatadores de `@/lib/formatadores`** (timezone `America/Rio_Branco`).
- **Permissão tripla:** RLS no banco, checagem no servidor, UI esconde o que não pode. O espelho exige `ver` no recurso. **Não se cria a ação `imprimir`.**
- **Sem `any` novo, sem `console.log`.** `tsc --noEmit`, lint e build passando ao fim.
- **Cor nunca informa sozinha:** todo status sai como texto no papel, porque o usuário pode desligar gráficos de fundo no diálogo de impressão.
- **Limite de 50 documentos por impressão**, checado no botão e na página.
- Textos de UI em pt-BR, sentence case, voz ativa.

---

### Task 1: `emLotes` sai do módulo de lançamentos e vai para `lib`

O espelho de OC precisa da mesma quebra em lotes que a exportação de lançamentos usa, e hoje ela mora dentro de `src/modules/financeiro/lancamentos/`. Importar de um módulo para outro amarraria compras a financeiro por um utilitário técnico.

**Files:**
- Create: `src/lib/lotes-de-ids.ts`
- Create: `src/lib/lotes-de-ids.test.ts`
- Delete: `src/modules/financeiro/lancamentos/lotes-de-ids.ts`
- Delete: `src/modules/financeiro/lancamentos/lotes-de-ids.test.ts`
- Modify: `src/modules/financeiro/lancamentos/queries.ts` (o import, por volta da linha 41)

**Interfaces:**
- Consumes: nada.
- Produces: `LOTE_IDS_POSTGREST: number` e `emLotes<T>(itens: T[], tamanho: number): T[][]`, de `@/lib/lotes-de-ids`.

- [ ] **Step 1: Mover os dois arquivos preservando o conteúdo**

O conteúdo não muda, inclusive o comentário longo que explica por que 200 e não 1000. Ele é o registro de uma medição no projeto vivo e não pode ser resumido.

```bash
git mv src/modules/financeiro/lancamentos/lotes-de-ids.ts src/lib/lotes-de-ids.ts
git mv src/modules/financeiro/lancamentos/lotes-de-ids.test.ts src/lib/lotes-de-ids.test.ts
```

- [ ] **Step 2: Corrigir o import dentro do teste movido**

Em `src/lib/lotes-de-ids.test.ts`, trocar:

```ts
import {
  emLotes,
  LOTE_IDS_POSTGREST,
} from "@/modules/financeiro/lancamentos/lotes-de-ids";
```

por:

```ts
import { emLotes, LOTE_IDS_POSTGREST } from "@/lib/lotes-de-ids";
```

- [ ] **Step 3: Corrigir o import em `queries.ts`**

Em `src/modules/financeiro/lancamentos/queries.ts`, o import de `LOTE_IDS_POSTGREST` e `emLotes` passa a vir de `@/lib/lotes-de-ids`. Confirmar que não sobrou nenhuma referência ao caminho antigo:

```bash
grep -rn "lancamentos/lotes-de-ids" src/ && echo "AINDA HA REFERENCIA" || echo "limpo"
```

- [ ] **Step 4: Rodar os testes e o typecheck**

Run: `npx vitest run src/lib/lotes-de-ids.test.ts && npx tsc --noEmit`
Expected: testes PASS, `tsc` sem saída.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: emLotes vai para lib, porque compras tambem precisa"
```

---

### Task 2: Ler e validar os ids do espelho

Função pura, compartilhada pelas três rotas. É onde o limite de 50 e a validação de id vivem.

**Files:**
- Create: `src/lib/ids-do-espelho.ts`
- Create: `src/lib/ids-do-espelho.test.ts`

**Interfaces:**
- Consumes: `idSchema` de `@/lib/id`.
- Produces: `MAX_ESPELHOS: number`, `IdsDoEspelho` (`{ ids: string[]; invalidos: number; excedeu: boolean }`) e `lerIdsDoEspelho(bruto: string | undefined): IdsDoEspelho`, de `@/lib/ids-do-espelho`.

- [ ] **Step 1: Write the failing test**

`src/lib/ids-do-espelho.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { lerIdsDoEspelho, MAX_ESPELHOS } from "@/lib/ids-do-espelho";

const A = "550e8400-e29b-41d4-a716-446655440000";
const B = "9f1b7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b";

describe("lerIdsDoEspelho", () => {
  it("sem parâmetro devolve nada para imprimir", () => {
    expect(lerIdsDoEspelho(undefined)).toEqual({
      ids: [],
      invalidos: 0,
      excedeu: false,
    });
  });

  it("parâmetro vazio devolve nada para imprimir", () => {
    expect(lerIdsDoEspelho("")).toEqual({
      ids: [],
      invalidos: 0,
      excedeu: false,
    });
  });

  it("lê os ids separados por vírgula, na ordem em que vieram", () => {
    expect(lerIdsDoEspelho(`${A},${B}`).ids).toEqual([A, B]);
  });

  it("tolera espaço em volta da vírgula, que link colado à mão costuma ter", () => {
    expect(lerIdsDoEspelho(` ${A} , ${B} `).ids).toEqual([A, B]);
  });

  it("conta o que não é id e segue com o resto, em vez de derrubar a impressão", () => {
    const lido = lerIdsDoEspelho(`${A},nao-e-id,${B}`);
    expect(lido.ids).toEqual([A, B]);
    expect(lido.invalidos).toBe(1);
  });

  it("não repete id, porque repetido imprimiria a mesma folha duas vezes", () => {
    expect(lerIdsDoEspelho(`${A},${A}`).ids).toEqual([A]);
  });

  it("aceita o id derivado de md5 da carga do maiscontrole", () => {
    // Caso real em produção: variante 7 e versão 8, o que z.uuid() recusa.
    // Recusar aqui seria recusar justamente o histórico que o espelho existe
    // para imprimir, E passaria em todo teste escrito com uuid novo.
    const md5 = "c4e0f922-3aec-8c72-7089-225523e04557";
    expect(lerIdsDoEspelho(md5).ids).toEqual([md5]);
  });

  it("acima do limite marca excedeu, sem truncar em silêncio", () => {
    const muitos = Array.from(
      { length: MAX_ESPELHOS + 1 },
      (_, i) => `550e8400-e29b-41d4-a716-4466554${String(i).padStart(5, "0")}`,
    );
    const lido = lerIdsDoEspelho(muitos.join(","));
    expect(lido.excedeu).toBe(true);
    // Os ids continuam aí: quem chama decide recusar. Truncar aqui faria o
    // papel parecer completo quando não é.
    expect(lido.ids).toHaveLength(MAX_ESPELHOS + 1);
  });

  it("exatamente no limite não excede", () => {
    const noLimite = Array.from(
      { length: MAX_ESPELHOS },
      (_, i) => `550e8400-e29b-41d4-a716-4466554${String(i).padStart(5, "0")}`,
    );
    expect(lerIdsDoEspelho(noLimite.join(",")).excedeu).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ids-do-espelho.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/ids-do-espelho"`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/ids-do-espelho.ts`:

```ts
import { idSchema } from "@/lib/id";

/**
 * Quantos documentos cabem em um trabalho de impressão.
 *
 * Botão de ajuste, não lei: 50 protege o navegador de montar uma página
 * gigante e ainda cobre o caso que o Tiago citou (as OCs de um mês). Acima
 * disto a página RECUSA em vez de imprimir 50 e calar sobre o resto, porque
 * truncar em silêncio faz o papel parecer completo quando não é.
 */
export const MAX_ESPELHOS = 50;

export interface IdsDoEspelho {
  /** Ids válidos, sem repetição, na ordem em que apareceram. */
  ids: string[];
  /** Quantos pedaços do parâmetro não eram id. Vira aviso na página. */
  invalidos: number;
  /** true quando passou de MAX_ESPELHOS. Quem chama recusa. */
  excedeu: boolean;
}

/**
 * Lê o `?ids=` da rota de espelho.
 *
 * Valida por `idSchema` (`z.guid()`), e não pelo `uuid()` do Zod: ver o
 * comentário de `@/lib/id`. Id de tamanho errado, texto solto e tentativa de
 * injeção caem aqui; quem garante que o id existe e que o usuário pode ver a
 * linha é a FK e a RLS.
 */
export function lerIdsDoEspelho(bruto: string | undefined): IdsDoEspelho {
  const pedacos = (bruto ?? "")
    .split(",")
    .map((pedaco) => pedaco.trim())
    .filter((pedaco) => pedaco.length > 0);

  const ids: string[] = [];
  let invalidos = 0;

  for (const pedaco of pedacos) {
    if (!idSchema.safeParse(pedaco).success) {
      invalidos += 1;
      continue;
    }
    if (!ids.includes(pedaco)) ids.push(pedaco);
  }

  return { ids, invalidos, excedeu: ids.length > MAX_ESPELHOS };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ids-do-espelho.test.ts`
Expected: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ids-do-espelho.ts src/lib/ids-do-espelho.test.ts
git commit -m "feat: le e valida os ids do espelho, por guid e nao por uuid"
```

---

### Task 3: Canônico `EspelhoImpresso` e o grupo de rota `(espelho)`

O enfeite da página em um lugar só, e um layout sem AppShell.

**Files:**
- Create: `src/components/canonicos/espelho-impresso.tsx`
- Create: `src/components/canonicos/espelho-impresso.test.tsx`
- Create: `src/app/(espelho)/layout.tsx`
- Modify: `src/app/globals.css` (acrescentar ao fim do arquivo)
- Modify: `src/components/canonicos/index.ts`

**Interfaces:**
- Consumes: `MoneyText` de `@/components/canonicos`, `formatarDataHora` de `@/lib/formatadores`, `cn` de `@/lib/utils`, `Button` de `@/components/ui/button`.
- Produces, de `@/components/canonicos`:
  - `EspelhoImpresso({ tipo, numero, emitidoPor, emitidoEm, children })`
  - `EspelhoSecao({ rotulo, children })`
  - `EspelhoCampos({ campos })` com `campos: { rotulo: string; valor: React.ReactNode }[]`
  - `EspelhoTabela({ colunas, linhas, totais })` com `colunas: { chave: string; rotulo: string; alinharDireita?: boolean }[]`, `linhas: Record<string, React.ReactNode>[]`, `totais?: Record<string, React.ReactNode>`
  - `EspelhoVazio({ titulo, explicacao })`
  - `BotaoImprimir({ auto? })`
  - `EspelhoDinheiro({ valor })`

- [ ] **Step 1: Write the failing test**

`src/components/canonicos/espelho-impresso.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  EspelhoCampos,
  EspelhoImpresso,
  EspelhoSecao,
  EspelhoTabela,
} from "@/components/canonicos/espelho-impresso";

describe("EspelhoImpresso", () => {
  it("mostra tipo, número e quem emitiu", () => {
    render(
      <EspelhoImpresso
        tipo="Ordem de compra"
        numero="OC-2026-0001"
        emitidoPor="Tiago Cameli"
        emitidoEm="2026-08-13T14:00:00Z"
      >
        <p>conteúdo</p>
      </EspelhoImpresso>,
    );
    expect(screen.getByText("Ordem de compra")).toBeInTheDocument();
    expect(screen.getByText("OC-2026-0001")).toBeInTheDocument();
    expect(screen.getByText(/Tiago Cameli/)).toBeInTheDocument();
  });

  it("documento sem número diz que não tem, em vez de deixar buraco", () => {
    render(
      <EspelhoImpresso
        tipo="Lançamento"
        numero={null}
        emitidoPor="Tiago"
        emitidoEm="2026-08-13T14:00:00Z"
      >
        <p>conteúdo</p>
      </EspelhoImpresso>,
    );
    expect(screen.getByText("sem número")).toBeInTheDocument();
  });

  it("marca o documento com a classe de quebra de página", () => {
    const { container } = render(
      <EspelhoImpresso
        tipo="Lançamento"
        numero="LAN-2026-0001"
        emitidoPor="Tiago"
        emitidoEm="2026-08-13T14:00:00Z"
      >
        <p>conteúdo</p>
      </EspelhoImpresso>,
    );
    // A quebra entre documentos vive no CSS (.espelho-documento), e o
    // componente só precisa carregar a marca. Sem ela, N espelhos saem
    // emendados na mesma folha.
    expect(container.querySelector(".espelho-documento")).not.toBeNull();
  });
});

describe("EspelhoCampos", () => {
  it("mostra rótulo e valor de cada campo", () => {
    render(
      <EspelhoCampos
        campos={[
          { rotulo: "Fornecedor", valor: "BRITAM" },
          { rotulo: "Status", valor: "Aprovado" },
        ]}
      />,
    );
    expect(screen.getByText("Fornecedor")).toBeInTheDocument();
    expect(screen.getByText("BRITAM")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("campo sem valor sai como travessão, e não como vazio ambíguo", () => {
    render(<EspelhoCampos campos={[{ rotulo: "Observações", valor: null }]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("EspelhoSecao", () => {
  it("mostra o rótulo da seção e o conteúdo", () => {
    render(
      <EspelhoSecao rotulo="Itens">
        <p>um item</p>
      </EspelhoSecao>,
    );
    expect(screen.getByText("Itens")).toBeInTheDocument();
    expect(screen.getByText("um item")).toBeInTheDocument();
  });
});

describe("EspelhoTabela", () => {
  const colunas = [
    { chave: "descricao", rotulo: "Descrição" },
    { chave: "valor", rotulo: "Valor", alinharDireita: true },
  ];

  it("mostra cabeçalho e linhas", () => {
    render(
      <EspelhoTabela
        colunas={colunas}
        linhas={[{ descricao: "Pedra", valor: "R$ 100,00" }]}
      />,
    );
    expect(screen.getByText("Descrição")).toBeInTheDocument();
    expect(screen.getByText("Pedra")).toBeInTheDocument();
    expect(screen.getByText("R$ 100,00")).toBeInTheDocument();
  });

  it("sem linha nenhuma diz que não há, em vez de tabela só com cabeçalho", () => {
    render(<EspelhoTabela colunas={colunas} linhas={[]} />);
    expect(screen.getByText("Nada a listar")).toBeInTheDocument();
  });

  it("mostra a linha de totais quando ela vem", () => {
    render(
      <EspelhoTabela
        colunas={colunas}
        linhas={[{ descricao: "Pedra", valor: "R$ 100,00" }]}
        totais={{ descricao: "Total", valor: "R$ 100,00" }}
      />,
    );
    expect(screen.getByText("Total")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/canonicos/espelho-impresso.test.tsx`
Expected: FAIL, `Failed to resolve import "@/components/canonicos/espelho-impresso"`.

- [ ] **Step 3: Write the component**

`src/components/canonicos/espelho-impresso.tsx`:

```tsx
"use client";

import { Printer } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { formatarBRL, formatarDataHora } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

/**
 * Espelho impresso de um documento.
 *
 * Diferente do holerite: lá a impressão acontece dentro do app e o CSS precisa
 * esconder o resto da tela (`.holerite-print`). Aqui a PÁGINA INTEIRA é o
 * documento, porque a rota vive no grupo `(espelho)`, sem AppShell. Nada a
 * esconder, nada de `visibility: hidden`.
 *
 * A quebra de página entre documentos e a cor de fundo vivem no `globals.css`
 * (`.espelho-documento`, `.espelho-raiz`), porque `break-after` e
 * `print-color-adjust` não têm utilitário do Tailwind neste projeto.
 */
export function EspelhoImpresso({
  tipo,
  numero,
  emitidoPor,
  emitidoEm,
  children,
}: {
  /** "Ordem de compra", "Lançamento", "Pagamento". */
  tipo: string;
  /** Número do documento. Nulo em registro anterior à numeração. */
  numero: string | null;
  emitidoPor: string;
  /** ISO. Quem imprime vê quando o papel foi gerado. */
  emitidoEm: string;
  children: React.ReactNode;
}) {
  return (
    <article className="espelho-documento mx-auto flex max-w-[190mm] flex-col gap-4 px-6 py-8">
      {/* A Faixa âmbar, assinatura do design em todo o app. */}
      <div className="h-[3px] w-full bg-[#F59E0B]" />

      <header className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-[18px] font-semibold">{tipo}</span>
          <span className="font-mono text-[13px] text-[#6B6B6B]">
            {numero ?? "sem número"}
          </span>
        </div>
        <span className="text-[12px] font-semibold tracking-wide text-[#6B6B6B]">
          EMT CONSTRUTORA
        </span>
      </header>

      {children}

      <footer className="mt-2 border-t border-[#E8E6E1] pt-2 text-[12px] text-[#6B6B6B]">
        Emitido em {formatarDataHora(emitidoEm)} por {emitidoPor}
      </footer>
    </article>
  );
}

/** Bloco titulado do espelho. */
export function EspelhoSecao({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold text-[#1F1F1F]">{rotulo}</h2>
      {children}
    </section>
  );
}

/**
 * Grade rótulo/valor. Campo sem valor sai como travessão: no papel, espaço
 * vazio não distingue "não tem" de "esqueceram de imprimir".
 */
export function EspelhoCampos({
  campos,
}: {
  campos: { rotulo: string; valor: React.ReactNode }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-3">
      {campos.map((campo) => (
        <div key={campo.rotulo} className="flex flex-col">
          <dt className="text-[12px] text-[#6B6B6B]">{campo.rotulo}</dt>
          <dd className="text-[#1F1F1F]">
            {campo.valor === null ||
            campo.valor === undefined ||
            campo.valor === ""
              ? "—"
              : campo.valor}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Tabela compacta para as linhas filhas do documento. */
export function EspelhoTabela({
  colunas,
  linhas,
  totais,
}: {
  colunas: { chave: string; rotulo: string; alinharDireita?: boolean }[];
  linhas: Record<string, React.ReactNode>[];
  totais?: Record<string, React.ReactNode>;
}) {
  if (linhas.length === 0) {
    return <p className="text-[13px] text-[#6B6B6B]">Nada a listar</p>;
  }
  return (
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr className="border-b border-[#E8E6E1]">
          {colunas.map((coluna) => (
            <th
              key={coluna.chave}
              className={cn(
                "py-1 text-left font-medium text-[#6B6B6B]",
                coluna.alinharDireita && "text-right",
              )}
            >
              {coluna.rotulo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha, indice) => (
          <tr
            key={indice}
            className="border-b border-[#E8E6E1] last:border-b-0"
          >
            {colunas.map((coluna) => (
              <td
                key={coluna.chave}
                className={cn(
                  "py-1 align-top",
                  coluna.alinharDireita && "text-right tabular-nums",
                )}
              >
                {linha[coluna.chave] ?? "—"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {totais ? (
        <tfoot>
          <tr className="border-t border-[#1F1F1F] font-medium">
            {colunas.map((coluna) => (
              <td
                key={coluna.chave}
                className={cn(
                  "py-1",
                  coluna.alinharDireita && "text-right tabular-nums",
                )}
              >
                {totais[coluna.chave] ?? ""}
              </td>
            ))}
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}

/**
 * Dinheiro no papel. Não usa `MoneyText` porque aquele é um `span` pensado para
 * a tela; aqui o alinhamento vem da célula da tabela. O formato é o mesmo,
 * porque vem do mesmo `formatarBRL`.
 */
export function EspelhoDinheiro({
  valor,
}: {
  valor: number | string | null | undefined;
}) {
  return <span className="tabular-nums">{formatarBRL(valor)}</span>;
}

/** Página de espelho sem nada para imprimir. */
export function EspelhoVazio({
  titulo,
  explicacao,
}: {
  titulo: string;
  explicacao: string;
}) {
  return (
    <div className="mx-auto flex max-w-[190mm] flex-col gap-2 px-6 py-12">
      <h1 className="text-[18px] font-semibold">{titulo}</h1>
      <p className="text-[13px] text-[#6B6B6B]">{explicacao}</p>
    </div>
  );
}

/**
 * Dispara a impressão ao abrir, e fica na tela para reimprimir.
 *
 * Dois quadros de espera: o primeiro monta, o segundo deixa fonte e layout
 * assentarem. Sem isso o Chrome mede a página antes do webfont e a última
 * linha cai para uma folha a mais. O `ref` guarda contra o efeito rodar duas
 * vezes no modo estrito do React, que abriria dois diálogos de impressão.
 */
export function BotaoImprimir({ auto = true }: { auto?: boolean }) {
  const jaDisparou = React.useRef(false);

  React.useEffect(() => {
    if (!auto || jaDisparou.current) return;
    jaDisparou.current = true;
    let interno = 0;
    const externo = requestAnimationFrame(() => {
      interno = requestAnimationFrame(() => window.print());
    });
    return () => {
      cancelAnimationFrame(externo);
      cancelAnimationFrame(interno);
    };
  }, [auto]);

  return (
    <div className="nao-imprime mx-auto flex max-w-[190mm] justify-end px-6 pt-6">
      <Button type="button" variant="outline" onClick={() => window.print()}>
        <Printer />
        Imprimir
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Acrescentar o CSS do espelho ao fim de `src/app/globals.css`**

```css
/*
  Espelho impresso de documento.

  A página inteira É o documento (rota no grupo `(espelho)`, sem AppShell),
  então aqui NÃO tem o truque de esconder o resto do app: aquilo existe para o
  holerite, que imprime de dentro de um dialog.

  `print-color-adjust: exact` é obrigatório: navegador remove cor de fundo ao
  imprimir por padrão, e sem isto a Faixa âmbar sai branca. Mesmo com a regra o
  usuário pode desligar "gráficos de fundo" no diálogo do sistema, e por isso
  nenhum dado do espelho depende de cor: status sai como texto.
*/
.espelho-raiz {
  background: #ffffff;
  color: #1f1f1f;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

@media print {
  @page {
    size: A4;
    margin: 12mm;
  }
  /* Um documento por folha. Sem isto, N espelhos saem emendados. */
  .espelho-documento {
    break-after: page;
  }
  .espelho-documento:last-child {
    break-after: auto;
  }
  /* Tabela de filhos não parte no meio de uma linha. */
  .espelho-documento tr {
    break-inside: avoid;
  }
}
```

- [ ] **Step 5: Criar o layout do grupo `(espelho)`**

`src/app/(espelho)/layout.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Espelho",
};

/**
 * Layout do espelho: sem AppShell de propósito. Sidebar, submenu e filtro não
 * vão para o papel, e o grupo `(auth)` já é o precedente de rota sem shell
 * neste projeto.
 */
export default function EspelhoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="espelho-raiz min-h-screen">{children}</div>;
}
```

- [ ] **Step 6: Exportar no barril dos canônicos**

Em `src/components/canonicos/index.ts`, acrescentar na lista de `export *`:

```ts
export * from "./espelho-impresso";
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run src/components/canonicos/espelho-impresso.test.tsx && npx tsc --noEmit`
Expected: PASS, 9 testes; `tsc` sem saída.

- [ ] **Step 8: Commit**

```bash
git add src/components/canonicos/espelho-impresso.tsx src/components/canonicos/espelho-impresso.test.tsx src/components/canonicos/index.ts "src/app/(espelho)/layout.tsx" src/app/globals.css
git commit -m "feat: canonico EspelhoImpresso e grupo de rota (espelho)"
```

---

### Task 4: Canônico `BarraSelecao`, e `LoteContaBancaria` passa a morar nele

A barra de "N selecionados" existe hoje embutida em `lote-conta-bancaria.tsx`. Sem extrair, ordens e pagamentos ganhariam duas cópias dela.

**Files:**
- Create: `src/components/canonicos/barra-selecao.tsx`
- Create: `src/components/canonicos/barra-selecao.test.tsx`
- Modify: `src/modules/financeiro/lancamentos/components/lote-conta-bancaria.tsx`
- Modify: `src/components/canonicos/index.ts`

**Interfaces:**
- Consumes: `Button` de `@/components/ui/button`, `cn` de `@/lib/utils`.
- Produces: `BarraSelecao({ quantidade, onLimpar, children, resumo? })` de `@/components/canonicos`.

- [ ] **Step 1: Write the failing test**

`src/components/canonicos/barra-selecao.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BarraSelecao } from "@/components/canonicos/barra-selecao";

describe("BarraSelecao", () => {
  it("com zero selecionado não aparece, porque barra vazia é ruído", () => {
    const { container } = render(
      <BarraSelecao quantidade={0} onLimpar={() => {}}>
        <button type="button">Ação</button>
      </BarraSelecao>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("concorda o singular com o plural", () => {
    const { rerender } = render(
      <BarraSelecao quantidade={1} onLimpar={() => {}}>
        <button type="button">Ação</button>
      </BarraSelecao>,
    );
    expect(screen.getByText("1 selecionado")).toBeInTheDocument();

    rerender(
      <BarraSelecao quantidade={3} onLimpar={() => {}}>
        <button type="button">Ação</button>
      </BarraSelecao>,
    );
    expect(screen.getByText("3 selecionados")).toBeInTheDocument();
  });

  it("mostra as ações que recebe", () => {
    render(
      <BarraSelecao quantidade={2} onLimpar={() => {}}>
        <button type="button">Imprimir espelho</button>
      </BarraSelecao>,
    );
    expect(
      screen.getByRole("button", { name: "Imprimir espelho" }),
    ).toBeInTheDocument();
  });

  it("mostra o resumo quando ele vem", () => {
    render(
      <BarraSelecao quantidade={2} onLimpar={() => {}} resumo="R$ 1.000,00">
        <button type="button">Ação</button>
      </BarraSelecao>,
    );
    expect(screen.getByText("R$ 1.000,00")).toBeInTheDocument();
  });

  it("limpar seleção chama quem cuida disso", async () => {
    const onLimpar = vi.fn();
    render(
      <BarraSelecao quantidade={2} onLimpar={onLimpar}>
        <button type="button">Ação</button>
      </BarraSelecao>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Limpar seleção" }),
    );
    expect(onLimpar).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/canonicos/barra-selecao.test.tsx`
Expected: FAIL, `Failed to resolve import "@/components/canonicos/barra-selecao"`.

- [ ] **Step 3: Write the component**

`src/components/canonicos/barra-selecao.tsx`:

```tsx
"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

/**
 * Barra que aparece acima da tabela quando há linha marcada.
 *
 * Só o invólucro: quantas linhas, um resumo opcional, o slot de ações e o
 * "limpar seleção". As ações são de quem chama, porque definir conta em lote e
 * imprimir espelho não têm nada em comum além de acontecerem sobre a seleção.
 *
 * Com zero marcado, não renderiza nada: barra vazia ocupando linha acima de
 * tabela densa é ruído, e foi assim que a de lançamentos sempre se comportou.
 */
export function BarraSelecao({
  quantidade,
  onLimpar,
  resumo,
  children,
}: {
  quantidade: number;
  onLimpar: () => void;
  /** Ex.: o valor somado dos marcados. */
  resumo?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (quantidade === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
      <span className="text-[13px] font-medium">
        {quantidade === 1 ? "1 selecionado" : `${quantidade} selecionados`}
      </span>
      {resumo ? (
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {resumo}
        </span>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        {children}
        <Button type="button" variant="ghost" size="sm" onClick={onLimpar}>
          Limpar seleção
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/canonicos/barra-selecao.test.tsx`
Expected: PASS, 5 testes.

- [ ] **Step 5: Exportar no barril**

Em `src/components/canonicos/index.ts`:

```ts
export * from "./barra-selecao";
```

- [ ] **Step 6: `LoteContaBancaria` passa a usar a barra**

Ler `src/modules/financeiro/lancamentos/components/lote-conta-bancaria.tsx` inteiro antes de mexer. A mudança é só de invólucro: o `div` que hoje desenha a barra e mostra "N selecionado(s)" e o "limpar seleção" sai, e o conteúdo (o combobox de conta e o botão que abre a confirmação) passa a ser `children` de `BarraSelecao`. O `quantidade` vem de `selecionados.length`, o `onLimpar` do `onLimparSelecao` que a prop já traz, e o `resumo` recebe o `valorSelecionado` formatado (era o que a barra já mostrava).

Nada da regra de negócio muda: a confirmação, o `jaComConta`, o `definirContaLancamentosLote` e o `onConcluido` ficam exatamente como estão.

- [ ] **Step 7: Provar que os lançamentos não regrediram**

Run: `npx vitest run src/components/canonicos src/modules/financeiro/lancamentos && npx tsc --noEmit`
Expected: PASS em tudo. Se algum teste de lançamentos falhar, é regressão da extração, não do teste: consertar o componente.

- [ ] **Step 8: Commit**

```bash
git add src/components/canonicos/barra-selecao.tsx src/components/canonicos/barra-selecao.test.tsx src/components/canonicos/index.ts src/modules/financeiro/lancamentos/components/lote-conta-bancaria.tsx
git commit -m "refactor: barra de selecao vira canonico, e o lote de conta mora nela"
```

---

### Task 5: `juros` em `ParcelaPaga`

Sem isto o espelho de pagamento mente sobre o que saiu da conta, porque `valor_liquido` é `valor - desconto + juros` desde 11/08/2026.

**Files:**
- Modify: `src/modules/financeiro/pagamentos/queries.ts` (`ParcelaPaga` na linha 33, e a query de `listarParcelasPagas` na linha 183)
- Create: `src/modules/financeiro/pagamentos/parcela-paga.test.ts`

**Interfaces:**
- Produces: `ParcelaPaga` com o campo novo `juros: number`.

- [ ] **Step 1: Write the failing test**

`src/modules/financeiro/pagamentos/parcela-paga.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { ParcelaPaga } from "@/modules/financeiro/pagamentos/queries";

describe("ParcelaPaga", () => {
  it("o líquido é valor menos desconto mais juros", () => {
    // Trava a semântica que a migration de 11/08/2026 fixou. Sem `juros` no
    // tipo, o espelho de pagamento imprimiria um líquido que não fecha com as
    // suas próprias partes, e ninguém veria o erro no papel.
    const parcela: ParcelaPaga = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      lancamentoNumero: "LAN-2026-0001",
      numeroParcela: 1,
      descricao: "REFERENTE ABASTECIMENTO",
      categoriaNome: "Combustível",
      fornecedorNome: "AUTO POSTO PROGRESSO",
      contaNome: "BANCO DO BRASIL 102.124-9",
      dataPagamento: "2026-08-12",
      valor: 1000,
      desconto: 50,
      juros: 20,
      valorLiquido: 970,
    };
    expect(parcela.valor - parcela.desconto + parcela.juros).toBe(
      parcela.valorLiquido,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/financeiro/pagamentos/parcela-paga.test.ts`
Expected: FAIL na compilação do teste, porque `juros` não existe em `ParcelaPaga`.

- [ ] **Step 3: Acrescentar o campo ao tipo**

Em `src/modules/financeiro/pagamentos/queries.ts`, dentro de `interface ParcelaPaga`, logo depois de `desconto`:

```ts
  /**
   * Juros e multa pagos no atraso. Zero quando não houve.
   *
   * Existe desde 11/08/2026, quando `valor_liquido` passou a ser
   * `valor - desconto + juros`. Sem o campo aqui, o espelho de pagamento
   * mostraria um líquido que não fecha com as partes impressas ao lado.
   */
  juros: number;
```

- [ ] **Step 4: Selecionar a coluna na query**

Em `listarParcelasPagas`, acrescentar `juros` à lista de colunas do `select` de `lancamento_parcelas` e mapear no objeto de retorno:

```ts
      juros: Number(linha.juros ?? 0),
```

Conferir que o `select` realmente pede a coluna:

```bash
grep -n "juros" src/modules/financeiro/pagamentos/queries.ts
```

Expected: aparece no `select`, no tipo e no mapeamento.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/modules/financeiro/pagamentos && npx tsc --noEmit`
Expected: PASS; `tsc` sem saída. Se `tsc` reclamar de outro lugar que monta `ParcelaPaga`, acrescentar `juros` lá também (é o compilador achando o resto do estrago, e é para isso que ele serve).

- [ ] **Step 6: Commit**

```bash
git add src/modules/financeiro/pagamentos/queries.ts src/modules/financeiro/pagamentos/parcela-paga.test.ts
git commit -m "fix(financeiro): ParcelaPaga expoe juros, senao o liquido nao fecha"
```

---

### Task 6: Espelho de lançamento, leitura e rota

Primeiro dos três porque a listagem de lançamentos já tem seleção ligada: é o caminho mais curto até algo funcionando de ponta a ponta.

**Files:**
- Create: `src/modules/financeiro/lancamentos/espelho.ts`
- Create: `src/modules/financeiro/lancamentos/espelho.test.ts`
- Create: `src/app/(espelho)/espelho/lancamentos/page.tsx`

**Interfaces:**
- Consumes: `emLotes`, `LOTE_IDS_POSTGREST` de `@/lib/lotes-de-ids`; `lerIdsDoEspelho`, `MAX_ESPELHOS` de `@/lib/ids-do-espelho`; `createClient` de `@/lib/supabase/server`; `getUsuarioLogado`, `temPermissao` de `@/lib/permissoes`; `trilhaLancamento` de `@/modules/financeiro/lancamentos/queries`; `listarAnexosPorDocumento(entidade, ids): Promise<Record<string, AnexoDoDocumento[]>>` de `@/modules/_shared/anexos/queries`; os canônicos de espelho.
- Produces:
  - `EspelhoLancamento` (tipo) e `buscarLancamentosParaEspelho(ids: string[]): Promise<EspelhoLancamento[]>`
  - `montarEspelhoLancamento(linha: LinhaEspelhoLancamento): EspelhoLancamento` (função pura, exportada para teste)

- [ ] **Step 1: Write the failing test**

`src/modules/financeiro/lancamentos/espelho.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { montarEspelhoLancamento } from "@/modules/financeiro/lancamentos/espelho";

const LINHA = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  numero: "LAN-2026-0001",
  descricao: "REFERENTE ABASTECIMENTO",
  valor: "1000.00",
  status: "pago",
  data_compra: "2026-08-01",
  data_vencimento: "2026-08-12",
  mes_competencia: "2026-08-01",
  observacoes: "Documento: 123",
  fornecedores: { razao_social: "AUTO POSTO PROGRESSO" },
  categorias_financeiras: { nome: "Combustível" },
  formas_pagamento: { nome: "PIX" },
  lancamento_parcelas: [
    {
      id: "9f1b7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b",
      numero_parcela: 1,
      data_vencimento: "2026-08-12",
      valor: "1000.00",
      desconto: "50.00",
      juros: "20.00",
      valor_liquido: "970.00",
      status: "pago",
      data_pagamento: "2026-08-12",
      contas_bancarias: { nome: "BANCO DO BRASIL 102.124-9" },
    },
  ],
  lancamento_rateios: [
    { valor: "600.00", centros_custo: { nome: "009 - Lote 09", codigo: "009" } },
    { valor: "400.00", centros_custo: { nome: "Escritório Central", codigo: null } },
  ],
};

describe("montarEspelhoLancamento", () => {
  it("traz o cabeçalho com fornecedor, categoria e forma", () => {
    const espelho = montarEspelhoLancamento(LINHA);
    expect(espelho.numero).toBe("LAN-2026-0001");
    expect(espelho.fornecedorNome).toBe("AUTO POSTO PROGRESSO");
    expect(espelho.categoriaNome).toBe("Combustível");
    expect(espelho.formaPagamentoNome).toBe("PIX");
    expect(espelho.valor).toBe(1000);
  });

  it("traz as parcelas com desconto, juros e líquido", () => {
    const [parcela] = montarEspelhoLancamento(LINHA).parcelas;
    expect(parcela.valor).toBe(1000);
    expect(parcela.desconto).toBe(50);
    expect(parcela.juros).toBe(20);
    expect(parcela.valorLiquido).toBe(970);
    expect(parcela.contaNome).toBe("BANCO DO BRASIL 102.124-9");
  });

  it("o rateio soma o valor do lançamento", () => {
    const espelho = montarEspelhoLancamento(LINHA);
    const soma = espelho.rateios.reduce((total, r) => total + r.valor, 0);
    expect(soma).toBe(espelho.valor);
  });

  it("ordena as parcelas por número, para o papel sair na ordem do carnê", () => {
    const espelho = montarEspelhoLancamento({
      ...LINHA,
      lancamento_parcelas: [
        { ...LINHA.lancamento_parcelas[0], numero_parcela: 2 },
        { ...LINHA.lancamento_parcelas[0], numero_parcela: 1 },
      ],
    });
    expect(espelho.parcelas.map((p) => p.numeroParcela)).toEqual([1, 2]);
  });

  it("sem fornecedor, categoria ou forma não quebra: cai em nulo", () => {
    const espelho = montarEspelhoLancamento({
      ...LINHA,
      fornecedores: null,
      categorias_financeiras: null,
      formas_pagamento: null,
    });
    expect(espelho.fornecedorNome).toBeNull();
    expect(espelho.categoriaNome).toBeNull();
    expect(espelho.formaPagamentoNome).toBeNull();
  });

  it("lançamento sem parcela e sem rateio sai com listas vazias, não com erro", () => {
    const espelho = montarEspelhoLancamento({
      ...LINHA,
      lancamento_parcelas: [],
      lancamento_rateios: [],
    });
    expect(espelho.parcelas).toEqual([]);
    expect(espelho.rateios).toEqual([]);
  });

  it("converte dinheiro de texto para número sem passar por float do banco", () => {
    // O PostgREST devolve numeric como string de propósito. Number() aqui é o
    // único ponto de conversão, e é sobre o texto exato do banco.
    const espelho = montarEspelhoLancamento({ ...LINHA, valor: "1234.56" });
    expect(espelho.valor).toBe(1234.56);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/financeiro/lancamentos/espelho.test.ts`
Expected: FAIL, `Failed to resolve import`.

- [ ] **Step 3: Write the read module**

`src/modules/financeiro/lancamentos/espelho.ts`. Duas partes: o mapeamento puro (testado acima) e a busca em lotes.

```ts
import { emLotes, LOTE_IDS_POSTGREST } from "@/lib/lotes-de-ids";
import { createClient } from "@/lib/supabase/server";

/** Uma parcela no papel. */
export interface EspelhoParcela {
  id: string;
  numeroParcela: number;
  dataVencimento: string | null;
  valor: number;
  desconto: number;
  juros: number;
  valorLiquido: number;
  status: string;
  dataPagamento: string | null;
  contaNome: string | null;
}

/** Uma linha de rateio no papel. */
export interface EspelhoRateio {
  centroNome: string;
  centroCodigo: string | null;
  valor: number;
}

export interface EspelhoLancamento {
  id: string;
  numero: string | null;
  descricao: string | null;
  valor: number;
  status: string;
  dataCompra: string | null;
  dataVencimento: string | null;
  mesCompetencia: string | null;
  observacoes: string | null;
  fornecedorNome: string | null;
  categoriaNome: string | null;
  formaPagamentoNome: string | null;
  parcelas: EspelhoParcela[];
  rateios: EspelhoRateio[];
}

/** A linha crua do PostgREST. `numeric` chega como string. */
export interface LinhaEspelhoLancamento {
  id: string;
  numero: string | null;
  descricao: string | null;
  valor: string | number;
  status: string;
  data_compra: string | null;
  data_vencimento: string | null;
  mes_competencia: string | null;
  observacoes: string | null;
  fornecedores: { razao_social: string } | null;
  categorias_financeiras: { nome: string } | null;
  formas_pagamento: { nome: string } | null;
  lancamento_parcelas: {
    id: string;
    numero_parcela: number;
    data_vencimento: string | null;
    valor: string | number;
    desconto: string | number | null;
    juros: string | number | null;
    valor_liquido: string | number;
    status: string;
    data_pagamento: string | null;
    contas_bancarias: { nome: string } | null;
  }[];
  lancamento_rateios: {
    valor: string | number;
    centros_custo: { nome: string; codigo: string | null } | null;
  }[];
}

/** Conversão única de dinheiro: sobre o texto exato que o banco mandou. */
function dinheiro(valor: string | number | null | undefined): number {
  return Number(valor ?? 0);
}

/**
 * Monta o espelho a partir da linha crua. Pura, e por isso testável sem banco.
 *
 * Ordena as parcelas por número para o papel sair na ordem do carnê: o
 * PostgREST não garante ordem de linha embutida.
 */
export function montarEspelhoLancamento(
  linha: LinhaEspelhoLancamento,
): EspelhoLancamento {
  return {
    id: linha.id,
    numero: linha.numero,
    descricao: linha.descricao,
    valor: dinheiro(linha.valor),
    status: linha.status,
    dataCompra: linha.data_compra,
    dataVencimento: linha.data_vencimento,
    mesCompetencia: linha.mes_competencia,
    observacoes: linha.observacoes,
    fornecedorNome: linha.fornecedores?.razao_social ?? null,
    categoriaNome: linha.categorias_financeiras?.nome ?? null,
    formaPagamentoNome: linha.formas_pagamento?.nome ?? null,
    parcelas: (linha.lancamento_parcelas ?? [])
      .map((parcela) => ({
        id: parcela.id,
        numeroParcela: parcela.numero_parcela,
        dataVencimento: parcela.data_vencimento,
        valor: dinheiro(parcela.valor),
        desconto: dinheiro(parcela.desconto),
        juros: dinheiro(parcela.juros),
        valorLiquido: dinheiro(parcela.valor_liquido),
        status: parcela.status,
        dataPagamento: parcela.data_pagamento,
        contaNome: parcela.contas_bancarias?.nome ?? null,
      }))
      .sort((a, b) => a.numeroParcela - b.numeroParcela),
    rateios: (linha.lancamento_rateios ?? []).map((rateio) => ({
      centroNome: rateio.centros_custo?.nome ?? "sem centro",
      centroCodigo: rateio.centros_custo?.codigo ?? null,
      valor: dinheiro(rateio.valor),
    })),
  };
}

/**
 * Busca os lançamentos para o espelho, na ordem em que os ids vieram.
 *
 * Em lotes de LOTE_IDS_POSTGREST porque `in` vai na query string de um GET.
 * Id que a RLS não deixa ver simplesmente não volta, e quem chama conta a
 * diferença: o espelho nunca imprime linha que o usuário não pode ver, e
 * nunca derruba a impressão inteira por causa dela.
 */
export async function buscarLancamentosParaEspelho(
  ids: string[],
): Promise<EspelhoLancamento[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();

  const linhas: LinhaEspelhoLancamento[] = [];
  for (const lote of emLotes(ids, LOTE_IDS_POSTGREST)) {
    const { data, error } = await supabase
      .from("lancamentos")
      .select(
        `id, numero, descricao, valor, status, data_compra, data_vencimento,
         mes_competencia, observacoes,
         fornecedores(razao_social),
         categorias_financeiras(nome),
         formas_pagamento(nome),
         lancamento_parcelas(id, numero_parcela, data_vencimento, valor,
           desconto, juros, valor_liquido, status, data_pagamento,
           contas_bancarias(nome)),
         lancamento_rateios(valor, centros_custo(nome, codigo))`,
      )
      .in("id", lote);

    if (error) {
      // A mensagem do banco vai junto: sem ela a falha chega como "não foi
      // possível" e descobrir o motivo vira adivinhação.
      throw new Error(
        `Não foi possível carregar o espelho do lançamento: ${error.message}`,
      );
    }
    linhas.push(...((data ?? []) as unknown as LinhaEspelhoLancamento[]));
  }

  const porId = new Map(
    linhas.map((linha) => [linha.id, montarEspelhoLancamento(linha)]),
  );
  // Ordem pedida, não ordem do banco: o usuário marcou numa ordem e espera o
  // maço de papel naquela ordem.
  return ids
    .map((id) => porId.get(id))
    .filter((espelho): espelho is EspelhoLancamento => espelho !== undefined);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/financeiro/lancamentos/espelho.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 5: Write the route**

`src/app/(espelho)/espelho/lancamentos/page.tsx`:

```tsx
import {
  BotaoImprimir,
  EspelhoCampos,
  EspelhoDinheiro,
  EspelhoImpresso,
  EspelhoSecao,
  EspelhoTabela,
  EspelhoVazio,
} from "@/components/canonicos";
import { formatarData, formatarMesAno } from "@/lib/formatadores";
import { lerIdsDoEspelho, MAX_ESPELHOS } from "@/lib/ids-do-espelho";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import { buscarLancamentosParaEspelho } from "@/modules/financeiro/lancamentos/espelho";
import { trilhaLancamento } from "@/modules/financeiro/lancamentos/queries";

export default async function EspelhoLancamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: bruto } = await searchParams;

  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.lancamentos", "ver")) {
    return (
      <EspelhoVazio
        titulo="Sem permissão"
        explicacao="Você não tem permissão para ver lançamentos, então não há espelho para imprimir."
      />
    );
  }

  const { ids, invalidos, excedeu } = lerIdsDoEspelho(bruto);

  if (excedeu) {
    return (
      <EspelhoVazio
        titulo="Seleção grande demais"
        explicacao={`Marque no máximo ${MAX_ESPELHOS} lançamentos por impressão. Imprimir só uma parte deixaria o maço parecendo completo sem estar.`}
      />
    );
  }

  if (ids.length === 0) {
    return (
      <EspelhoVazio
        titulo="Nada para imprimir"
        explicacao={
          invalidos > 0
            ? "O link não traz nenhum lançamento válido."
            : "Marque ao menos um lançamento na listagem e clique em Imprimir espelho."
        }
      />
    );
  }

  const lancamentos = await buscarLancamentosParaEspelho(ids);

  if (lancamentos.length === 0) {
    return (
      <EspelhoVazio
        titulo="Nada visível para imprimir"
        explicacao="Nenhum dos lançamentos pedidos está visível para você."
      />
    );
  }

  // Trilha por lançamento, reusando a query que a tela de detalhe já usa.
  const trilhas = await Promise.all(
    lancamentos.map((lancamento) => trilhaLancamento(lancamento.id)),
  );

  // Anexos dos N documentos em UMA consulta: listarAnexosPorDocumento já existe
  // e agrupa por id. Com 50 ids o `in` dá 1,9 KB de URL, longe do limite do
  // PostgREST, então aqui não precisa de lote.
  const anexosPorLancamento = await listarAnexosPorDocumento(
    "lancamento",
    lancamentos.map((lancamento) => lancamento.id),
  );

  const ocultos = ids.length - lancamentos.length;
  const emitidoEm = new Date().toISOString();

  return (
    <>
      <BotaoImprimir />

      {ocultos > 0 || invalidos > 0 ? (
        <p className="nao-imprime mx-auto max-w-[190mm] px-6 pt-2 text-[13px] text-[#B45309]">
          {ocultos > 0
            ? `${ocultos} lançamento(s) pedido(s) não estão visíveis para você e ficaram fora. `
            : ""}
          {invalidos > 0 ? `${invalidos} id(s) do link são inválidos.` : ""}
        </p>
      ) : null}

      {lancamentos.map((lancamento, indice) => (
        <EspelhoImpresso
          key={lancamento.id}
          tipo="Lançamento"
          numero={lancamento.numero}
          emitidoPor={usuario.nome}
          emitidoEm={emitidoEm}
        >
          <EspelhoSecao rotulo="Dados do lançamento">
            <EspelhoCampos
              campos={[
                { rotulo: "Fornecedor", valor: lancamento.fornecedorNome },
                { rotulo: "Categoria", valor: lancamento.categoriaNome },
                { rotulo: "Descrição", valor: lancamento.descricao },
                {
                  rotulo: "Forma de pagamento",
                  valor: lancamento.formaPagamentoNome,
                },
                {
                  rotulo: "Valor",
                  valor: <EspelhoDinheiro valor={lancamento.valor} />,
                },
                // Status como TEXTO: no papel a cor pode não sair.
                { rotulo: "Status", valor: lancamento.status },
                {
                  rotulo: "Data do lançamento",
                  valor: formatarData(lancamento.dataCompra),
                },
                {
                  rotulo: "Vencimento",
                  valor: formatarData(lancamento.dataVencimento),
                },
                {
                  rotulo: "Competência",
                  valor: formatarMesAno(lancamento.mesCompetencia),
                },
              ]}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Parcelas">
            <EspelhoTabela
              colunas={[
                { chave: "n", rotulo: "Nº" },
                { chave: "vencimento", rotulo: "Vencimento" },
                { chave: "valor", rotulo: "Valor", alinharDireita: true },
                { chave: "desconto", rotulo: "Desconto", alinharDireita: true },
                { chave: "juros", rotulo: "Juros", alinharDireita: true },
                { chave: "liquido", rotulo: "Líquido", alinharDireita: true },
                { chave: "conta", rotulo: "Conta" },
                { chave: "status", rotulo: "Status" },
                { chave: "pagamento", rotulo: "Pago em" },
              ]}
              linhas={lancamento.parcelas.map((parcela) => ({
                n: parcela.numeroParcela,
                vencimento: formatarData(parcela.dataVencimento),
                valor: <EspelhoDinheiro valor={parcela.valor} />,
                desconto: <EspelhoDinheiro valor={parcela.desconto} />,
                juros: <EspelhoDinheiro valor={parcela.juros} />,
                liquido: <EspelhoDinheiro valor={parcela.valorLiquido} />,
                conta: parcela.contaNome,
                status: parcela.status,
                pagamento: formatarData(parcela.dataPagamento),
              }))}
              totais={{
                n: "Total",
                liquido: (
                  <EspelhoDinheiro
                    valor={lancamento.parcelas.reduce(
                      (soma, parcela) => soma + parcela.valorLiquido,
                      0,
                    )}
                  />
                ),
              }}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Rateio por centro de custo">
            <EspelhoTabela
              colunas={[
                { chave: "centro", rotulo: "Centro de custo" },
                { chave: "valor", rotulo: "Valor", alinharDireita: true },
              ]}
              linhas={lancamento.rateios.map((rateio) => ({
                centro: rateio.centroCodigo
                  ? `${rateio.centroCodigo} — ${rateio.centroNome}`
                  : rateio.centroNome,
                valor: <EspelhoDinheiro valor={rateio.valor} />,
              }))}
              totais={{
                centro: "Total",
                valor: (
                  <EspelhoDinheiro
                    valor={lancamento.rateios.reduce(
                      (soma, rateio) => soma + rateio.valor,
                      0,
                    )}
                  />
                ),
              }}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Trilha">
            <EspelhoTabela
              colunas={[
                { chave: "data", rotulo: "Quando" },
                { chave: "titulo", rotulo: "O que" },
                { chave: "usuario", rotulo: "Quem" },
              ]}
              linhas={(trilhas[indice] ?? []).map((evento) => ({
                data: formatarData(
                  typeof evento.data === "string"
                    ? evento.data
                    : evento.data.toISOString(),
                ),
                titulo: evento.descricao
                  ? `${evento.titulo}: ${evento.descricao}`
                  : evento.titulo,
                usuario: evento.usuario,
              }))}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Anexos">
            <EspelhoTabela
              colunas={[
                { chave: "nome", rotulo: "Arquivo" },
                { chave: "tamanho", rotulo: "Tamanho", alinharDireita: true },
                { chave: "origem", rotulo: "Origem" },
              ]}
              linhas={(anexosPorLancamento[lancamento.id] ?? []).map(
                (anexo) => ({
                  nome: anexo.nome,
                  // KB inteiro: o papel só precisa dizer que o arquivo existe e
                  // que tamanho tem, não a contagem de bytes.
                  tamanho: `${Math.max(1, Math.round(anexo.tamanhoBytes / 1024))} KB`,
                  origem: anexo.propagado
                    ? "propagado da cadeia"
                    : "deste lançamento",
                }),
              )}
            />
          </EspelhoSecao>

          {lancamento.observacoes ? (
            <EspelhoSecao rotulo="Observações">
              <p className="whitespace-pre-line text-[13px]">
                {lancamento.observacoes}
              </p>
            </EspelhoSecao>
          ) : null}
        </EspelhoImpresso>
      ))}
    </>
  );
}
```

`usuario.nome` existe: `UsuarioLogado` em `src/lib/permissoes.ts` traz `id`, `nome`, `email`, `ativo`, `perfilId` e `permissoes`.

- [ ] **Step 6: Rodar tudo e ver a página de pé**

Run: `npx tsc --noEmit && npx vitest run src/modules/financeiro/lancamentos src/lib`
Expected: PASS.

Subir o dev e abrir `/espelho/lancamentos?ids=<id de um lançamento real>`:

```bash
npm run dev
```

Conferir a olho: a Faixa âmbar aparece, o número sai em fonte mono, as parcelas somam o total, o diálogo de impressão abre uma vez só.

- [ ] **Step 7: Commit**

```bash
git add src/modules/financeiro/lancamentos/espelho.ts src/modules/financeiro/lancamentos/espelho.test.ts "src/app/(espelho)/espelho/lancamentos/page.tsx"
git commit -m "feat(financeiro): espelho impresso do lancamento"
```

---

### Task 7: Botões do espelho de lançamento, na listagem e no detalhe

**Files:**
- Modify: `src/modules/financeiro/lancamentos/components/lancamentos-tabela.tsx` (por volta da linha 730, onde a barra de lote é montada)
- Modify: `src/modules/financeiro/lancamentos/components/lancamento-detalhe.tsx` (no cabeçalho, junto dos botões existentes por volta da linha 247)
- Create: `src/components/canonicos/botao-espelho.tsx`
- Create: `src/components/canonicos/botao-espelho.test.tsx`
- Modify: `src/components/canonicos/index.ts`

**Interfaces:**
- Consumes: `MAX_ESPELHOS` de `@/lib/ids-do-espelho`, `Button` de `@/components/ui/button`, `toast` de `@/components/canonicos`.
- Produces: `BotaoEspelho({ rota, ids, rotulo? })` de `@/components/canonicos`.

- [ ] **Step 1: Write the failing test**

`src/components/canonicos/botao-espelho.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BotaoEspelho } from "@/components/canonicos/botao-espelho";

describe("BotaoEspelho", () => {
  it("mostra quantos vão para o papel", () => {
    render(<BotaoEspelho rota="/espelho/lancamentos" ids={["a", "b", "c"]} />);
    expect(
      screen.getByRole("button", { name: "Imprimir espelho (3)" }),
    ).toBeInTheDocument();
  });

  it("com um só, não mostra contagem: o (1) é ruído", () => {
    render(<BotaoEspelho rota="/espelho/lancamentos" ids={["a"]} />);
    expect(
      screen.getByRole("button", { name: "Imprimir espelho" }),
    ).toBeInTheDocument();
  });

  it("abre a rota do espelho em aba nova, com os ids na query", async () => {
    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    render(<BotaoEspelho rota="/espelho/lancamentos" ids={["a", "b"]} />);
    await userEvent.click(screen.getByRole("button"));
    expect(abrir).toHaveBeenCalledWith(
      "/espelho/lancamentos?ids=a%2Cb",
      "_blank",
      "noopener,noreferrer",
    );
    vi.unstubAllGlobals();
  });

  it("aba nova preserva os filtros da listagem, então não navega a página atual", async () => {
    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    render(<BotaoEspelho rota="/espelho/lancamentos" ids={["a"]} />);
    await userEvent.click(screen.getByRole("button"));
    expect(abrir).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("acima do limite avisa e não abre nada", async () => {
    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    const muitos = Array.from({ length: 51 }, (_, i) => String(i));
    render(<BotaoEspelho rota="/espelho/lancamentos" ids={muitos} />);
    await userEvent.click(screen.getByRole("button"));
    // Barrar aqui evita abrir aba só para mostrar recusa.
    expect(abrir).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("sem id nenhum o botão fica desabilitado", () => {
    render(<BotaoEspelho rota="/espelho/lancamentos" ids={[]} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/canonicos/botao-espelho.test.tsx`
Expected: FAIL, `Failed to resolve import`.

- [ ] **Step 3: Write the component**

`src/components/canonicos/botao-espelho.tsx`:

```tsx
"use client";

import { Printer } from "lucide-react";

import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { MAX_ESPELHOS } from "@/lib/ids-do-espelho";

/**
 * Abre o espelho dos registros escolhidos.
 *
 * Aba nova de propósito: a listagem guarda filtro, página e ordenação, e
 * navegar para o espelho os perderia na volta.
 *
 * O limite é checado aqui E na página. Aqui para o usuário saber antes de
 * abrir aba; lá porque o link é colável e guarda que mora só no cliente não é
 * guarda.
 */
export function BotaoEspelho({
  rota,
  ids,
  rotulo = "Imprimir espelho",
}: {
  /** Ex.: "/espelho/lancamentos". */
  rota: string;
  ids: string[];
  rotulo?: string;
}) {
  function abrir() {
    if (ids.length === 0) return;
    if (ids.length > MAX_ESPELHOS) {
      toast.error(
        `Marque no máximo ${MAX_ESPELHOS} para imprimir de uma vez. Você marcou ${ids.length}.`,
      );
      return;
    }
    const url = `${rota}?ids=${encodeURIComponent(ids.join(","))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={ids.length === 0}
      onClick={abrir}
    >
      <Printer />
      {ids.length > 1 ? `${rotulo} (${ids.length})` : rotulo}
    </Button>
  );
}
```

Conferir o caminho real do `toast` antes de importar:

```bash
grep -n "export" src/components/canonicos/toast.ts | head -5
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/canonicos/botao-espelho.test.tsx`
Expected: PASS, 6 testes.

- [ ] **Step 5: Exportar no barril**

Em `src/components/canonicos/index.ts`:

```ts
export * from "./botao-espelho";
```

- [ ] **Step 6: Ligar na listagem de lançamentos**

Em `lancamentos-tabela.tsx`, envolver o `LoteContaBancaria` e o botão novo na `BarraSelecao` já extraída na Task 4, passando `selecionados` como ids:

```tsx
<BarraSelecao
  quantidade={selecionados.length}
  onLimpar={() => setSelecionados([])}
  resumo={<MoneyText valor={valorSelecionado} />}
>
  <BotaoEspelho rota="/espelho/lancamentos" ids={selecionados} />
  {/* o conteúdo de ação do lote de conta continua aqui */}
</BarraSelecao>
```

O `valorSelecionado` já é calculado no arquivo (o `reduce` sobre `selecionadosNaPagina`). Reaproveitar, não recalcular.

- [ ] **Step 7: Ligar no detalhe do lançamento**

Em `lancamento-detalhe.tsx`, junto dos botões do cabeçalho:

```tsx
<BotaoEspelho rota="/espelho/lancamentos" ids={[lancamento.id]} />
```

Ler a região dos botões antes de inserir, para respeitar a ordem e o espaçamento que já existem.

- [ ] **Step 8: Rodar tudo**

Run: `npx vitest run src/components/canonicos src/modules/financeiro && npx tsc --noEmit && npm run lint`
Expected: PASS em tudo.

Conferir na tela: marcar 2 lançamentos, o botão diz "Imprimir espelho (2)", abre aba nova com os dois documentos.

- [ ] **Step 9: Commit**

```bash
git add src/components/canonicos/botao-espelho.tsx src/components/canonicos/botao-espelho.test.tsx src/components/canonicos/index.ts src/modules/financeiro/lancamentos/components/lancamentos-tabela.tsx src/modules/financeiro/lancamentos/components/lancamento-detalhe.tsx
git commit -m "feat(financeiro): botao de imprimir espelho na listagem e no detalhe do lancamento"
```

---

### Task 8: Espelho de OC, leitura e rota

**Files:**
- Create: `src/modules/compras/ordens/espelho.ts`
- Create: `src/modules/compras/ordens/espelho.test.ts`
- Create: `src/app/(espelho)/espelho/ordens/page.tsx`

**Interfaces:**
- Consumes: `emLotes`, `LOTE_IDS_POSTGREST` de `@/lib/lotes-de-ids`; `lerIdsDoEspelho`, `MAX_ESPELHOS` de `@/lib/ids-do-espelho`; `createClient` de `@/lib/supabase/server`; `getUsuarioLogado`, `temPermissao` de `@/lib/permissoes`; `trilhaOrdem` de `@/modules/compras/ordens/queries`; `listarAnexosPorDocumento` de `@/modules/_shared/anexos/queries`; os canônicos de espelho.
- Produces: `EspelhoOrdem`, `EspelhoOrdemItem`, `EspelhoOrdemParcela`, `EspelhoOrdemRateio`, `LinhaEspelhoOrdem`, `montarEspelhoOrdem(linha: LinhaEspelhoOrdem): EspelhoOrdem`, `buscarOrdensParaEspelho(ids: string[]): Promise<EspelhoOrdem[]>`.

**Nomes reais do banco, já conferidos em `buscarOrdem`:** a tabela de itens é **`oc_itens`** (não `ordem_compra_itens`), a coluna de preço é **`preco_unitario`**, a unidade vem por **`insumos(nome, unidades_medida(sigla))`** (não `unidades`), o centro de custo é **por item** (`centros_custo(nome, codigo)`), e as parcelas previstas vivem em **`oc_parcelas(numero_parcela, data_vencimento, valor)`**.

**Duas coisas do domínio que o papel tem que respeitar:**

1. **`subtotal` não é coluna.** É `quantidade * preco_unitario`, calculado em código, exatamente como `buscarOrdem` já faz.
2. **`valor_total` é só a soma dos itens.** Mantido por trigger (`20260618210002_compras_ordens_lancamentos.sql`) como `sum(quantidade * preco_unitario)`. `frete`, `outras_despesas`, `impostos` e `desconto` são colunas separadas e **não entram** nele. O espelho imprime as quatro ao lado do total dos itens e **não inventa um "total geral"**: o ERP não calcula esse número, e somar no papel um total que o sistema não tem faria o espelho discordar de toda outra tela.

- [ ] **Step 1: Write the failing test**

`src/modules/compras/ordens/espelho.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { montarEspelhoOrdem } from "@/modules/compras/ordens/espelho";

const LINHA = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  numero: "OC-2026-0001",
  descricao: "Pedra para a obra",
  valor_total: "100000.00",
  frete: "500.00",
  outras_despesas: "0.00",
  impostos: "0.00",
  desconto: "0.00",
  status: "aprovado",
  motivo_rejeicao: null,
  data_compra: "2026-07-31",
  mes_competencia: "2026-07-01",
  observacoes: null,
  fornecedores: { razao_social: "BRITAM", nome_fantasia: null },
  categorias_financeiras: { nome: "Materiais" },
  cotacoes: { numero: "COT-2026-0003" },
  condicoes_pagamento: { descricao: "À Vista" },
  oc_itens: [
    {
      id: "9f1b7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b",
      quantidade: 10,
      preco_unitario: 10000,
      insumos: { nome: "Pedra brita 1", unidades_medida: { sigla: "m3" } },
      centros_custo: { nome: "009 - Lote 09", codigo: "009" },
    },
  ],
  oc_parcelas: [
    { numero_parcela: 1, data_vencimento: "2026-08-31", valor: "100000.00" },
  ],
};

describe("montarEspelhoOrdem", () => {
  it("traz o cabeçalho da OC", () => {
    const espelho = montarEspelhoOrdem(LINHA);
    expect(espelho.numero).toBe("OC-2026-0001");
    expect(espelho.fornecedorNome).toBe("BRITAM");
    expect(espelho.categoriaNome).toBe("Materiais");
    expect(espelho.cotacaoNumero).toBe("COT-2026-0003");
    expect(espelho.condicaoDescricao).toBe("À Vista");
    expect(espelho.valorTotal).toBe(100000);
  });

  it("traz frete, impostos e desconto, que ficam FORA do valor total", () => {
    // Se o papel não mostrar isto, quem lê não tem como saber que a OC teve
    // R$ 500 de frete: valor_total é só a soma dos itens, por trigger.
    const espelho = montarEspelhoOrdem(LINHA);
    expect(espelho.frete).toBe(500);
    expect(espelho.outrasDespesas).toBe(0);
    expect(espelho.impostos).toBe(0);
    expect(espelho.desconto).toBe(0);
  });

  it("calcula o subtotal do item, porque não é coluna do banco", () => {
    const [item] = montarEspelhoOrdem(LINHA).itens;
    expect(item.insumoNome).toBe("Pedra brita 1");
    expect(item.unidade).toBe("m3");
    expect(item.quantidade).toBe(10);
    expect(item.precoUnitario).toBe(10000);
    expect(item.subtotal).toBe(100000);
    expect(item.centroCustoNome).toBe("009 - Lote 09");
  });

  it("os itens somam o valor total, que é o que a trigger mantém", () => {
    const espelho = montarEspelhoOrdem(LINHA);
    const soma = espelho.itens.reduce((total, i) => total + i.subtotal, 0);
    expect(soma).toBe(espelho.valorTotal);
  });

  it("agrupa o rateio por centro de custo a partir dos itens", () => {
    // A OC não tem tabela de rateio: o centro mora no item. Dois itens do
    // mesmo centro viram UMA linha no papel.
    const espelho = montarEspelhoOrdem({
      ...LINHA,
      valor_total: "150000.00",
      oc_itens: [
        LINHA.oc_itens[0],
        {
          ...LINHA.oc_itens[0],
          id: "outro",
          quantidade: 5,
          preco_unitario: 10000,
        },
      ],
    });
    expect(espelho.rateios).toHaveLength(1);
    expect(espelho.rateios[0].centroNome).toBe("009 - Lote 09");
    expect(espelho.rateios[0].valor).toBe(150000);
  });

  it("traz as parcelas previstas da OC", () => {
    const [parcela] = montarEspelhoOrdem(LINHA).parcelas;
    expect(parcela.numeroParcela).toBe(1);
    expect(parcela.dataVencimento).toBe("2026-08-31");
    expect(parcela.valor).toBe(100000);
  });

  it("item sem insumo, sem unidade ou sem centro não quebra o papel", () => {
    const espelho = montarEspelhoOrdem({
      ...LINHA,
      oc_itens: [{ ...LINHA.oc_itens[0], insumos: null, centros_custo: null }],
    });
    expect(espelho.itens[0].insumoNome).toBeNull();
    expect(espelho.itens[0].unidade).toBeNull();
    expect(espelho.itens[0].centroCustoNome).toBe("sem centro");
  });

  it("OC sem item e sem parcela sai com listas vazias, não com erro", () => {
    const espelho = montarEspelhoOrdem({
      ...LINHA,
      oc_itens: [],
      oc_parcelas: [],
    });
    expect(espelho.itens).toEqual([]);
    expect(espelho.parcelas).toEqual([]);
    expect(espelho.rateios).toEqual([]);
  });

  it("quantidade é numeric(14,3) e não perde a terceira casa", () => {
    const espelho = montarEspelhoOrdem({
      ...LINHA,
      oc_itens: [{ ...LINHA.oc_itens[0], quantidade: "10.125" }],
    });
    expect(espelho.itens[0].quantidade).toBe(10.125);
  });

  it("prefere o nome fantasia do fornecedor quando ele existe", () => {
    const espelho = montarEspelhoOrdem({
      ...LINHA,
      fornecedores: {
        razao_social: "BRITAS DA AMAZONIA LTDA",
        nome_fantasia: "BRITAM",
      },
    });
    expect(espelho.fornecedorNome).toBe("BRITAM");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/compras/ordens/espelho.test.ts`
Expected: FAIL, `Failed to resolve import "@/modules/compras/ordens/espelho"`.

- [ ] **Step 3: Write the read module**

`src/modules/compras/ordens/espelho.ts`:

```ts
import { emLotes, LOTE_IDS_POSTGREST } from "@/lib/lotes-de-ids";
import { createClient } from "@/lib/supabase/server";

export interface EspelhoOrdemItem {
  id: string;
  insumoNome: string | null;
  unidade: string | null;
  quantidade: number;
  precoUnitario: number;
  /** quantidade x preço. Não é coluna do banco. */
  subtotal: number;
  centroCustoNome: string;
  centroCustoCodigo: string | null;
}

export interface EspelhoOrdemParcela {
  numeroParcela: number;
  dataVencimento: string | null;
  valor: number;
}

export interface EspelhoOrdemRateio {
  centroNome: string;
  centroCodigo: string | null;
  valor: number;
}

export interface EspelhoOrdem {
  id: string;
  numero: string | null;
  descricao: string | null;
  /** Soma dos itens, mantida por trigger. NÃO inclui frete nem impostos. */
  valorTotal: number;
  frete: number;
  outrasDespesas: number;
  impostos: number;
  desconto: number;
  status: string;
  motivoRejeicao: string | null;
  dataCompra: string | null;
  mesCompetencia: string | null;
  observacoes: string | null;
  fornecedorNome: string | null;
  categoriaNome: string | null;
  cotacaoNumero: string | null;
  condicaoDescricao: string | null;
  itens: EspelhoOrdemItem[];
  parcelas: EspelhoOrdemParcela[];
  /** Derivado dos itens: a OC não tem tabela de rateio. */
  rateios: EspelhoOrdemRateio[];
}

/** A linha crua do PostgREST. `numeric` chega como string. */
export interface LinhaEspelhoOrdem {
  id: string;
  numero: string | null;
  descricao: string | null;
  valor_total: string | number;
  frete: string | number | null;
  outras_despesas: string | number | null;
  impostos: string | number | null;
  desconto: string | number | null;
  status: string;
  motivo_rejeicao: string | null;
  data_compra: string | null;
  mes_competencia: string | null;
  observacoes: string | null;
  fornecedores: { razao_social: string; nome_fantasia: string | null } | null;
  categorias_financeiras: { nome: string } | null;
  cotacoes: { numero: string | null } | null;
  condicoes_pagamento: { descricao: string | null } | null;
  oc_itens: {
    id: string;
    quantidade: string | number;
    preco_unitario: string | number;
    insumos: { nome: string; unidades_medida: { sigla: string } | null } | null;
    centros_custo: { nome: string; codigo: string | null } | null;
  }[];
  oc_parcelas: {
    numero_parcela: number;
    data_vencimento: string | null;
    valor: string | number;
  }[];
}

/** Conversão única de número: sobre o texto exato que o banco mandou. */
function numero(valor: string | number | null | undefined): number {
  return Number(valor ?? 0);
}

/**
 * Monta o espelho da OC a partir da linha crua. Pura, testável sem banco.
 *
 * O rateio é derivado dos itens, somado por centro: a OC não tem tabela de
 * rateio, o centro mora no item, e dois itens do mesmo centro têm que virar uma
 * linha só no papel.
 */
export function montarEspelhoOrdem(linha: LinhaEspelhoOrdem): EspelhoOrdem {
  const itens: EspelhoOrdemItem[] = (linha.oc_itens ?? []).map((item) => {
    const quantidade = numero(item.quantidade);
    const precoUnitario = numero(item.preco_unitario);
    return {
      id: item.id,
      insumoNome: item.insumos?.nome ?? null,
      unidade: item.insumos?.unidades_medida?.sigla ?? null,
      quantidade,
      precoUnitario,
      subtotal: quantidade * precoUnitario,
      centroCustoNome: item.centros_custo?.nome ?? "sem centro",
      centroCustoCodigo: item.centros_custo?.codigo ?? null,
    };
  });

  const porCentro = new Map<string, EspelhoOrdemRateio>();
  for (const item of itens) {
    const atual = porCentro.get(item.centroCustoNome);
    if (atual) {
      atual.valor += item.subtotal;
      continue;
    }
    porCentro.set(item.centroCustoNome, {
      centroNome: item.centroCustoNome,
      centroCodigo: item.centroCustoCodigo,
      valor: item.subtotal,
    });
  }

  return {
    id: linha.id,
    numero: linha.numero,
    descricao: linha.descricao,
    valorTotal: numero(linha.valor_total),
    frete: numero(linha.frete),
    outrasDespesas: numero(linha.outras_despesas),
    impostos: numero(linha.impostos),
    desconto: numero(linha.desconto),
    status: linha.status,
    motivoRejeicao: linha.motivo_rejeicao,
    dataCompra: linha.data_compra,
    mesCompetencia: linha.mes_competencia,
    observacoes: linha.observacoes,
    // Nome fantasia primeiro, igual ao resto das telas de compras.
    fornecedorNome:
      linha.fornecedores?.nome_fantasia ??
      linha.fornecedores?.razao_social ??
      null,
    categoriaNome: linha.categorias_financeiras?.nome ?? null,
    cotacaoNumero: linha.cotacoes?.numero ?? null,
    condicaoDescricao: linha.condicoes_pagamento?.descricao ?? null,
    itens,
    parcelas: (linha.oc_parcelas ?? [])
      .map((parcela) => ({
        numeroParcela: parcela.numero_parcela,
        dataVencimento: parcela.data_vencimento,
        valor: numero(parcela.valor),
      }))
      .sort((a, b) => a.numeroParcela - b.numeroParcela),
    rateios: [...porCentro.values()],
  };
}

/**
 * Busca as OCs para o espelho, na ordem em que os ids vieram.
 *
 * Em lotes de LOTE_IDS_POSTGREST porque `in` vai na query string de um GET. Id
 * que a RLS não deixa ver simplesmente não volta, e quem chama conta a
 * diferença: o espelho nunca imprime linha que o usuário não pode ver, e nunca
 * derruba a impressão inteira por causa dela.
 */
export async function buscarOrdensParaEspelho(
  ids: string[],
): Promise<EspelhoOrdem[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();

  const linhas: LinhaEspelhoOrdem[] = [];
  for (const lote of emLotes(ids, LOTE_IDS_POSTGREST)) {
    const { data, error } = await supabase
      .from("ordens_compra")
      .select(
        `id, numero, descricao, valor_total, frete, outras_despesas, impostos,
         desconto, status, motivo_rejeicao, data_compra, mes_competencia,
         observacoes,
         fornecedores(razao_social, nome_fantasia),
         categorias_financeiras(nome),
         cotacoes(numero),
         condicoes_pagamento(descricao),
         oc_itens(id, quantidade, preco_unitario,
           insumos(nome, unidades_medida(sigla)),
           centros_custo(nome, codigo)),
         oc_parcelas(numero_parcela, data_vencimento, valor)`,
      )
      .in("id", lote);

    if (error) {
      // A mensagem do banco vai junto: sem ela a falha chega como "não foi
      // possível" e descobrir o motivo vira adivinhação.
      throw new Error(
        `Não foi possível carregar o espelho da ordem de compra: ${error.message}`,
      );
    }
    linhas.push(...((data ?? []) as unknown as LinhaEspelhoOrdem[]));
  }

  const porId = new Map(
    linhas.map((linha) => [linha.id, montarEspelhoOrdem(linha)]),
  );
  // Ordem pedida, não ordem do banco: o usuário marcou numa ordem e espera o
  // maço de papel naquela ordem.
  return ids
    .map((id) => porId.get(id))
    .filter((espelho): espelho is EspelhoOrdem => espelho !== undefined);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/compras/ordens/espelho.test.ts`
Expected: PASS, 10 testes.

- [ ] **Step 5: Write the route**

`src/app/(espelho)/espelho/ordens/page.tsx`:

```tsx
import {
  BotaoImprimir,
  EspelhoCampos,
  EspelhoDinheiro,
  EspelhoImpresso,
  EspelhoSecao,
  EspelhoTabela,
  EspelhoVazio,
} from "@/components/canonicos";
import {
  formatarData,
  formatarMesAno,
  formatarQuantidade,
} from "@/lib/formatadores";
import { lerIdsDoEspelho, MAX_ESPELHOS } from "@/lib/ids-do-espelho";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import { buscarOrdensParaEspelho } from "@/modules/compras/ordens/espelho";
import { trilhaOrdem } from "@/modules/compras/ordens/queries";

export default async function EspelhoOrdensPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: bruto } = await searchParams;

  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "compras.ordens", "ver")) {
    return (
      <EspelhoVazio
        titulo="Sem permissão"
        explicacao="Você não tem permissão para ver ordens de compra, então não há espelho para imprimir."
      />
    );
  }

  const { ids, invalidos, excedeu } = lerIdsDoEspelho(bruto);

  if (excedeu) {
    return (
      <EspelhoVazio
        titulo="Seleção grande demais"
        explicacao={`Marque no máximo ${MAX_ESPELHOS} ordens por impressão. Imprimir só uma parte deixaria o maço parecendo completo sem estar.`}
      />
    );
  }

  if (ids.length === 0) {
    return (
      <EspelhoVazio
        titulo="Nada para imprimir"
        explicacao={
          invalidos > 0
            ? "O link não traz nenhuma ordem de compra válida."
            : "Marque ao menos uma ordem na listagem e clique em Imprimir espelho."
        }
      />
    );
  }

  const ordens = await buscarOrdensParaEspelho(ids);

  if (ordens.length === 0) {
    return (
      <EspelhoVazio
        titulo="Nada visível para imprimir"
        explicacao="Nenhuma das ordens pedidas está visível para você."
      />
    );
  }

  const trilhas = await Promise.all(
    ordens.map((ordem) => trilhaOrdem(ordem.id)),
  );
  const anexosPorOrdem = await listarAnexosPorDocumento(
    "ordem_compra",
    ordens.map((ordem) => ordem.id),
  );

  const ocultas = ids.length - ordens.length;
  const emitidoEm = new Date().toISOString();

  return (
    <>
      <BotaoImprimir />

      {ocultas > 0 || invalidos > 0 ? (
        <p className="nao-imprime mx-auto max-w-[190mm] px-6 pt-2 text-[13px] text-[#B45309]">
          {ocultas > 0
            ? `${ocultas} ordem(ns) pedida(s) não estão visíveis para você e ficaram fora. `
            : ""}
          {invalidos > 0 ? `${invalidos} id(s) do link são inválidos.` : ""}
        </p>
      ) : null}

      {ordens.map((ordem, indice) => (
        <EspelhoImpresso
          key={ordem.id}
          tipo="Ordem de compra"
          numero={ordem.numero}
          emitidoPor={usuario.nome}
          emitidoEm={emitidoEm}
        >
          <EspelhoSecao rotulo="Dados da ordem">
            <EspelhoCampos
              campos={[
                { rotulo: "Fornecedor", valor: ordem.fornecedorNome },
                { rotulo: "Categoria", valor: ordem.categoriaNome },
                { rotulo: "Descrição", valor: ordem.descricao },
                { rotulo: "Condição", valor: ordem.condicaoDescricao },
                // Status como TEXTO: no papel a cor pode não sair.
                { rotulo: "Status", valor: ordem.status },
                {
                  rotulo: "Data da compra",
                  valor: formatarData(ordem.dataCompra),
                },
                {
                  rotulo: "Competência",
                  valor: formatarMesAno(ordem.mesCompetencia),
                },
                { rotulo: "Cotação de origem", valor: ordem.cotacaoNumero },
                {
                  rotulo: "Total dos itens",
                  valor: <EspelhoDinheiro valor={ordem.valorTotal} />,
                },
                {
                  rotulo: "Frete",
                  valor: <EspelhoDinheiro valor={ordem.frete} />,
                },
                {
                  rotulo: "Outras despesas",
                  valor: <EspelhoDinheiro valor={ordem.outrasDespesas} />,
                },
                {
                  rotulo: "Impostos",
                  valor: <EspelhoDinheiro valor={ordem.impostos} />,
                },
                {
                  rotulo: "Desconto",
                  valor: <EspelhoDinheiro valor={ordem.desconto} />,
                },
                ...(ordem.motivoRejeicao
                  ? [
                      {
                        rotulo: "Motivo da rejeição",
                        valor: ordem.motivoRejeicao,
                      },
                    ]
                  : []),
              ]}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Itens">
            <EspelhoTabela
              colunas={[
                { chave: "insumo", rotulo: "Insumo" },
                { chave: "unidade", rotulo: "Un." },
                { chave: "quantidade", rotulo: "Qtd.", alinharDireita: true },
                { chave: "preco", rotulo: "Preço un.", alinharDireita: true },
                { chave: "subtotal", rotulo: "Subtotal", alinharDireita: true },
                { chave: "centro", rotulo: "Centro de custo" },
              ]}
              linhas={ordem.itens.map((item) => ({
                insumo: item.insumoNome,
                unidade: item.unidade,
                quantidade: formatarQuantidade(item.quantidade),
                preco: <EspelhoDinheiro valor={item.precoUnitario} />,
                subtotal: <EspelhoDinheiro valor={item.subtotal} />,
                centro: item.centroCustoCodigo
                  ? `${item.centroCustoCodigo} — ${item.centroCustoNome}`
                  : item.centroCustoNome,
              }))}
              totais={{
                insumo: "Total dos itens",
                subtotal: <EspelhoDinheiro valor={ordem.valorTotal} />,
              }}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Rateio por centro de custo">
            <EspelhoTabela
              colunas={[
                { chave: "centro", rotulo: "Centro de custo" },
                { chave: "valor", rotulo: "Valor", alinharDireita: true },
              ]}
              linhas={ordem.rateios.map((rateio) => ({
                centro: rateio.centroCodigo
                  ? `${rateio.centroCodigo} — ${rateio.centroNome}`
                  : rateio.centroNome,
                valor: <EspelhoDinheiro valor={rateio.valor} />,
              }))}
              totais={{
                centro: "Total",
                valor: <EspelhoDinheiro valor={ordem.valorTotal} />,
              }}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Parcelas previstas">
            <EspelhoTabela
              colunas={[
                { chave: "n", rotulo: "Nº" },
                { chave: "vencimento", rotulo: "Vencimento" },
                { chave: "valor", rotulo: "Valor", alinharDireita: true },
              ]}
              linhas={ordem.parcelas.map((parcela) => ({
                n: parcela.numeroParcela,
                vencimento: formatarData(parcela.dataVencimento),
                valor: <EspelhoDinheiro valor={parcela.valor} />,
              }))}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Trilha">
            <EspelhoTabela
              colunas={[
                { chave: "data", rotulo: "Quando" },
                { chave: "titulo", rotulo: "O que" },
                { chave: "usuario", rotulo: "Quem" },
              ]}
              linhas={(trilhas[indice] ?? []).map((evento) => ({
                data: formatarData(
                  typeof evento.data === "string"
                    ? evento.data
                    : evento.data.toISOString(),
                ),
                titulo: evento.descricao
                  ? `${evento.titulo}: ${evento.descricao}`
                  : evento.titulo,
                usuario: evento.usuario,
              }))}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Anexos">
            <EspelhoTabela
              colunas={[
                { chave: "nome", rotulo: "Arquivo" },
                { chave: "tamanho", rotulo: "Tamanho", alinharDireita: true },
                { chave: "origem", rotulo: "Origem" },
              ]}
              linhas={(anexosPorOrdem[ordem.id] ?? []).map((anexo) => ({
                nome: anexo.nome,
                tamanho: `${Math.max(1, Math.round(anexo.tamanhoBytes / 1024))} KB`,
                origem: anexo.propagado ? "propagado da cadeia" : "desta ordem",
              }))}
            />
          </EspelhoSecao>

          {ordem.observacoes ? (
            <EspelhoSecao rotulo="Observações">
              <p className="whitespace-pre-line text-[13px]">
                {ordem.observacoes}
              </p>
            </EspelhoSecao>
          ) : null}
        </EspelhoImpresso>
      ))}
    </>
  );
}
```

`formatarQuantidade(valor)` recebe um argumento só (`number | string | null | undefined`) e devolve string em pt-BR, com zero quando o valor não é número. Conferido em `src/lib/formatadores.ts`, linha 29.

- [ ] **Step 6: Rodar e ver de pé**

Run: `npx tsc --noEmit && npx vitest run src/modules/compras/ordens`
Expected: PASS.

Abrir `/espelho/ordens?ids=<id de uma OC real>` e conferir que os itens somam o total impresso e que frete e impostos aparecem separados dele.

- [ ] **Step 7: Commit**

```bash
git add src/modules/compras/ordens/espelho.ts src/modules/compras/ordens/espelho.test.ts "src/app/(espelho)/espelho/ordens/page.tsx"
git commit -m "feat(compras): espelho impresso da ordem de compra"
```

---

### Task 9: Seleção e botões na OC

A listagem de ordens **não tem seleção hoje**: é aqui que a prop `selecao` do `DataTable` é ligada nela.

**Files:**
- Modify: `src/modules/compras/ordens/components/ordens-tabela.tsx` (o componente começa na linha 219; o `DataTable` na 284)
- Modify: `src/modules/compras/ordens/components/ordem-detalhe.tsx` (cabeçalho, junto dos botões da linha 247)

**Interfaces:**
- Consumes: `BarraSelecao`, `BotaoEspelho` de `@/components/canonicos`; `SelecaoDataTable` (a prop `selecao` do `DataTable`).

- [ ] **Step 1: Ler como a seleção é ligada nos lançamentos**

```bash
sed -n '355,395p' src/modules/financeiro/lancamentos/components/lancamentos-tabela.tsx
sed -n '755,775p' src/modules/financeiro/lancamentos/components/lancamentos-tabela.tsx
```

Anotar como o estado `selecionados` é guardado e por que ele **não** persiste entre visitas (há um comentário explicando: aplicar lote numa lista que o usuário não está mais vendo). A OC segue a mesma escolha.

- [ ] **Step 2: Ligar a seleção e a barra em `ordens-tabela.tsx`**

Estado no componente:

```tsx
const [selecionados, setSelecionados] = React.useState<string[]>([]);
```

Envolver o `DataTable` e acrescentar a prop:

```tsx
return (
  <div className="flex flex-col gap-2">
    <BarraSelecao
      quantidade={selecionados.length}
      onLimpar={() => setSelecionados([])}
    >
      <BotaoEspelho rota="/espelho/ordens" ids={selecionados} />
    </BarraSelecao>
    <DataTable
      /* ...todas as props que já existem, sem mudança... */
      selecao={{
        idDaLinha: (ordem: OrdemLista) => ordem.id,
        selecionados,
        onSelecionadosChange: setSelecionados,
      }}
    />
  </div>
);
```

O `onRowClick={abrir}` continua: o `DataTable` já impede o clique no checkbox de disparar a navegação da linha (há comentário sobre isso no canônico).

- [ ] **Step 3: Botão no detalhe da OC**

Em `ordem-detalhe.tsx`, junto dos botões do cabeçalho:

```tsx
<BotaoEspelho rota="/espelho/ordens" ids={[ordem.id]} />
```

- [ ] **Step 4: Rodar tudo**

Run: `npx vitest run src/modules/compras && npx tsc --noEmit && npm run lint`
Expected: PASS.

Conferir na tela: o checkbox aparece na listagem de OC, marcar 2 e imprimir abre aba com os dois documentos; clicar na linha (fora do checkbox) ainda abre o detalhe.

- [ ] **Step 5: Commit**

```bash
git add src/modules/compras/ordens/components/ordens-tabela.tsx src/modules/compras/ordens/components/ordem-detalhe.tsx
git commit -m "feat(compras): selecao de linha e botao de espelho na ordem de compra"
```

---

### Task 10: Espelho de pagamento, leitura e rota

Pagamento é `lancamento_parcelas` com status `pago`, então a rota recebe **id de parcela** e o papel carrega o cabeçalho do lançamento pai: um papel dizendo só "parcela 2, R$ 1.943,95, paga em 26/06" não comprova nada.

**Files:**
- Create: `src/modules/financeiro/pagamentos/espelho.ts`
- Create: `src/modules/financeiro/pagamentos/espelho.test.ts`
- Create: `src/app/(espelho)/espelho/pagamentos/page.tsx`

**Interfaces:**
- Consumes: `emLotes`, `LOTE_IDS_POSTGREST` de `@/lib/lotes-de-ids`; `lerIdsDoEspelho`, `MAX_ESPELHOS` de `@/lib/ids-do-espelho`; `createClient` de `@/lib/supabase/server`; `getUsuarioLogado`, `temPermissao` de `@/lib/permissoes`; `listarAnexosPorDocumento` de `@/modules/_shared/anexos/queries`; `EventoTrilha` de `@/components/canonicos`; os canônicos de espelho.
- Produces: `EspelhoPagamento`, `EspelhoPagamentoRateio`, `LinhaEspelhoPagamento`, `montarEspelhoPagamento(linha: LinhaEspelhoPagamento): EspelhoPagamento`, `buscarPagamentosParaEspelho(ids: string[]): Promise<EspelhoPagamento[]>`, `trilhaDeParcelas(ids: string[]): Promise<Record<string, EventoTrilha[]>>`.

**Trilha de parcela não existe ainda no projeto.** Há `trilhaOrdem`, `trilhaCotacao`, `trilhaFolha` e `trilhaLancamento`, mas nenhuma para parcela. A tabela existe: `parcela_eventos(id, parcela_id, tipo, motivo, data_de, data_para, created_at, created_by)`. Esta task cria `trilhaDeParcelas(ids)`, que lê os N de uma vez, porque o espelho imprime vários pagamentos.

- [ ] **Step 1: Write the failing test**

`src/modules/financeiro/pagamentos/espelho.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { montarEspelhoPagamento } from "@/modules/financeiro/pagamentos/espelho";

const LINHA = {
  id: "9f1b7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b",
  numero_parcela: 2,
  data_vencimento: "2026-07-06",
  valor: "1000.00",
  desconto: "50.00",
  juros: "20.00",
  valor_liquido: "970.00",
  status: "pago",
  data_pagamento: "2026-06-26",
  contas_bancarias: { nome: "BANCO DO BRASIL 102.124-9" },
  lancamentos: {
    id: "550e8400-e29b-41d4-a716-446655440000",
    numero: "LAN-2026-0001",
    descricao: "REFERENTE PAGAMENTO DE SALARIO",
    valor: "3000.00",
    status: "pago",
    mes_competencia: "2026-07-01",
    observacoes: null,
    fornecedores: { razao_social: "JOAO SANTIAGO DE OLIVEIRA" },
    categorias_financeiras: { nome: "Salário Mão de Obra" },
    formas_pagamento: { nome: "PIX" },
    lancamento_rateios: [
      {
        valor: "1500.00",
        centros_custo: { nome: "009 - Lote 09", codigo: "009" },
      },
      {
        valor: "1500.00",
        centros_custo: { nome: "003 - Ramal do Gama", codigo: "003" },
      },
    ],
  },
};

describe("montarEspelhoPagamento", () => {
  it("traz a parcela paga com desconto, juros e líquido", () => {
    const espelho = montarEspelhoPagamento(LINHA);
    expect(espelho.numeroParcela).toBe(2);
    expect(espelho.valor).toBe(1000);
    expect(espelho.desconto).toBe(50);
    expect(espelho.juros).toBe(20);
    expect(espelho.valorLiquido).toBe(970);
    expect(espelho.contaNome).toBe("BANCO DO BRASIL 102.124-9");
    expect(espelho.dataPagamento).toBe("2026-06-26");
  });

  it("o líquido fecha com as partes impressas ao lado", () => {
    // Trava a semântica de 11/08/2026: valor - desconto + juros. Se o papel
    // mostrar partes que não somam o líquido, quem lê perde a confiança no
    // documento inteiro.
    const espelho = montarEspelhoPagamento(LINHA);
    expect(espelho.valor - espelho.desconto + espelho.juros).toBe(
      espelho.valorLiquido,
    );
  });

  it("carrega o cabeçalho do lançamento pai, porque parcela sozinha não comprova nada", () => {
    const espelho = montarEspelhoPagamento(LINHA);
    expect(espelho.lancamentoId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(espelho.lancamentoNumero).toBe("LAN-2026-0001");
    expect(espelho.fornecedorNome).toBe("JOAO SANTIAGO DE OLIVEIRA");
    expect(espelho.categoriaNome).toBe("Salário Mão de Obra");
    expect(espelho.formaPagamentoNome).toBe("PIX");
    expect(espelho.lancamentoValor).toBe(3000);
    expect(espelho.lancamentoDescricao).toBe("REFERENTE PAGAMENTO DE SALARIO");
  });

  it("traz o rateio do lançamento pai, somando o valor dele", () => {
    const espelho = montarEspelhoPagamento(LINHA);
    expect(espelho.rateios).toHaveLength(2);
    expect(espelho.rateios.reduce((soma, r) => soma + r.valor, 0)).toBe(
      espelho.lancamentoValor,
    );
  });

  it("o título do papel identifica lançamento e parcela juntos", () => {
    expect(montarEspelhoPagamento(LINHA).titulo).toBe(
      "LAN-2026-0001 parcela 2",
    );
  });

  it("lançamento sem número ainda gera título utilizável", () => {
    const espelho = montarEspelhoPagamento({
      ...LINHA,
      lancamentos: { ...LINHA.lancamentos, numero: null },
    });
    expect(espelho.titulo).toBe("sem número parcela 2");
  });

  it("parcela sem conta e sem data de pagamento não quebra", () => {
    const espelho = montarEspelhoPagamento({
      ...LINHA,
      contas_bancarias: null,
      data_pagamento: null,
    });
    expect(espelho.contaNome).toBeNull();
    expect(espelho.dataPagamento).toBeNull();
  });

  it("parcela sem lançamento pai devolve nulo em vez de estourar", () => {
    // Não deve acontecer (a FK garante), mas o papel não pode ser a tela que
    // descobre isso com um erro de runtime na frente do usuário.
    const espelho = montarEspelhoPagamento({ ...LINHA, lancamentos: null });
    expect(espelho.lancamentoNumero).toBeNull();
    expect(espelho.fornecedorNome).toBeNull();
    expect(espelho.rateios).toEqual([]);
  });

  it("converte dinheiro de texto sem passar por float", () => {
    const espelho = montarEspelhoPagamento({ ...LINHA, valor: "1234.56" });
    expect(espelho.valor).toBe(1234.56);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/financeiro/pagamentos/espelho.test.ts`
Expected: FAIL, `Failed to resolve import "@/modules/financeiro/pagamentos/espelho"`.

- [ ] **Step 3: Write the read module**

`src/modules/financeiro/pagamentos/espelho.ts`:

```ts
import type { EventoTrilha } from "@/components/canonicos";
import { emLotes, LOTE_IDS_POSTGREST } from "@/lib/lotes-de-ids";
import { createClient } from "@/lib/supabase/server";

export interface EspelhoPagamentoRateio {
  centroNome: string;
  centroCodigo: string | null;
  valor: number;
}

export interface EspelhoPagamento {
  /** Id da PARCELA: é ele que a rota recebe. */
  id: string;
  /** "LAN-2026-0001 parcela 2". Vai no cabeçalho do papel. */
  titulo: string;
  numeroParcela: number;
  dataVencimento: string | null;
  valor: number;
  desconto: number;
  juros: number;
  /** valor - desconto + juros: o que de fato saiu da conta. */
  valorLiquido: number;
  status: string;
  dataPagamento: string | null;
  contaNome: string | null;
  /** O lançamento pai, achatado: o papel imprime tudo em um bloco. */
  lancamentoId: string | null;
  lancamentoNumero: string | null;
  lancamentoDescricao: string | null;
  lancamentoValor: number;
  lancamentoStatus: string | null;
  lancamentoObservacoes: string | null;
  mesCompetencia: string | null;
  fornecedorNome: string | null;
  categoriaNome: string | null;
  formaPagamentoNome: string | null;
  rateios: EspelhoPagamentoRateio[];
}

/** A linha crua do PostgREST. `numeric` chega como string. */
export interface LinhaEspelhoPagamento {
  id: string;
  numero_parcela: number;
  data_vencimento: string | null;
  valor: string | number;
  desconto: string | number | null;
  juros: string | number | null;
  valor_liquido: string | number;
  status: string;
  data_pagamento: string | null;
  contas_bancarias: { nome: string } | null;
  lancamentos: {
    id: string;
    numero: string | null;
    descricao: string | null;
    valor: string | number;
    status: string;
    mes_competencia: string | null;
    observacoes: string | null;
    fornecedores: { razao_social: string } | null;
    categorias_financeiras: { nome: string } | null;
    formas_pagamento: { nome: string } | null;
    lancamento_rateios: {
      valor: string | number;
      centros_custo: { nome: string; codigo: string | null } | null;
    }[];
  } | null;
}

/** Conversão única de dinheiro: sobre o texto exato que o banco mandou. */
function dinheiro(valor: string | number | null | undefined): number {
  return Number(valor ?? 0);
}

/**
 * Monta o espelho do pagamento. Pura, testável sem banco.
 *
 * Achata o lançamento pai para o topo: a página imprime parcela e lançamento em
 * um bloco só, e navegar dois níveis de objeto dentro do JSX daria linha
 * ilegível e um `?.` em cada campo.
 */
export function montarEspelhoPagamento(
  linha: LinhaEspelhoPagamento,
): EspelhoPagamento {
  const pai = linha.lancamentos;
  return {
    id: linha.id,
    titulo: `${pai?.numero ?? "sem número"} parcela ${linha.numero_parcela}`,
    numeroParcela: linha.numero_parcela,
    dataVencimento: linha.data_vencimento,
    valor: dinheiro(linha.valor),
    desconto: dinheiro(linha.desconto),
    juros: dinheiro(linha.juros),
    valorLiquido: dinheiro(linha.valor_liquido),
    status: linha.status,
    dataPagamento: linha.data_pagamento,
    contaNome: linha.contas_bancarias?.nome ?? null,
    lancamentoId: pai?.id ?? null,
    lancamentoNumero: pai?.numero ?? null,
    lancamentoDescricao: pai?.descricao ?? null,
    lancamentoValor: dinheiro(pai?.valor),
    lancamentoStatus: pai?.status ?? null,
    lancamentoObservacoes: pai?.observacoes ?? null,
    mesCompetencia: pai?.mes_competencia ?? null,
    fornecedorNome: pai?.fornecedores?.razao_social ?? null,
    categoriaNome: pai?.categorias_financeiras?.nome ?? null,
    formaPagamentoNome: pai?.formas_pagamento?.nome ?? null,
    rateios: (pai?.lancamento_rateios ?? []).map((rateio) => ({
      centroNome: rateio.centros_custo?.nome ?? "sem centro",
      centroCodigo: rateio.centros_custo?.codigo ?? null,
      valor: dinheiro(rateio.valor),
    })),
  };
}

/**
 * Busca os pagamentos para o espelho, na ordem em que os ids vieram.
 *
 * Parte de `lancamento_parcelas` e SOBE para o pai, porque é a parcela que o
 * usuário marcou na listagem. Em lotes de LOTE_IDS_POSTGREST: `in` vai na query
 * string de um GET. Parcela que a RLS não deixa ver não volta, e quem chama
 * conta a diferença.
 */
export async function buscarPagamentosParaEspelho(
  ids: string[],
): Promise<EspelhoPagamento[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();

  const linhas: LinhaEspelhoPagamento[] = [];
  for (const lote of emLotes(ids, LOTE_IDS_POSTGREST)) {
    const { data, error } = await supabase
      .from("lancamento_parcelas")
      .select(
        `id, numero_parcela, data_vencimento, valor, desconto, juros,
         valor_liquido, status, data_pagamento,
         contas_bancarias(nome),
         lancamentos(id, numero, descricao, valor, status, mes_competencia,
           observacoes,
           fornecedores(razao_social),
           categorias_financeiras(nome),
           formas_pagamento(nome),
           lancamento_rateios(valor, centros_custo(nome, codigo)))`,
      )
      .in("id", lote);

    if (error) {
      throw new Error(
        `Não foi possível carregar o espelho do pagamento: ${error.message}`,
      );
    }
    linhas.push(...((data ?? []) as unknown as LinhaEspelhoPagamento[]));
  }

  const porId = new Map(
    linhas.map((linha) => [linha.id, montarEspelhoPagamento(linha)]),
  );
  return ids
    .map((id) => porId.get(id))
    .filter((espelho): espelho is EspelhoPagamento => espelho !== undefined);
}

/** Rótulo de evento de parcela. `tipo` é texto livre no banco. */
const TITULO_EVENTO: Record<string, string> = {
  aprovacao: "Aprovada",
  desaprovacao: "Desaprovada",
  pagamento: "Paga",
  reprogramacao: "Data reprogramada",
  conferencia: "Conferida",
};

/**
 * Trilha de várias parcelas de uma vez, agrupada por id de parcela.
 *
 * Não existia trilha de parcela no projeto (há de OC, cotação, folha e
 * lançamento). Nasce aqui em versão de N ids porque o espelho imprime vários
 * pagamentos, e uma consulta por parcela seria uma ida ao banco por folha.
 *
 * `tipo` desconhecido cai no próprio texto do banco em vez de sumir: no papel,
 * evento sem rótulo é melhor que evento invisível.
 */
export async function trilhaDeParcelas(
  ids: string[],
): Promise<Record<string, EventoTrilha[]>> {
  if (ids.length === 0) return {};
  const supabase = await createClient();

  const porParcela: Record<string, EventoTrilha[]> = {};
  for (const lote of emLotes(ids, LOTE_IDS_POSTGREST)) {
    const { data, error } = await supabase
      .from("parcela_eventos")
      .select("id, parcela_id, tipo, motivo, data_de, data_para, created_at")
      .in("parcela_id", lote)
      .order("created_at", { ascending: true });

    // Trilha ausente não derruba o espelho: o documento vale sem ela, e um
    // erro aqui não pode impedir de imprimir o comprovante do pagamento.
    if (error || !data) continue;

    for (const evento of data) {
      const reprogramacao =
        evento.data_de && evento.data_para
          ? `de ${evento.data_de} para ${evento.data_para}`
          : null;
      (porParcela[evento.parcela_id] ??= []).push({
        id: evento.id,
        data: evento.created_at,
        titulo: TITULO_EVENTO[evento.tipo] ?? evento.tipo,
        descricao:
          [evento.motivo, reprogramacao].filter(Boolean).join(" — ") ||
          undefined,
        tipo: "edicao",
      });
    }
  }
  return porParcela;
}
```

Conferir os valores reais de `parcela_eventos.tipo` antes de fechar o mapa de rótulos:

```bash
grep -rn "parcela_eventos" supabase/migrations/*.sql | head -10
```

Rótulo que não existir no banco é ruído inofensivo; `tipo` real que faltar no mapa sai como o texto cru, que é o comportamento desejado.

`TipoEventoTrilha` aceita `"edicao"`: o conjunto é `criacao | edicao | aprovacao | rejeicao | desaprovacao | exclusao | restauracao | documento | outro` (`src/components/canonicos/trilha.tsx`, linha 6). `EventoTrilha` sai pelo barril `@/components/canonicos`, que reexporta `./trilha`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/financeiro/pagamentos/espelho.test.ts`
Expected: PASS, 9 testes.

- [ ] **Step 5: Write the route**

`src/app/(espelho)/espelho/pagamentos/page.tsx`:

```tsx
import {
  BotaoImprimir,
  EspelhoCampos,
  EspelhoDinheiro,
  EspelhoImpresso,
  EspelhoSecao,
  EspelhoTabela,
  EspelhoVazio,
} from "@/components/canonicos";
import { formatarData, formatarMesAno } from "@/lib/formatadores";
import { lerIdsDoEspelho, MAX_ESPELHOS } from "@/lib/ids-do-espelho";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import {
  buscarPagamentosParaEspelho,
  trilhaDeParcelas,
} from "@/modules/financeiro/pagamentos/espelho";

export default async function EspelhoPagamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: bruto } = await searchParams;

  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.pagamentos", "ver")) {
    return (
      <EspelhoVazio
        titulo="Sem permissão"
        explicacao="Você não tem permissão para ver pagamentos, então não há espelho para imprimir."
      />
    );
  }

  const { ids, invalidos, excedeu } = lerIdsDoEspelho(bruto);

  if (excedeu) {
    return (
      <EspelhoVazio
        titulo="Seleção grande demais"
        explicacao={`Marque no máximo ${MAX_ESPELHOS} pagamentos por impressão. Imprimir só uma parte deixaria o maço parecendo completo sem estar.`}
      />
    );
  }

  if (ids.length === 0) {
    return (
      <EspelhoVazio
        titulo="Nada para imprimir"
        explicacao={
          invalidos > 0
            ? "O link não traz nenhum pagamento válido."
            : "Marque ao menos um pagamento na listagem e clique em Imprimir espelho."
        }
      />
    );
  }

  const pagamentos = await buscarPagamentosParaEspelho(ids);

  if (pagamentos.length === 0) {
    return (
      <EspelhoVazio
        titulo="Nada visível para imprimir"
        explicacao="Nenhum dos pagamentos pedidos está visível para você."
      />
    );
  }

  const trilhas = await trilhaDeParcelas(
    pagamentos.map((pagamento) => pagamento.id),
  );
  const anexosPorParcela = await listarAnexosPorDocumento(
    "pagamento",
    pagamentos.map((pagamento) => pagamento.id),
  );

  const ocultos = ids.length - pagamentos.length;
  const emitidoEm = new Date().toISOString();

  return (
    <>
      <BotaoImprimir />

      {ocultos > 0 || invalidos > 0 ? (
        <p className="nao-imprime mx-auto max-w-[190mm] px-6 pt-2 text-[13px] text-[#B45309]">
          {ocultos > 0
            ? `${ocultos} pagamento(s) pedido(s) não estão visíveis para você e ficaram fora. `
            : ""}
          {invalidos > 0 ? `${invalidos} id(s) do link são inválidos.` : ""}
        </p>
      ) : null}

      {pagamentos.map((pagamento) => (
        <EspelhoImpresso
          key={pagamento.id}
          tipo="Pagamento"
          numero={pagamento.titulo}
          emitidoPor={usuario.nome}
          emitidoEm={emitidoEm}
        >
          <EspelhoSecao rotulo="Pagamento">
            <EspelhoCampos
              campos={[
                {
                  rotulo: "Valor da parcela",
                  valor: <EspelhoDinheiro valor={pagamento.valor} />,
                },
                {
                  rotulo: "Desconto",
                  valor: <EspelhoDinheiro valor={pagamento.desconto} />,
                },
                {
                  rotulo: "Juros e multa",
                  valor: <EspelhoDinheiro valor={pagamento.juros} />,
                },
                {
                  rotulo: "Saiu da conta",
                  valor: <EspelhoDinheiro valor={pagamento.valorLiquido} />,
                },
                { rotulo: "Conta bancária", valor: pagamento.contaNome },
                {
                  rotulo: "Vencimento",
                  valor: formatarData(pagamento.dataVencimento),
                },
                {
                  rotulo: "Pago em",
                  valor: formatarData(pagamento.dataPagamento),
                },
                // Status como TEXTO: no papel a cor pode não sair.
                { rotulo: "Status", valor: pagamento.status },
              ]}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Lançamento de origem">
            <EspelhoCampos
              campos={[
                { rotulo: "Número", valor: pagamento.lancamentoNumero },
                { rotulo: "Fornecedor", valor: pagamento.fornecedorNome },
                { rotulo: "Categoria", valor: pagamento.categoriaNome },
                { rotulo: "Descrição", valor: pagamento.lancamentoDescricao },
                {
                  rotulo: "Forma de pagamento",
                  valor: pagamento.formaPagamentoNome,
                },
                {
                  rotulo: "Valor do lançamento",
                  valor: <EspelhoDinheiro valor={pagamento.lancamentoValor} />,
                },
                {
                  rotulo: "Competência",
                  valor: formatarMesAno(pagamento.mesCompetencia),
                },
                {
                  rotulo: "Status do lançamento",
                  valor: pagamento.lancamentoStatus,
                },
              ]}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Rateio por centro de custo">
            <EspelhoTabela
              colunas={[
                { chave: "centro", rotulo: "Centro de custo" },
                { chave: "valor", rotulo: "Valor", alinharDireita: true },
              ]}
              linhas={pagamento.rateios.map((rateio) => ({
                centro: rateio.centroCodigo
                  ? `${rateio.centroCodigo} — ${rateio.centroNome}`
                  : rateio.centroNome,
                valor: <EspelhoDinheiro valor={rateio.valor} />,
              }))}
              totais={{
                centro: "Total do lançamento",
                valor: <EspelhoDinheiro valor={pagamento.lancamentoValor} />,
              }}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Trilha da parcela">
            <EspelhoTabela
              colunas={[
                { chave: "data", rotulo: "Quando" },
                { chave: "titulo", rotulo: "O que" },
                { chave: "motivo", rotulo: "Motivo" },
              ]}
              linhas={(trilhas[pagamento.id] ?? []).map((evento) => ({
                data: formatarData(
                  typeof evento.data === "string"
                    ? evento.data
                    : evento.data.toISOString(),
                ),
                titulo: evento.titulo,
                motivo: evento.descricao ?? null,
              }))}
            />
          </EspelhoSecao>

          <EspelhoSecao rotulo="Anexos">
            <EspelhoTabela
              colunas={[
                { chave: "nome", rotulo: "Arquivo" },
                { chave: "tamanho", rotulo: "Tamanho", alinharDireita: true },
                { chave: "origem", rotulo: "Origem" },
              ]}
              linhas={(anexosPorParcela[pagamento.id] ?? []).map((anexo) => ({
                nome: anexo.nome,
                tamanho: `${Math.max(1, Math.round(anexo.tamanhoBytes / 1024))} KB`,
                origem: anexo.propagado
                  ? "propagado da cadeia"
                  : "deste pagamento",
              }))}
            />
          </EspelhoSecao>

          {pagamento.lancamentoObservacoes ? (
            <EspelhoSecao rotulo="Observações do lançamento">
              <p className="whitespace-pre-line text-[13px]">
                {pagamento.lancamentoObservacoes}
              </p>
            </EspelhoSecao>
          ) : null}
        </EspelhoImpresso>
      ))}
    </>
  );
}
```

Conferir em `src/modules/_shared/anexos/queries.ts` que `EntidadeAnexo` aceita `"pagamento"` e que o vínculo é gravado com o id da **parcela** (e não do lançamento). Se for pelo lançamento, trocar por `pagamento.lancamentoId` e ajustar o rótulo de origem.

- [ ] **Step 6: Rodar e ver de pé**

Run: `npx tsc --noEmit && npx vitest run src/modules/financeiro/pagamentos`
Expected: PASS.

Abrir `/espelho/pagamentos?ids=<id de uma parcela paga real>` e conferir a olho que `valor - desconto + juros` bate com o "Saiu da conta" impresso.

- [ ] **Step 7: Commit**

```bash
git add src/modules/financeiro/pagamentos/espelho.ts src/modules/financeiro/pagamentos/espelho.test.ts "src/app/(espelho)/espelho/pagamentos/page.tsx"
git commit -m "feat(financeiro): espelho impresso do pagamento, com o lancamento pai"
```

---

### Task 11: Seleção e botões no pagamento

**Files:**
- Modify: `src/modules/financeiro/pagamentos/components/pagamentos-cliente.tsx`
- Modify: `src/modules/financeiro/aprovacao-pagamentos/components/pagamento-detalhe.tsx`

**Interfaces:**
- Consumes: `BarraSelecao`, `BotaoEspelho` de `@/components/canonicos`.

- [ ] **Step 1: Ler a tela de pagamentos**

```bash
grep -n "DataTable\|useState\|aba\|Pagas\|export function" src/modules/financeiro/pagamentos/components/pagamentos-cliente.tsx | head -20
```

A tela tem mais de uma aba. A seleção e o botão entram **só na aba de pagas**: parcela não paga não é pagamento, e imprimir espelho de pagamento que não aconteceu seria papel mentindo.

- [ ] **Step 2: Ligar seleção e barra na aba de pagas**

Os três pedaços, na ordem:

```tsx
const [selecionados, setSelecionados] = React.useState<string[]>([]);
```

```tsx
<BarraSelecao
  quantidade={selecionados.length}
  onLimpar={() => setSelecionados([])}
>
  <BotaoEspelho rota="/espelho/pagamentos" ids={selecionados} />
</BarraSelecao>
```

```tsx
selecao={{
  idDaLinha: (parcela: ParcelaPaga) => parcela.id,
  selecionados,
  onSelecionadosChange: setSelecionados,
}}
```

Ao trocar de aba, limpar a seleção (`setSelecionados([])`): seleção sobrevivendo à troca de aba imprimiria linha que o usuário não está mais vendo, que é a mesma razão pela qual os lançamentos não persistem seleção entre visitas.

- [ ] **Step 3: Botão no detalhe do pagamento**

Em `pagamento-detalhe.tsx`, junto dos botões do cabeçalho:

```tsx
<BotaoEspelho rota="/espelho/pagamentos" ids={[parcela.id]} />
```

Conferir o nome real da variável da parcela no arquivo antes de inserir.

- [ ] **Step 4: Rodar tudo**

Run: `npx vitest run src/modules/financeiro && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/pagamentos/components/pagamentos-cliente.tsx src/modules/financeiro/aprovacao-pagamentos/components/pagamento-detalhe.tsx
git commit -m "feat(financeiro): selecao e botao de espelho na aba de pagamentos pagos"
```

---

### Task 12: Playwright do fluxo crítico, RLS e fechamento

**Files:**
- Create: `e2e/espelho.spec.ts` (confirmar o diretório real com `ls e2e tests playwright 2>/dev/null` e usar o que o projeto já tem)
- Modify: `docs/decisoes.md`

- [ ] **Step 1: Descobrir a convenção de Playwright do projeto**

```bash
ls e2e tests playwright 2>/dev/null; cat playwright.config.ts 2>/dev/null | head -30
```

Anotar onde os specs moram, como a autenticação é feita e qual usuário de teste existe. **Não criar convenção nova**: seguir a que está lá.

- [ ] **Step 2: Write the failing e2e test**

`e2e/espelho.spec.ts`, no padrão de autenticação que o Step 1 revelou:

```ts
import { expect, test } from "@playwright/test";

test("marca dois lançamentos e imprime o espelho dos dois", async ({
  page,
}) => {
  // `window.print` abre diálogo do sistema, que o Playwright não controla:
  // stubar é o que deixa o teste medir a PÁGINA, que é o que importa.
  await page.addInitScript(() => {
    (window as unknown as { __imprimiu: number }).__imprimiu = 0;
    window.print = () => {
      (window as unknown as { __imprimiu: number }).__imprimiu += 1;
    };
  });

  await page.goto("/financeiro/lancamentos");

  const checkboxes = page.getByRole("checkbox", { name: /^Selecionar / });
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();

  await expect(page.getByText("2 selecionados")).toBeVisible();

  const [espelho] = await Promise.all([
    page.context().waitForEvent("page"),
    page.getByRole("button", { name: "Imprimir espelho (2)" }).click(),
  ]);

  await espelho.waitForLoadState();

  // Dois documentos, um por folha.
  await expect(espelho.locator(".espelho-documento")).toHaveCount(2);
  await expect(espelho.getByText("Lançamento").first()).toBeVisible();
  await expect(espelho.getByText("Parcelas").first()).toBeVisible();
  await expect(espelho.getByText("Rateio por centro de custo").first()).toBeVisible();

  // Disparou a impressão uma vez só, e não duas pelo modo estrito do React.
  await expect
    .poll(() =>
      espelho.evaluate(
        () => (window as unknown as { __imprimiu: number }).__imprimiu,
      ),
    )
    .toBe(1);
});

test("link de espelho com id inválido não quebra a página", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto("/espelho/lancamentos?ids=nao-e-id");
  await expect(page.getByText("Nada para imprimir")).toBeVisible();
});

test("acima do limite a página recusa em vez de imprimir parte", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  const muitos = Array.from(
    { length: 51 },
    (_, i) => `550e8400-e29b-41d4-a716-4466554${String(i).padStart(5, "0")}`,
  ).join(",");
  await page.goto(`/espelho/lancamentos?ids=${muitos}`);
  await expect(page.getByText("Seleção grande demais")).toBeVisible();
});
```

- [ ] **Step 3: Rodar o e2e**

Run: `npx playwright test e2e/espelho.spec.ts`
Expected: os três PASS. Se o seletor do checkbox não casar, ler o `aria-label` real em `data-table.tsx` (a coluna de seleção usa `Selecionar ${id}`) e ajustar o teste, não o componente.

- [ ] **Step 4: Provar a RLS, e não supor**

Com um usuário **sem** `financeiro.lancamentos:ver`, abrir `/espelho/lancamentos?ids=<id real>` e confirmar que aparece "Sem permissão" e nenhum dado do lançamento chega ao HTML:

```bash
# Conferir que o texto do lançamento não vaza na resposta
curl -s "<url do preview>/espelho/lancamentos?ids=<id>" | grep -c "REFERENTE" || true
```

Expected: `0`. Se vazar, a checagem está depois da busca: mover para antes.

- [ ] **Step 5: Fechamento completo**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: tudo PASS, sem `any` novo e sem `console.log`.

- [ ] **Step 6: Registrar a decisão**

Acrescentar ao fim de `docs/decisoes.md` uma entrada `## 2026-08-13 — Espelho impresso de documento` cobrindo: por que rota renderizada no servidor e não dialog; por que **sem** a ação `imprimir` (o espelho não mostra nada que o detalhe não mostre, e somar ação ao `ACOES` obrigaria a reconceder todos os perfis); por que `print-color-adjust: exact` é obrigatório e por que nenhum dado depende de cor; e por que a validação dos ids usa `z.guid()` e não `z.uuid()` (a carga do maiscontrole tem id derivado de md5, e `z.uuid()` recusaria justamente o histórico **passando em todo teste escrito com uuid novo**).

- [ ] **Step 7: Commit e push**

```bash
git add -A
git commit -m "test: fluxo critico do espelho no playwright, e a decisao em docs"
git push -u origin worktree-espelho-impresso
```

---

## Notas para quem executa

- **Não inventar nome de coluna.** Três tasks mandam ler o `select` existente antes de escrever o novo. Nome errado de coluna passa no teste (que usa objeto literal) e falha só em runtime, contra o banco.
- **`numeric` chega como string do PostgREST.** A conversão para número acontece em um lugar por módulo (`dinheiro()`), sobre o texto exato do banco. Nunca somar strings, nunca deixar float entrar antes da conversão.
- **Status no papel é texto.** Se aparecer `StatusBadge` dentro de um espelho, está errado: no papel a cor pode não sair, e o usuário pode desligar fundo no diálogo de impressão.
- **Um caminho para 1 e para N.** Se em algum momento surgir um `if (ids.length === 1)` com tratamento próprio, é sinal de que o desenho foi contrariado: os dois caminhos divergem com o tempo.
