// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guarda do tema escuro no `globals.css`.
 *
 * Os valores claros existem em DOIS lugares: `:root, .tema-claro` e a cópia em
 * `@media print { :root.dark }` (o `@media` não entra numa lista de
 * seletores). Se alguém muda um e esquece o outro, quem imprime com o tema
 * escuro ligado recebe um papel com uma cor velha, e ninguém percebe na tela.
 * Este teste pega isso.
 */
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** Declarações `--x: valor` do primeiro bloco que casa com o seletor. */
function bloco(seletor: RegExp): Map<string, string> {
  const inicio = css.search(seletor);
  if (inicio === -1) throw new Error(`bloco não encontrado: ${seletor}`);
  const abre = css.indexOf("{", inicio);
  const fecha = css.indexOf("}", abre);
  const corpo = css
    .slice(abre + 1, fecha)
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const mapa = new Map<string, string>();
  for (const [, nome, valor] of corpo.matchAll(/(--[\w-]+|color-scheme)\s*:\s*([^;]+);/g)) {
    mapa.set(nome, valor.trim());
  }
  return mapa;
}

const claro = bloco(/^:root,\s*\n\.tema-claro\s*\{/m);
const escuro = bloco(/^\.dark\s*\{/m);
const impressao = bloco(/^\s+:root\.dark\s*\{/m);

describe("tema escuro no globals.css", () => {
  it("`.dark` tem exatamente os valores aprovados", () => {
    expect(Object.fromEntries(escuro)).toEqual({
      "--background": "#191919",
      "--foreground": "#ececea",
      "--surface": "#222221",
      "--card": "#202020",
      "--card-foreground": "#ececea",
      "--popover": "#252525",
      "--popover-foreground": "#ececea",
      "--muted": "#222221",
      "--muted-foreground": "#9b9b98",
      "--border": "#353432",
      "--input": "#6a6964",
      "--accent": "#233227",
      "--accent-foreground": "#a9d4b1",
      "--secondary": "#2a2a29",
      "--secondary-foreground": "#ececea",
      "--primary-texto": "#a9d4b1",
      "--destrutivo-texto": "#f07c7c",
      "--status-aprovado": "#5cc98a",
      "--status-pendente": "#e8a15a",
      "--status-rejeitado": "#f07c7c",
      "--status-rascunho": "#a1a7b3",
      "--status-efeito": "#8fd9a8",
      "--chart-3": "#8e8f95",
      "--chart-5": "#e06666",
      "--sidebar": "#202020",
      "--sidebar-foreground": "#ececea",
      "--sidebar-accent": "#2a332b",
      "--sidebar-accent-foreground": "#ececea",
      "--sidebar-border": "#353432",
      "--logo-texto": "#ececea",
      "--sombra-xs": "rgb(0 0 0 / 0.4)",
      "--sombra-sm": "rgb(0 0 0 / 0.5)",
      "color-scheme": "dark",
    });
  });

  it("a marca, o primário, a Faixa e o destrutivo não mudam no escuro", () => {
    for (const token of [
      "--emt-verde",
      "--emt-verde-escuro",
      "--emt-verde-lavado",
      "--emt-asfalto",
      "--emt-amarelo",
      "--primary",
      "--primary-foreground",
      "--faixa",
      "--ring",
      "--destructive",
      "--destructive-foreground",
      "--chart-1",
      "--chart-2",
      "--chart-4",
      "--sidebar-primary",
      "--sidebar-primary-foreground",
      "--sidebar-ring",
    ]) {
      expect(claro.has(token), `${token} existe no claro`).toBe(true);
      expect(escuro.has(token), `${token} não pode estar no .dark`).toBe(false);
    }
  });

  it("a impressão com o tema escuro ligado volta exatamente ao claro", () => {
    // Todo token que o escuro muda precisa voltar no papel, com o valor do :root.
    expect([...impressao.keys()].sort()).toEqual([...escuro.keys()].sort());
    for (const [token, valor] of impressao) {
      expect(valor, token).toBe(claro.get(token));
    }
  });

  it("texto verde e texto de erro têm token próprio, e o text-* usa ele", () => {
    // No claro é o mesmo hex do fundo: o tema claro não muda.
    expect(claro.get("--primary-texto")).toBe("var(--emt-verde)");
    expect(claro.get("--destrutivo-texto")).toBe(claro.get("--destructive"));
    expect(css).toContain("--text-color-primary: var(--primary-texto);");
    expect(css).toContain("--text-color-destructive: var(--destrutivo-texto);");
  });

  it("o texto da logo é token nos dois temas", () => {
    expect(claro.get("--logo-texto")).toBe("#1d1d1f");
    expect(claro.get("color-scheme")).toBe("light");
  });
});
