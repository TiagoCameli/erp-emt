# Padronização dos formulários — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para tracking.

**Goal:** Um kit de formulário canônico único adotado por 100% dos forms do app, com linha de item em tabela compacta e campos em 2 colunas inteligente, sem tocar em regra de negócio.

**Architecture:** Primeiro nascem as peças canônicas em `src/components/canonicos/` (campo, linha, seção, tabela de itens), com teste próprio. Depois a OC adota a `TabelaItens` (o pedido concreto). Por fim os módulos migram em ondas (Cadastros, Compras/cotação, Financeiro, RH, Admin/Auth), cada onda com build verde antes da próxima. É só UI: nenhuma Server Action, RLS, schema ou cálculo muda.

**Tech Stack:** Next.js 16 (App Router, TS strict), React Hook Form + Zod, Tailwind v4 + shadcn/ui, Vitest + @testing-library/react (jsdom).

## Global Constraints

- **Só UI.** Nada de Server Action, RLS, migration, schema ou regra de negócio. O `src/modules/compras/ordens/calculo.ts` é INTOCÁVEL (a `TabelaItens` só posiciona, não calcula).
- **Portão de pronto por tarefa:** `npm run typecheck`, `npm run lint`, `npm run build` verdes; os 186 testes existentes (`npm test -- --run`) continuam verdes. Sem `any` novo, sem `console.log`.
- **Componentes canônicos primeiro.** Nenhum form volta a escrever `<Label>` + controle na mão; usa `CampoFormulario`.
- **Importe sempre de `@/components/canonicos`.** Peça nova entra no `components/canonicos/index.ts`.
- **Textos pt-BR**, sentence case. Dinheiro com `MoneyText`/`formatarBRL`, `tabular-nums`, à direita.
- **Todo commit termina com o trailer** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Paridade visual e funcional:** nenhum form perde campo, ação ou validação.

---

## Task 1: Mover CampoFormulario/SelectAtivo/classesFormulario para o canônico (com shim)

**Files:**
- Create: `src/components/canonicos/campo-formulario.tsx`
- Create: `src/components/canonicos/campo-formulario.test.tsx`
- Modify: `src/components/canonicos/index.ts`
- Modify: `src/modules/cadastros/_shared/campos.tsx` (vira re-export fino)

**Interfaces:**
- Consumes: `@/components/ui/label`, `@/components/ui/switch`, `@/lib/utils` (`cn`).
- Produces:
  - `CampoFormulario(props: { id: string; rotulo: string; obrigatorio?: boolean; erro?: string; ajuda?: string; children: ReactNode; className?: string }): JSX.Element`
  - `SelectAtivo(props: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean; rotulo?: string; ajuda?: string; className?: string }): JSX.Element`
  - `classesFormulario: string` (`"flex flex-col gap-5"`)

- [ ] **Step 1: Criar `campo-formulario.tsx` com o conteúdo atual, movido**

Copiar o corpo EXATO de `src/modules/cadastros/_shared/campos.tsx` (CampoFormulario, SelectAtivo, classesFormulario) para o novo arquivo. Sem mudança de API. Cabeçalho:

```tsx
"use client";

import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** Espaçamento padrão entre os campos de um formulário. */
export const classesFormulario = "flex flex-col gap-5";

/** Empilha um label, o controle e uma mensagem de erro opcional. */
export function CampoFormulario({
  id, rotulo, obrigatorio, erro, ajuda, children, className,
}: {
  id: string; rotulo: string; obrigatorio?: boolean; erro?: string;
  ajuda?: string; children: ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>
        {rotulo}
        {obrigatorio ? (
          <span className="text-destructive" aria-hidden>*</span>
        ) : null}
      </Label>
      {children}
      {ajuda && !erro ? (
        <p className="text-legenda text-muted-foreground">{ajuda}</p>
      ) : null}
      {erro ? (
        <p className="text-legenda text-destructive" role="alert">{erro}</p>
      ) : null}
    </div>
  );
}

/** Switch "Ativo" pronto para react-hook-form ou controle simples. */
export function SelectAtivo({
  value, onChange, disabled,
  rotulo = "Ativo",
  ajuda = "Registros inativos somem das listas de seleção, mas continuam no histórico.",
  className,
}: {
  value: boolean; onChange: (value: boolean) => void; disabled?: boolean;
  rotulo?: string; ajuda?: string; className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex flex-col gap-1">
        <Label htmlFor="campo-ativo">{rotulo}</Label>
        {ajuda ? (
          <p className="text-legenda text-muted-foreground">{ajuda}</p>
        ) : null}
      </div>
      <Switch
        id="campo-ativo"
        checked={value}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={rotulo}
      />
    </div>
  );
}
```

- [ ] **Step 2: Exportar no index dos canônicos**

Em `src/components/canonicos/index.ts`, adicionar após a linha `export * from "./form-drawer";`:

```ts
export * from "./campo-formulario";
```

- [ ] **Step 3: Transformar o arquivo de módulo em re-export (shim)**

Substituir TODO o conteúdo de `src/modules/cadastros/_shared/campos.tsx` por:

