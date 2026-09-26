import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MINIMO_NAO_TEXTO,
  MINIMO_TEXTO,
  misturar,
  razaoContraste,
} from "./contraste";

/**
 * Contraste do tema, lido direto do `globals.css`.
 *
 * O teste não repete os hexes: ele lê os tokens do arquivo, então quem clarear
 * `--status-pendente` ou `--input` no CSS descobre aqui, não na tela de alguém
 * que não enxerga o badge. Cada bloco de tema (`:root` e, se existir, `.dark`)
 * passa pelos mesmos pares.
 */

const CSS = readFileSync(join(__dirname, "../app/globals.css"), "utf8");

/** Tokens `--nome: valor` de um bloco `seletor { ... }`, com `var()` resolvido. */
function tokensDoBloco(seletor: string): Record<string, string> | null {
  const inicio = CSS.search(new RegExp(`^${seletor.replace(".", "\\.")}\\s*\\{`, "m"));
  if (inicio < 0) return null;
  const corpo = CSS.slice(CSS.indexOf("{", inicio) + 1, CSS.indexOf("}", inicio));
  const brutos: Record<string, string> = {};
  for (const [, nome, valor] of corpo.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    brutos[nome] = valor.trim();
  }
  return brutos;
}

function resolver(tokens: Record<string, string>, nome: string): string {
  let valor = tokens[nome];
  for (let i = 0; valor?.startsWith("var("); i++) {
    if (i > 5) throw new Error(`var() circular em --${nome}`);
    valor = tokens[valor.slice(6, -1)];
  }
  if (!valor) throw new Error(`Token --${nome} não existe`);
  return valor;
}

const RAIZ = tokensDoBloco(":root");
const ESCURO = tokensDoBloco(".dark");
const TEMAS = [
  ["claro", RAIZ],
  ...(ESCURO ? [["escuro", { ...RAIZ, ...ESCURO }] as const] : []),
] as const;

const STATUS = ["aprovado", "pendente", "rejeitado", "rascunho", "efeito"];

describe.each(TEMAS)("tema %s", (_nome, brutos) => {
  const t = (nome: string) => resolver(brutos!, nome);
  const fundos = ["background", "surface"] as const;

  it.each([
    ["foreground", "background"],
    ["foreground", "surface"],
    ["muted-foreground", "background"],
    ["muted-foreground", "surface"],
    ["primary-foreground", "primary"],
    ["destructive-foreground", "destructive"],
    ["sidebar-foreground", "sidebar"],
  ])("texto %s sobre %s passa de 4,5:1", (frente, fundo) => {
    expect(razaoContraste(t(frente), t(fundo))).toBeGreaterThanOrEqual(MINIMO_TEXTO);
  });

  // StatusBadge: texto na cor do status sobre o mesmo status a 10%.
  describe.each(STATUS)("status %s", (status) => {
    it.each(fundos)("no badge sobre %s passa de 4,5:1", (fundo) => {
      const cor = t(`status-${status}`);
      const fundoBadge = misturar(cor, t(fundo), 0.1);
      expect(razaoContraste(cor, fundoBadge)).toBeGreaterThanOrEqual(MINIMO_TEXTO);
    });
    it.each(fundos)("discreto (sem fundo) sobre %s passa de 4,5:1", (fundo) => {
      expect(razaoContraste(t(`status-${status}`), t(fundo))).toBeGreaterThanOrEqual(
        MINIMO_TEXTO,
      );
    });
  });

  it.each([
    ["input", "background"],
    ["input", "surface"],
    ["ring", "background"],
    ["ring", "surface"],
    ["sidebar-ring", "sidebar"],
  ])("borda/foco %s sobre %s passa de 3:1", (frente, fundo) => {
    expect(razaoContraste(t(frente), t(fundo))).toBeGreaterThanOrEqual(MINIMO_NAO_TEXTO);
  });
});

