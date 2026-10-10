import { describe, expect, it } from "vitest";

import { lerBlocoColado } from "@/lib/bloco-colado";

describe("lerBlocoColado", () => {
  it("linhas por quebra, colunas por tabulação, sem a linha vazia do fim", () => {
    expect(lerBlocoColado("1.1\tEstacas\t30\r\n1.2\tBlocos\t5\r\n")).toEqual([
      ["1.1", "Estacas", "30"],
      ["1.2", "Blocos", "5"],
    ]);
  });

  it("célula entre aspas com quebra de linha e aspas dobradas (como o Excel copia)", () => {
    expect(lerBlocoColado('1\t"Fundação\nbloco ""A"""\t3\n')).toEqual([["1", 'Fundação\nbloco "A"', "3"]]);
  });

  it("uma célula só", () => {
    expect(lerBlocoColado("42")).toEqual([["42"]]);
  });
});