```tsx
// Movido para @/components/canonicos/campo-formulario. Este re-export mantém os
// imports antigos funcionando durante a migração; some na Task 10.
export {
  CampoFormulario,
  SelectAtivo,
  classesFormulario,
} from "@/components/canonicos/campo-formulario";
```

- [ ] **Step 4: Escrever o teste do canônico**

`src/components/canonicos/campo-formulario.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { CampoFormulario } from "@/components/canonicos";

afterEach(cleanup);

describe("CampoFormulario", () => {
  it("mostra o rótulo e associa ao controle pelo id", () => {
    render(
      <CampoFormulario id="nome" rotulo="Nome">
        <input id="nome" />
      </CampoFormulario>,
    );
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
  });

  it("marca obrigatório com asterisco", () => {
    render(
      <CampoFormulario id="nome" rotulo="Nome" obrigatorio>
        <input id="nome" />
      </CampoFormulario>,
    );
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("exibe erro e esconde a ajuda quando há erro", () => {
    render(
      <CampoFormulario id="nome" rotulo="Nome" ajuda="dica" erro="obrigatório">
        <input id="nome" />
      </CampoFormulario>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("obrigatório");
    expect(screen.queryByText("dica")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Rodar teste + portão de pronto**

Run: `npm test -- --run src/components/canonicos/campo-formulario.test.tsx`
Expected: PASS (3 testes).
Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/canonicos/campo-formulario.tsx src/components/canonicos/campo-formulario.test.tsx src/components/canonicos/index.ts src/modules/cadastros/_shared/campos.tsx
git commit -m "refactor(ui): move CampoFormulario/SelectAtivo para o canônico com shim"
```

---

## Task 2: `LinhaCampos` (2 colunas inteligente)

**Files:**
- Create: `src/components/canonicos/linha-campos.tsx`
- Create: `src/components/canonicos/linha-campos.test.tsx`
- Modify: `src/components/canonicos/index.ts`

**Interfaces:**
- Consumes: `@/lib/utils` (`cn`).
- Produces: `LinhaCampos(props: { colunas?: 2 | 3; children: ReactNode; className?: string }): JSX.Element` — grid `grid-cols-1` no mobile, `sm:grid-cols-2` ou `sm:grid-cols-3`, `gap-4`.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

`src/components/canonicos/linha-campos.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { LinhaCampos } from "@/components/canonicos";

afterEach(cleanup);

describe("LinhaCampos", () => {
  it("usa 2 colunas por padrão no desktop", () => {
    const { container } = render(
      <LinhaCampos><span>a</span><span>b</span></LinhaCampos>,
    );
    expect(container.firstChild).toHaveClass("sm:grid-cols-2");
  });

  it("aceita 3 colunas", () => {
    const { container } = render(
      <LinhaCampos colunas={3}><span>a</span></LinhaCampos>,
    );
    expect(container.firstChild).toHaveClass("sm:grid-cols-3");
  });

  it("empilha no mobile", () => {
    const { container } = render(<LinhaCampos><span>a</span></LinhaCampos>);
    expect(container.firstChild).toHaveClass("grid-cols-1");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- --run src/components/canonicos/linha-campos.test.tsx`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

`src/components/canonicos/linha-campos.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Coloca campos lado a lado num grid responsivo: 1 coluna no celular, 2 (ou 3)
 * no desktop. Campos longos ficam FORA dela (largura total do form); campos
 * curtos que andam juntos entram dentro.
 */
export function LinhaCampos({
  colunas = 2,
  children,
  className,
}: {
  colunas?: 2 | 3;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4",
        colunas === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Exportar no index**

Em `src/components/canonicos/index.ts`, adicionar:

```ts
export * from "./linha-campos";
```

- [ ] **Step 5: Rodar teste + portão**

Run: `npm test -- --run src/components/canonicos/linha-campos.test.tsx`
Expected: PASS (3 testes).
Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/canonicos/linha-campos.tsx src/components/canonicos/linha-campos.test.tsx src/components/canonicos/index.ts
git commit -m "feat(ui): LinhaCampos canônico (2 colunas inteligente)"
```

---

## Task 3: `SecaoFormulario` (título + ação, com a Faixa âmbar)

**Files:**
- Create: `src/components/canonicos/secao-formulario.tsx`
- Create: `src/components/canonicos/secao-formulario.test.tsx`
- Modify: `src/components/canonicos/index.ts`

**Interfaces:**
- Consumes: `@/lib/utils` (`cn`).
- Produces: `SecaoFormulario(props: { titulo: string; acao?: ReactNode; children: ReactNode; className?: string }): JSX.Element` — bloco com título (com barra âmbar de 3px à esquerda) e ação à direita.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

`src/components/canonicos/secao-formulario.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SecaoFormulario } from "@/components/canonicos";

afterEach(cleanup);

describe("SecaoFormulario", () => {
  it("mostra o título e o conteúdo", () => {
    render(
      <SecaoFormulario titulo="Itens">
        <p>conteúdo</p>
      </SecaoFormulario>,
    );
    expect(screen.getByRole("heading", { name: "Itens" })).toBeInTheDocument();
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
  });

  it("renderiza a ação quando passada", () => {
    render(
      <SecaoFormulario titulo="Itens" acao={<button>Adicionar</button>}>
        <p>x</p>
      </SecaoFormulario>,
    );
    expect(screen.getByRole("button", { name: "Adicionar" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- --run src/components/canonicos/secao-formulario.test.tsx`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

