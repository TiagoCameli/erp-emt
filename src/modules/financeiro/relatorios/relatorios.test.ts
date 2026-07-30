import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  RELATORIOS,
  RELATORIO_PADRAO,
  normalizarRelatorio,
} from "@/modules/financeiro/relatorios/relatorios";

describe("normalizarRelatorio", () => {
  it("aceita todos os relatórios da navegação", () => {
    for (const id of RELATORIOS) {
      expect(normalizarRelatorio(id)).toBe(id);
    }
  });

  it("cai no padrão com valor inválido, vazio ou ausente", () => {
    expect(normalizarRelatorio("inventado")).toBe(RELATORIO_PADRAO);
    expect(normalizarRelatorio("")).toBe(RELATORIO_PADRAO);
    expect(normalizarRelatorio(undefined)).toBe(RELATORIO_PADRAO);
  });

  it("o padrão é um relatório que existe", () => {
    expect(RELATORIOS).toContain(RELATORIO_PADRAO);
  });

  it("mora em módulo neutro, chamável do servidor", () => {
    // O bug que isto trava: a função morava em relatorios-nav.tsx, que é
    // "use client", e a página (Server Component) chamava ela. O Next levanta
    // "Attempted to call normalizarRelatorio() from the server" em runtime, e
    // isso derrubava os sete relatórios em produção passando por tsc, lint,
    // testes e build, porque é fronteira de runtime e não de tipo.
    const fonte = readFileSync(
      "src/modules/financeiro/relatorios/relatorios.ts",
      "utf8",
    );
    // A diretiva, não a palavra: o comentário do arquivo cita "use client" para
    // explicar o bug, e isso é documentação, não fronteira.
    expect(fonte.trimStart().startsWith('"use client"')).toBe(false);
    expect(fonte.trimStart().startsWith("'use client'")).toBe(false);
  });
});