describe("regras que os tokens sozinhos não garantem", () => {
  it("o verde de aprovado continua diferente do verde da marca", () => {
    expect(resolver(RAIZ!, "status-aprovado")).not.toBe(resolver(RAIZ!, "emt-verde"));
  });

  it("a Faixa continua âmbar e separada do anel de foco", () => {
    expect(RAIZ!.faixa).toBe("#f59e0b");
    expect(resolver(RAIZ!, "ring")).not.toBe(RAIZ!.faixa);
  });

  it("a borda decorativa continua clara (é a cara Notion) e a do campo não", () => {
    expect(RAIZ!.border).toBe("#e8e6e1");
    expect(RAIZ!.input).not.toBe(RAIZ!.border);
  });
});

/** Arquivos .ts/.tsx de `src`, sem os testes. */
function fontes(dir: string): string[] {
  const achados: string[] = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, item.name);
    if (item.isDirectory()) achados.push(...fontes(caminho));
    else if (/\.tsx?$/.test(item.name) && !/\.test\.tsx?$/.test(item.name)) {
      achados.push(caminho);
    }
  }
  return achados;
}

describe("varredura do código", () => {
  const arquivos = fontes(join(__dirname, ".."));
  const achar = (padrao: RegExp) =>
    arquivos.filter((arquivo) => padrao.test(readFileSync(arquivo, "utf8")));

  it("âmbar claro não vira cor de texto nem de ícone", () => {
    // #cf943a dá 2,6:1 e #f59e0b dá 2,2:1 no branco. Atenção é text-status-pendente.
    expect(achar(/\b(text|fill|stroke)-(emt-amarelo|faixa|amber-[1-6]00|yellow-\d+|orange-[1-5]00)\b/)).toEqual([]);
  });

  it("foco não volta para o anel translúcido: usa foco-anel", () => {
    expect(achar(/\bfocus(-visible)?:(ring|outline)-ring\/\d+/)).toEqual([]);
    expect(CSS).not.toMatch(/color-mix\([^)]*--color-ring/);
  });

  it("cinza fixo do Tailwind não é usado como texto", () => {
    expect(achar(/\btext-(gray|slate|zinc|neutral|stone)-\d+\b/)).toEqual([]);
  });
});

describe("espelho impresso", () => {
  const fonte = readFileSync(
    join(__dirname, "../components/canonicos/espelho-impresso.tsx"),
    "utf8",
  );
  const tons = [...fonte.matchAll(/(\w+): \{ fundo: "(#\w{6})", borda: "#\w{6}", texto: "(#\w{6})" \}/g)];

  it("tem os quatro tons de situação", () => {
    expect(tons.map(([, nome]) => nome)).toEqual(["aberto", "efetivado", "recusado", "neutro"]);
  });

  it.each(tons.map(([, nome, fundo, texto]) => [nome, fundo, texto]))(
    "tarja %s passa de 4,5:1",
    (_nome, fundo, texto) => {
      expect(razaoContraste(texto, fundo)).toBeGreaterThanOrEqual(MINIMO_TEXTO);
    },
  );
});

describe("razaoContraste", () => {
  it("preto no branco é 21:1 e cor igual é 1:1", () => {
    expect(razaoContraste("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(razaoContraste("#3e7744", "#3e7744")).toBe(1);
  });

  it("não depende da ordem", () => {
    expect(razaoContraste("#ffffff", "#6b6b6b")).toBe(razaoContraste("#6b6b6b", "#ffffff"));
  });

  it("confere com valores de referência", () => {
    // muted-foreground no branco: 5,33:1; Faixa no branco: 2,15:1.
    expect(razaoContraste("#6b6b6b", "#ffffff")).toBeCloseTo(5.33, 2);
    expect(razaoContraste("#f59e0b", "#ffffff")).toBeCloseTo(2.15, 2);
  });

  it("recusa cor fora de #rrggbb", () => {
    expect(() => razaoContraste("red", "#ffffff")).toThrow();
  });
});