`src/components/canonicos/secao-formulario.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Agrupa um bloco do formulário com título e ação opcional à direita. O título
 * leva a Faixa âmbar de 3px à esquerda (assinatura do design system EMT).
 */
export function SecaoFormulario({
  titulo,
  acao,
  children,
  className,
}: {
  titulo: string;
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="border-l-[3px] border-primary pl-2 text-detalhe font-semibold">
          {titulo}
        </h3>
        {acao}
      </div>
      {children}
    </section>
  );
}
```

- [ ] **Step 4: Exportar no index**

Em `src/components/canonicos/index.ts`, adicionar:

```ts
export * from "./secao-formulario";
```

- [ ] **Step 5: Rodar teste + portão**

Run: `npm test -- --run src/components/canonicos/secao-formulario.test.tsx`
Expected: PASS (2 testes).
Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/canonicos/secao-formulario.tsx src/components/canonicos/secao-formulario.test.tsx src/components/canonicos/index.ts
git commit -m "feat(ui): SecaoFormulario canônico (título + ação, Faixa âmbar)"
```

---

## Task 4: `TabelaItens` (linha de item em tabela compacta)

**Files:**
- Create: `src/components/canonicos/tabela-itens.tsx`
- Create: `src/components/canonicos/tabela-itens.test.tsx`
- Modify: `src/components/canonicos/index.ts`

**Interfaces:**
- Consumes: `@/components/ui/button`, `@/components/ui/label`, `@/lib/utils` (`cn`), `lucide-react` (`Trash2`).
- Produces:
  - `interface ColunaItem { chave: string; rotulo: string; largura: string; alinhamento?: "left" | "right"; obrigatorio?: boolean }`
  - `TabelaItens<L>(props: TabelaItensProps<L>): JSX.Element`, onde:
    - `colunas: ColunaItem[]`
    - `linhas: L[]` (ex.: `fields` do `useFieldArray`)
    - `chaveLinha: (linha: L, indice: number) => string`
    - `renderCelula: (chave: string, indice: number) => ReactNode`
    - `erroCelula?: (chave: string, indice: number) => string | undefined`
    - `onRemover: (indice: number) => void`
    - `podeRemover?: (indice: number) => boolean`
    - `rotuloRemover?: string` (default `"Remover"`)
    - `rodape?: ReactNode`
    - `className?: string`

- [ ] **Step 1: Escrever o teste (falha primeiro)**

`src/components/canonicos/tabela-itens.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { TabelaItens, type ColunaItem } from "@/components/canonicos";

afterEach(cleanup);

const COLUNAS: ColunaItem[] = [
  { chave: "insumo", rotulo: "Insumo", largura: "1fr" },
  { chave: "qtd", rotulo: "Qtd", largura: "120px", alinhamento: "right" },
];

