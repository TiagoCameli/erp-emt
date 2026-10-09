import { describe, expect, it } from "vitest";

import { saldoInicialMudou } from "@/modules/financeiro/contas-bancarias/schemas";

describe("saldoInicialMudou", () => {
  const antes = { saldoInicial: 1000, saldoInicialData: "2025-01-01" };

  it("igual não mudou", () => {
    expect(saldoInicialMudou(antes, { ...antes })).toBe(false);
  });

  it("um centavo a mais mudou", () => {
    expect(saldoInicialMudou(antes, { ...antes, saldoInicial: 1000.01 })).toBe(true);
  });

  it("data de nenhuma para uma data mudou", () => {
    expect(
      saldoInicialMudou({ saldoInicial: 0, saldoInicialData: null }, { saldoInicial: 0, saldoInicialData: "2025-01-01" }),
    ).toBe(true);
  });

  it("vazio e nulo na data são a mesma coisa", () => {
    expect(
      saldoInicialMudou({ saldoInicial: 0, saldoInicialData: null }, { saldoInicial: 0, saldoInicialData: "" }),
    ).toBe(false);
  });
});
