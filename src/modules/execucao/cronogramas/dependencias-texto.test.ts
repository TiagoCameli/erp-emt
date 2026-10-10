import { describe, expect, it } from "vitest";

import { formatarPredecessoras, lerPredecessoras } from "@/modules/execucao/cronogramas/dependencias-texto";

const linhas: Record<number, string> = { 3: "1.2", 7: "2.1" };
const porNumero = (n: number) => linhas[n];

describe("lerPredecessoras", () => {
  it.each([
    ["", []],
    ["1.1", [{ codigo: "1.1", tipo: "TI", atraso: 0 }]],
    ["1.1TI+2", [{ codigo: "1.1", tipo: "TI", atraso: 2 }]],
    ["1.3 ii -1", [{ codigo: "1.3", tipo: "II", atraso: -1 }]],
    ["1.1; 1.3TT+5d", [{ codigo: "1.1", tipo: "TI", atraso: 0 }, { codigo: "1.3", tipo: "TT", atraso: 5 }]],
    ["#3TI+2", [{ codigo: "1.2", tipo: "TI", atraso: 2 }]],
    ["#7IT", [{ codigo: "2.1", tipo: "IT", atraso: 0 }]],
  ])("%j", (texto, esperado) => {
    expect(lerPredecessoras(texto, porNumero)).toEqual({ ok: true, valor: esperado });
  });

  it("linha que não existe pelo número", () => {
    expect(lerPredecessoras("#9", porNumero)).toEqual({ ok: false, erro: "Não existe a linha 9" });
  });

  it("pedaço que não se entende", () => {
    expect(lerPredecessoras("1.1XX+2", porNumero)).toEqual({
      ok: false,
      erro: 'Não entendi "1.1XX+2". Use código, tipo (TI, II, TT, IT) e atraso: 1.2TI+2',
    });
  });

  it("a mesma predecessora duas vezes", () => {
    expect(lerPredecessoras("1.1; 1.1II", porNumero)).toEqual({ ok: false, erro: "A predecessora 1.1 aparece duas vezes" });
  });
});

describe("formatarPredecessoras", () => {
  it("omite TI sem atraso e escreve o resto", () => {
    expect(formatarPredecessoras([
      { codigo: "1.1", tipo: "TI", atraso: 0 },
      { codigo: "1.2", tipo: "TI", atraso: 2 },
      { codigo: "1.3", tipo: "II", atraso: -1 },
      { codigo: "2", tipo: "TT", atraso: 0 },
    ])).toBe("1.1; 1.2TI+2; 1.3II-1; 2TT");
  });

  it("ida e volta", () => {
    const texto = "1.1; 1.2TI+2; 1.3II-1; 2TT";
    const lido = lerPredecessoras(texto, porNumero);
    expect(lido.ok && formatarPredecessoras(lido.valor)).toBe(texto);
  });
});