describe("TabelaItens", () => {
  it("mostra o cabeçalho de coluna uma vez só", () => {
    render(
      <TabelaItens
        colunas={COLUNAS}
        linhas={[{ id: "a" }, { id: "b" }]}
        chaveLinha={(l) => (l as { id: string }).id}
        renderCelula={(chave, i) => <span>{`${chave}-${i}`}</span>}
        onRemover={() => {}}
      />,
    );
    // "Insumo" aparece 1x no header desktop + 1x por linha no rótulo mobile.
    // O header desktop é o primeiro; conferimos que existe exatamente 1 header.
    expect(screen.getAllByTestId("tabela-itens-header")).toHaveLength(1);
  });

  it("renderiza uma linha por item", () => {
    render(
      <TabelaItens
        colunas={COLUNAS}
        linhas={[{ id: "a" }, { id: "b" }, { id: "c" }]}
        chaveLinha={(l) => (l as { id: string }).id}
        renderCelula={(chave) => <span>{chave}</span>}
        onRemover={() => {}}
      />,
    );
    expect(screen.getAllByTestId("tabela-itens-linha")).toHaveLength(3);
  });

  it("chama onRemover com o índice da linha", () => {
    const onRemover = vi.fn();
    render(
      <TabelaItens
        colunas={COLUNAS}
        linhas={[{ id: "a" }, { id: "b" }]}
        chaveLinha={(l) => (l as { id: string }).id}
        renderCelula={(chave) => <span>{chave}</span>}
        onRemover={onRemover}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Remover" })[1]);
    expect(onRemover).toHaveBeenCalledWith(1);
  });

  it("mostra erro por célula", () => {
    render(
      <TabelaItens
        colunas={COLUNAS}
        linhas={[{ id: "a" }]}
        chaveLinha={(l) => (l as { id: string }).id}
        renderCelula={(chave) => <span>{chave}</span>}
        erroCelula={(chave) => (chave === "qtd" ? "obrigatório" : undefined)}
        onRemover={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("obrigatório");
  });

  it("desabilita remover quando podeRemover é falso", () => {
    render(
      <TabelaItens
        colunas={COLUNAS}
        linhas={[{ id: "a" }]}
        chaveLinha={(l) => (l as { id: string }).id}
        renderCelula={(chave) => <span>{chave}</span>}
        podeRemover={() => false}
        onRemover={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Remover" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- --run src/components/canonicos/tabela-itens.test.tsx`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

`src/components/canonicos/tabela-itens.tsx`:

```tsx
"use client";

import type { CSSProperties, ReactNode } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Uma coluna da tabela de itens. `largura` é um trilho de grid CSS. */
export interface ColunaItem {
  chave: string;
  rotulo: string;
  /** Trilho de grid no desktop, ex.: "1fr", "120px", "140px". */
  largura: string;
  alinhamento?: "left" | "right";
  obrigatorio?: boolean;
}

export interface TabelaItensProps<L> {
  colunas: ColunaItem[];
  linhas: L[];
  chaveLinha: (linha: L, indice: number) => string;
  renderCelula: (chave: string, indice: number) => ReactNode;
  erroCelula?: (chave: string, indice: number) => string | undefined;
  onRemover: (indice: number) => void;
  podeRemover?: (indice: number) => boolean;
  rotuloRemover?: string;
  rodape?: ReactNode;
  className?: string;
}

/**
 * Tabela compacta de itens que repetem (ex.: insumos de uma OC). O rótulo de
 * cada coluna aparece 1x como cabeçalho no desktop; no celular cada linha vira
 * um card empilhado com rótulo por campo. Genérica: não conhece react-hook-form,
 * recebe as linhas e um renderCelula. Cálculo (subtotal/total) fica fora dela.
 */
export function TabelaItens<L>({
  colunas,
  linhas,
  chaveLinha,
  renderCelula,
  erroCelula,
  onRemover,
  podeRemover,
  rotuloRemover = "Remover",
  rodape,
  className,
}: TabelaItensProps<L>) {
  // trilhos das colunas + coluna auto pra lixeira
  const template = `${colunas.map((c) => c.largura).join(" ")} auto`;
  const estiloGrid = { "--cols-itens": template } as CSSProperties;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Cabeçalho: só no desktop, 1x */}
      <div
        data-testid="tabela-itens-header"
        style={estiloGrid}
        className="hidden gap-3 px-3 sm:grid sm:grid-cols-[var(--cols-itens)]"
      >
        {colunas.map((coluna) => (
          <span
            key={coluna.chave}
            className={cn(
              "text-legenda font-medium text-muted-foreground",
              coluna.alinhamento === "right" && "text-right",
            )}
          >
            {coluna.rotulo}
            {coluna.obrigatorio ? (
              <span className="text-destructive" aria-hidden>
                {" "}*
              </span>
            ) : null}
          </span>
        ))}
        <span aria-hidden />
      </div>

      {linhas.map((linha, indice) => {
        const removivel = podeRemover ? podeRemover(indice) : true;
        return (
          <div
            key={chaveLinha(linha, indice)}
            data-testid="tabela-itens-linha"
            style={estiloGrid}
            className="grid grid-cols-1 gap-2 rounded-md bg-card px-3 py-2 sm:grid-cols-[var(--cols-itens)] sm:items-start sm:gap-3"
          >
            {colunas.map((coluna) => {
              const erro = erroCelula?.(coluna.chave, indice);
              return (
                <div key={coluna.chave} className="flex flex-col gap-1">
                  {/* rótulo só no mobile (no desktop está no cabeçalho) */}
                  <Label className="text-legenda text-muted-foreground sm:hidden">
                    {coluna.rotulo}
                  </Label>
                  <div
                    className={cn(
                      coluna.alinhamento === "right" && "sm:text-right",
                    )}
                  >
                    {renderCelula(coluna.chave, indice)}
                  </div>
                  {erro ? (
                    <p className="text-legenda text-destructive" role="alert">
                      {erro}
                    </p>
                  ) : null}
                </div>
              );
            })}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="justify-self-end"
              aria-label={rotuloRemover}
              disabled={!removivel}
              onClick={() => onRemover(indice)}
            >
              <Trash2 />
            </Button>
          </div>
        );
      })}

      {rodape ? <div>{rodape}</div> : null}
    </div>
  );
}
```

- [ ] **Step 4: Exportar no index**

Em `src/components/canonicos/index.ts`, adicionar:

```ts
export * from "./tabela-itens";
```

- [ ] **Step 5: Rodar teste + portão**

Run: `npm test -- --run src/components/canonicos/tabela-itens.test.tsx`
Expected: PASS (5 testes).
Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/canonicos/tabela-itens.tsx src/components/canonicos/tabela-itens.test.tsx src/components/canonicos/index.ts
git commit -m "feat(ui): TabelaItens canônico (linha de item em tabela compacta)"
```

---

## Task 5: OC adota TabelaItens + SecaoFormulario + LinhaCampos (o pedido concreto)

**Files:**
- Modify: `src/modules/compras/ordens/components/ordem-form-drawer.tsx`

**Interfaces:**
- Consumes: `TabelaItens`, `ColunaItem`, `SecaoFormulario`, `LinhaCampos`, `CampoFormulario` (Task 1-4); `subtotalItem`, `totalOrdemCompra`, `paraNumero` (INTOCADOS em `calculo.ts`).
- Produces: nada novo (mesmo componente, layout novo).

- [ ] **Step 1: Trocar o par condição/data por LinhaCampos**

Em `ordem-form-drawer.tsx`, importar do canônico e trocar o `<div className="grid grid-cols-2 gap-4">` que envolve "Condição de pagamento" e "Data de emissão" por `<LinhaCampos>...</LinhaCampos>` (mesmos dois `CampoFormulario` dentro). Ajustar o import:

```tsx
import {
  CampoFormulario,
  Combobox,
  ComboboxCriavel,
  FormDrawer,
  LinhaCampos,
  SecaoFormulario,
  TabelaItens,
  type ColunaItem,
} from "@/components/canonicos";
```

Remover o import antigo `import { CampoFormulario, classesFormulario } from "@/modules/cadastros/_shared/campos";` e passar a importar `classesFormulario` também do canônico (adicionar na lista acima).

- [ ] **Step 2: Trocar o cabeçalho "Itens" por SecaoFormulario**

Substituir o bloco:

```tsx
<div className="flex flex-col gap-3">
  <div className="flex items-center justify-between">
    <h3 className="text-detalhe font-semibold">Itens</h3>
    <Button type="button" variant="outline" size="sm" ...>
      <Plus /> Adicionar centro de custo
    </Button>
  </div>
  {erroCentrosMensagem ? (...) : null}
  <div className="flex flex-col gap-3">{grupos.map(...)}</div>
</div>
```

por:

```tsx
<SecaoFormulario
  titulo="Itens"
  acao={
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={salvando || !podeAdicionarGrupo}
      onClick={() => adicionarGrupo(grupoVazio())}
    >
      <Plus />
      Adicionar centro de custo
    </Button>
  }
>
  {erroCentrosMensagem ? (
    <p className="text-legenda text-destructive" role="alert">
      {erroCentrosMensagem}
    </p>
  ) : null}
  <div className="flex flex-col gap-3">
    {grupos.map((grupo, indice) => {
      /* ...mesmo corpo do map atual... */
    })}
  </div>
</SecaoFormulario>
```

- [ ] **Step 3: Substituir as linhas de insumo por TabelaItens no `GrupoCentroCusto`**

No componente `GrupoCentroCusto`, trocar o bloco que hoje faz `linhas.map(...)` (o `<div className="flex flex-col gap-2 border-t ...">` com insumo/qtd/preço/subtotal empilhados) por uma `TabelaItens`. As colunas:

```tsx
const COLUNAS_ITEM: ColunaItem[] = [
  { chave: "insumo", rotulo: "Insumo", largura: "minmax(0,1fr)", obrigatorio: true },
  { chave: "quantidade", rotulo: "Qtd", largura: "120px", alinhamento: "right", obrigatorio: true },
  { chave: "precoUnitario", rotulo: "Preço un.", largura: "140px", alinhamento: "right", obrigatorio: true },
  { chave: "subtotal", rotulo: "Subtotal", largura: "140px", alinhamento: "right" },
];
```

Renderização (dentro de `GrupoCentroCusto`, substituindo o `<div className="flex flex-col gap-2 border-t border-border pt-3">...</div>`):

```tsx
<div className="border-t border-border pt-3">
  <TabelaItens
    colunas={COLUNAS_ITEM}
    linhas={linhas}
    chaveLinha={(linha) => linha.id}
    onRemover={(j) => removerInsumo(j)}
    podeRemover={() => linhas.length > 1}
    rotuloRemover="Remover insumo"
    erroCelula={(chave, j) => {
      const e = errosGrupo?.insumos?.[j];
      if (chave === "insumo") return e?.insumoId?.message;
      if (chave === "quantidade") return e?.quantidade?.message;
      if (chave === "precoUnitario") return e?.precoUnitario?.message;
      return undefined;
    }}
    renderCelula={(chave, j) => {
      if (chave === "insumo") {
        const insumoDestaLinha = insumosObservados?.[j]?.insumoId ?? "";
        const usadosPorOutrasLinhas = new Set(
          (insumosObservados ?? [])
            .filter((_, k) => k !== j)
            .map((insumo) => insumo.insumoId)
            .filter(Boolean),
        );
        const insumosDisponiveis = insumos.filter(
          (ins) => ins.id === insumoDestaLinha || !usadosPorOutrasLinhas.has(ins.id),
        );
        return (
          <Combobox
            valor={form.watch(`centrosCusto.${indice}.insumos.${j}.insumoId`)}
            onValorChange={(valor) =>
              form.setValue(`centrosCusto.${indice}.insumos.${j}.insumoId`, valor, {
                shouldValidate: true,
              })
            }
            opcoes={insumosDisponiveis.map((insumo) => ({
              valor: insumo.id,
              rotulo: `${insumo.nome}${insumo.unidade ? ` (${insumo.unidade})` : ""}`,
            }))}
            placeholder="Selecione o insumo"
            disabled={salvando}
            ariaLabel="Insumo"
            id={`oc-insumo-${indice}-${j}`}
          />
        );
      }
      if (chave === "quantidade") {
        return (
          <Input
            aria-label="Quantidade"
            inputMode="decimal"
            placeholder="0,000"
            className="tabular-nums text-right"
            disabled={salvando}
            {...form.register(`centrosCusto.${indice}.insumos.${j}.quantidade`)}
          />
        );
      }
      if (chave === "precoUnitario") {
        return (
          <Input
            aria-label="Preço unitário"
            inputMode="decimal"
            placeholder="0,00"
            className="tabular-nums text-right"
            disabled={salvando}
            {...form.register(`centrosCusto.${indice}.insumos.${j}.precoUnitario`)}
          />
        );
      }
      // subtotal (display)
      return (
        <span className="text-detalhe font-medium tabular-nums">
          {formatarBRL(
            subtotalItem(
              paraNumero(form.watch(`centrosCusto.${indice}.insumos.${j}.quantidade`) ?? ""),
              paraNumero(form.watch(`centrosCusto.${indice}.insumos.${j}.precoUnitario`) ?? ""),
            ),
          )}
        </span>
      );
    }}
    rodape={
      <div className="flex items-center justify-between gap-3 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={salvando || !podeAdicionarInsumo}
          onClick={() => adicionarInsumo(insumoVazio())}
        >
          <Plus />
          Adicionar insumo
        </Button>
        <div className="text-detalhe text-muted-foreground">
          Subtotal do centro{" "}
          <span className="font-medium text-foreground tabular-nums">
            {formatarBRL(subtotalGrupo)}
          </span>
        </div>
      </div>
    }
  />
  {typeof errosGrupo?.insumos?.root?.message === "string" ? (
    <p className="mt-2 text-legenda text-destructive" role="alert">
      {errosGrupo.insumos.root.message}
    </p>
  ) : null}
</div>
```

Observação: o antigo `CampoFormulario` de cada insumo/qtd/preço sai; o rótulo passa a vir do cabeçalho da `TabelaItens` (desktop) e do rótulo mobile interno. Mantidos `ariaLabel`/`aria-label` para acessibilidade e para os testes por rótulo. O `import { Trash2 }` pode sair do arquivo se não for mais usado fora da `TabelaItens` (conferir: o botão de remover o CENTRO de custo ainda usa `Trash2` — manter o import).

- [ ] **Step 4: Portão de pronto**

Run: `npm run typecheck && npm run lint && npm test -- --run src/modules/compras/ordens`
Expected: sem erros; os testes de `form-mapeamento`/`calculo` continuam verdes (não foram tocados).
Run: `npm run build`
Expected: build verde.

- [ ] **Step 5: Conferência visual local (opcional mas recomendado)**

Run: `npm run dev` e abrir `/compras/ordens` > Nova ordem. Verificar: Insumo, Qtd, Preço un. e Subtotal na MESMA linha, cabeçalho de coluna 1x, subtotal por linha e total da prévia batendo. Encolher a janela: a linha empilha com rótulos.

- [ ] **Step 6: Commit**

```bash
git add src/modules/compras/ordens/components/ordem-form-drawer.tsx
git commit -m "feat(compras): itens da OC em tabela compacta (insumo, qtd, preço e subtotal na mesma linha)"
```

---

## Task 6: Cotação adota o kit (campos + itens quando casar)

**Files:**
- Modify: `src/modules/compras/cotacoes/components/nova-cotacao-drawer.tsx`
- Modify: `src/modules/compras/cotacoes/components/fornecedor-cotacao-drawer.tsx`

**Interfaces:**
- Consumes: kit canônico (Task 1-4).
- Produces: nada novo.

- [ ] **Step 1: Ler os dois drawers e mapear**

Run: `sed -n '1,400p' src/modules/compras/cotacoes/components/nova-cotacao-drawer.tsx` e o mesmo para `fornecedor-cotacao-drawer.tsx`. Identificar: (a) campos curtos que andam juntos → `LinhaCampos`; (b) cabeçalhos de seção → `SecaoFormulario`; (c) se há lista de itens que repetem com colunas equivalentes a insumo/qtd/preço.

- [ ] **Step 2: Aplicar o kit de campos**

Trocar `<Label>`+controle na mão por `CampoFormulario`; agrupar campos curtos em `LinhaCampos`; cabeçalho de seção em `SecaoFormulario`. Import via `@/components/canonicos`.

- [ ] **Step 3: Itens (regra da ressalva do spec)**

Se a cotação tiver lista de itens com colunas que casam (item/valor por fornecedor), adotar `TabelaItens` no mesmo padrão da Task 5. Se o layout de itens da cotação for diferente demais (ex.: matriz comparativa por fornecedor), NÃO forçar: manter o layout de itens atual e aplicar só o kit de campos. Registrar num comentário no topo do componente qual caminho foi seguido e por quê.

- [ ] **Step 4: Portão de pronto**

Run: `npm run typecheck && npm run lint && npm test -- --run src/modules/compras && npm run build`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add src/modules/compras/cotacoes/components/nova-cotacao-drawer.tsx src/modules/compras/cotacoes/components/fornecedor-cotacao-drawer.tsx
git commit -m "feat(compras): cotação adota o kit de formulário canônico"
```

---

## Task 7: Migrar os forms de Cadastros

**Files (migrar cada um para o kit):**
- `src/modules/cadastros/obras/components/obras-form-drawer.tsx`
- `src/modules/cadastros/clientes/components/clientes-form-drawer.tsx`
- `src/modules/cadastros/fornecedores/components/fornecedores-form-drawer.tsx`
- `src/modules/cadastros/colaboradores/components/colaboradores-form-drawer.tsx`
- `src/modules/cadastros/equipamentos/components/equipamentos-form-drawer.tsx`
- `src/modules/cadastros/insumos/components/insumos-form-drawer.tsx`
- `src/modules/cadastros/unidades/components/unidades-form-drawer.tsx`
- `src/modules/cadastros/categorias/components/categorias-form-drawer.tsx`
- `src/modules/cadastros/centros-custo/components/no-form-drawer.tsx`

**Receita de migração (mesma para todo form desta e das próximas tarefas):**

1. Ler o arquivo inteiro antes de editar.
2. Importar do canônico: `import { CampoFormulario, LinhaCampos, SelectAtivo, classesFormulario } from "@/components/canonicos";` (só o que usar).
3. O `<form>` usa `className={classesFormulario}` (stack gap-5).
4. Cada `<div><Label htmlFor=.../>{controle}{erro}</div>` na mão vira `<CampoFormulario id rotulo obrigatorio erro ajuda>{controle}</CampoFormulario>`.
5. Campos curtos que hoje já estão em `grid grid-cols-2`/`grid-cols-3` (ou que fazem sentido lado a lado, ex.: cidade/UF, agência/conta, salário/diária, datas) entram em `<LinhaCampos>` (ou `colunas={3}`). Campo longo (nome, descrição, endereço, observações, combobox) fica fora, largura total.
6. Switch "Ativo" usa `SelectAtivo`.
7. Cabeçalho de subseção (se houver) usa `SecaoFormulario`.
8. Manter EXATAMENTE os mesmos campos, `register`, `name`, validações, erros e ações. É layout, não comportamento.

- [ ] **Step 1: Migrar os 9 forms de Cadastros seguindo a receita**

Aplicar a receita arquivo por arquivo. Nenhum passa a exibir campo a menos ou a mais.

- [ ] **Step 2: Portão de pronto**

Run: `npm run typecheck && npm run lint && npm test -- --run src/modules/cadastros && npm run build`
Expected: tudo verde.

- [ ] **Step 3: Gate anti-regressão (sem label cru nos forms de Cadastros)**

Run:
```bash
grep -rn "@/components/ui/label" src/modules/cadastros --include="*form*.tsx"
```
Expected: nenhuma linha (todo rótulo vem de `CampoFormulario`/`SelectAtivo`). Exceção só se um form tiver um controle sem par no kit (justificar em comentário).

- [ ] **Step 4: Commit**

```bash
git add src/modules/cadastros
git commit -m "refactor(cadastros): forms adotam o kit canônico (CampoFormulario/LinhaCampos)"
```

---

## Task 8: Migrar os forms de Financeiro

**Files:**
- `src/modules/financeiro/categorias/components/categorias-form-drawer.tsx`
- `src/modules/financeiro/contas-bancarias/components/contas-form-drawer.tsx`
- `src/modules/financeiro/contas-receber/components/receber-form-drawer.tsx`
- `src/modules/financeiro/contas-receber/components/baixa-recebimento-dialog.tsx`
- `src/modules/financeiro/lancamentos/components/lancamento-form-drawer.tsx`
- `src/modules/financeiro/pagamentos/components/pagar-parcela-drawer.tsx`

- [ ] **Step 1: Migrar seguindo a receita da Task 7**

Atenção ao `lancamento-form-drawer.tsx` (parcelas e rateios): se tiver lista que repete com colunas homogêneas (parcela: vencimento/valor; rateio: centro de custo/valor), usar `TabelaItens` no padrão da Task 5. Senão, `LinhaCampos`. Valores em `MoneyText`/`tabular-nums`.

- [ ] **Step 2: Portão de pronto**

Run: `npm run typecheck && npm run lint && npm test -- --run src/modules/financeiro && npm run build`
Expected: tudo verde.

- [ ] **Step 3: Gate anti-regressão**

Run: `grep -rn "@/components/ui/label" src/modules/financeiro --include="*form*.tsx" --include="*dialog*.tsx"`
Expected: nenhuma linha (salvo exceção justificada).

- [ ] **Step 4: Commit**

```bash
git add src/modules/financeiro
git commit -m "refactor(financeiro): forms adotam o kit canônico"
```

---

## Task 9: Migrar os forms de RH

**Files:**
- `src/modules/rh/adiantamentos/components/adiantamento-form-drawer.tsx`
- `src/modules/rh/apontamentos/components/apontamento-form-drawer.tsx`
- `src/modules/rh/apontamentos/components/criar-ponto-form-drawer.tsx`
- `src/modules/rh/banco-horas/components/movimento-form-drawer.tsx`
- `src/modules/rh/diaristas/components/diaria-form-drawer.tsx`
- `src/modules/rh/documentos/components/documento-form-drawer.tsx`
- `src/modules/rh/epis/components/epi-form-drawer.tsx`
- `src/modules/rh/ferias/components/ferias-form-drawer.tsx`
- `src/modules/rh/ocorrencias/components/ocorrencia-form-drawer.tsx`
- `src/modules/rh/folha/components/gerar-folha-form-drawer.tsx`

- [ ] **Step 1: Migrar seguindo a receita da Task 7**

Datas e valores curtos (competência, admissão, salário, valor da diária) em `LinhaCampos`. Campo longo (colaborador combobox, motivo/observação) largura total.

- [ ] **Step 2: Portão de pronto**

Run: `npm run typecheck && npm run lint && npm test -- --run src/modules/rh && npm run build`
Expected: tudo verde.

- [ ] **Step 3: Gate anti-regressão**

Run: `grep -rn "@/components/ui/label" src/modules/rh --include="*form*.tsx"`
Expected: nenhuma linha (salvo exceção justificada).

- [ ] **Step 4: Commit**

```bash
git add src/modules/rh
git commit -m "refactor(rh): forms adotam o kit canônico"
```

---

## Task 10: Administração, Auth, remoção do shim e varredura final

**Files:**
- `src/modules/administracao/configuracoes/components/configuracoes-form.tsx`
- `src/modules/auth/components/login-form.tsx`
- `src/modules/auth/components/definir-senha-form.tsx`
- Delete: `src/modules/cadastros/_shared/campos.tsx` (o shim)
- Modify: qualquer arquivo que ainda importe de `@/modules/cadastros/_shared/campos`

- [ ] **Step 1: Migrar config e auth pela receita da Task 7**

Login e definir-senha adotam `CampoFormulario` para os campos (email/senha), mantendo o layout centralizado da tela de auth (não usam `FormDrawer`).

- [ ] **Step 2: Trocar todos os imports do shim para o canônico**

Run:
```bash
grep -rln "modules/cadastros/_shared/campos" src
```
Em cada arquivo listado, trocar o import por `@/components/canonicos`. Depois confirmar:
```bash
grep -rn "modules/cadastros/_shared/campos" src
```
Expected: nenhuma linha.

- [ ] **Step 3: Remover o shim**

```bash
git rm src/modules/cadastros/_shared/campos.tsx
```
Se a pasta `_shared` ficar vazia, removê-la também.

- [ ] **Step 4: Varredura final anti-regressão (app inteiro)**

Run:
```bash
grep -rn "@/components/ui/label" src/modules --include="*form*.tsx" --include="*drawer*.tsx" --include="*dialog*.tsx"
```
Expected: nenhuma linha, ou só exceções com comentário justificando. Conferir também que não sobrou `grid grid-cols-2` cru de campos que deveria ser `LinhaCampos`:
```bash
grep -rn "grid-cols-2\|grid-cols-3" src/modules --include="*form*.tsx" --include="*drawer*.tsx"
```
Expected: só dentro de casos legítimos (ou zero). Migrar o que sobrou.

- [ ] **Step 5: Portão de pronto FINAL (app inteiro)**

Run: `npm run typecheck && npm run lint && npm test -- --run && npm run build`
Expected: typecheck/lint/build verdes; TODOS os testes verdes (186 antigos + os novos do kit).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(ui): migra config/auth, remove shim de campos e varredura final do padrão"
```

---

## Task 11: Preview na Vercel e validação do Tiago

- [ ] **Step 1: Push da branch e abrir preview**

```bash
git push -u origin feat-padronizacao-forms
```
Pegar a URL de preview da Vercel (deploy automático da branch).

- [ ] **Step 2: Roteiro de conferência (o Tiago valida)**

Abrir no preview: OC (itens em linha), 1 cadastro simples (ex.: fornecedor), 1 financeiro (lançamento), 1 RH (diária). Conferir: campos alinhados em 2 colunas onde faz sentido, nada quebrado no mobile, todos os campos e validações presentes.

- [ ] **Step 3: Merge após o OK do Tiago**

```bash
git checkout main
git merge --no-ff feat-padronizacao-forms -m "Merge feat-padronizacao-forms: padronização dos formulários (kit canônico + tabela de itens)"
git push origin main
```
(Só depois do Tiago aprovar o preview.)

---

## Self-review (feito ao escrever)

- **Cobertura do spec:** kit canônico (Task 1-4), tabela de itens/OC (Task 5), cotação com ressalva (Task 6), 2 colunas inteligente (receita Task 7, aplicada 7-10), alcance dos 26 forms (Task 7-10), remoção do shim (Task 10), testes + preview (Task 5/10/11). Coberto.
- **Placeholders:** os passos de migração em lote (Task 7-10) usam uma receita explícita + gate por grep em vez de reescrever 20 arquivos que dependem de leitura prévia; o executor lê cada arquivo (Step 1 de cada). Não há "TODO/TBD" solto.
- **Consistência de tipos:** `ColunaItem`/`TabelaItensProps` definidos na Task 4 e usados igual na Task 5-6-8. `CampoFormulario`/`LinhaCampos`/`SecaoFormulario`/`classesFormulario` com a mesma assinatura em todas as tarefas.
