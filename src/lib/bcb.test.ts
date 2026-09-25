import { describe, expect, it } from "vitest";

import { dataBcbParaIso, isoParaDataBcb, lerSerieBcb, montarCargaCdi } from "./bcb";

describe("dataBcbParaIso", () => {
  it("converte o formato do SGS", () => {
    expect(dataBcbParaIso("02/01/2026")).toBe("2026-01-02");
  });

  it("recusa data que não existe em vez de rolar para o mês seguinte", () => {
    expect(dataBcbParaIso("31/02/2026")).toBeNull();
    expect(dataBcbParaIso("2026-01-02")).toBeNull();
  });

  it("volta para o formato da URL", () => {
    expect(isoParaDataBcb("2026-09-25")).toBe("25/09/2026");
  });
});

describe("lerSerieBcb", () => {
  it("lê a resposta real da série 12", () => {
    expect(
      lerSerieBcb([
        { data: "23/09/2026", valor: "0.050788" },
        { data: "24/09/2026", valor: "0.050788" },
      ]),
    ).toEqual([
      { data: "2026-09-23", valor: 0.050788 },
      { data: "2026-09-24", valor: 0.050788 },
    ]);
  });

  it("descarta linha quebrada em vez de gravar CDI zero", () => {
    expect(
      lerSerieBcb([
        { data: "23/09/2026", valor: "" },
        { data: "xx", valor: "0.05" },
        { data: "24/09/2026", valor: "0.050788" },
      ]),
    ).toEqual([{ data: "2026-09-24", valor: 0.050788 }]);
  });

  it("resposta que não é lista estoura, não vira carga vazia calada", () => {
    expect(() => lerSerieBcb({ erro: "fora do ar" })).toThrow();
  });
});

describe("montarCargaCdi", () => {
  it("marca como parcial só o mês corrente da 4391", () => {
    const carga = montarCargaCdi(
      [{ data: "2026-09-24", valor: 0.050788 }],
      [
        { data: "2026-08-01", valor: 1.09 },
        { data: "2026-09-01", valor: 0.88 },
      ],
      "2026-09-25",
    );
    expect(carga.diario).toEqual([{ data: "2026-09-24", taxa: 0.050788 }]);
    expect(carga.mensal).toEqual([
      { mes: "2026-08-01", taxa: 1.09, parcial: false },
      { mes: "2026-09-01", taxa: 0.88, parcial: true },
    ]);
  });
});
