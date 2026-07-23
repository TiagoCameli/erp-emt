import { describe, expect, it } from "vitest";

import {
  datasParcelas,
  dividirPercentualIgual,
  dividirValorPorParcelas,
} from "./calculo";

describe("dividirValorPorParcelas", () => {
  it("divide 100,00 em 3 iguais fechando exato (última absorve o centavo)", () => {
    expect(dividirValorPorParcelas(100, [33.33, 33.33, 33.34])).toEqual([
      33.33, 33.33, 33.34,
    ]);
  });

  it("50/50 de 1000", () => {
    expect(dividirValorPorParcelas(1000, [50, 50])).toEqual([500, 500]);
  });

  it("soma sempre bate com o total (arredondamento na última)", () => {
    const r = dividirValorPorParcelas(100, [33.33, 33.33, 33.34]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("dividirPercentualIgual", () => {
  it("3 parcelas: 33.33/33.33/33.34 somando 100", () => {
    const r = dividirPercentualIgual(3);
    expect(r).toEqual([33.33, 33.33, 33.34]);
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
  });

  it("2 parcelas: 50/50", () => {
    expect(dividirPercentualIgual(2)).toEqual([50, 50]);
  });

  it("4 parcelas: soma 100", () => {
    const r = dividirPercentualIgual(4);
    expect(r).toHaveLength(4);
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
  });

  it("1 parcela: 100%", () => {
    expect(dividirPercentualIgual(1)).toEqual([100]);
  });

  it("0 parcelas: lista vazia", () => {
    expect(dividirPercentualIgual(0)).toEqual([]);
  });
});

describe("datasParcelas", () => {
  it("soma os dias à data base (ISO)", () => {
    expect(datasParcelas("2026-07-22", [0, 30, 60])).toEqual([
      "2026-07-22",
      "2026-08-21",
      "2026-09-20",
    ]);
  });
});
