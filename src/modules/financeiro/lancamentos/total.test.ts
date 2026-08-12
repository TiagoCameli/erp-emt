import { describe, expect, it } from "vitest";

import { somarValores } from "@/modules/financeiro/lancamentos/total";

describe("somarValores", () => {
  it("soma sem erro de float", () => {
    // Somando direto, 0.1 + 0.2 dá 0.30000000000000004.
    expect(somarValores([0.1, 0.2])).toBe(0.3);
    expect(somarValores([1.1, 2.2, 3.3])).toBe(6.6);
  });

  it("fecha no centavo com muitos valores", () => {
    // 7.253 valores de 0,07 é a ordem de grandeza da carga do histórico. A soma
    // ingênua desses mesmos valores não dá exatamente 507,71.
    const valores = Array.from({ length: 7253 }, () => 0.07);
    expect(somarValores(valores)).toBe(507.71);
  });

  it("aguenta a ordem de grandeza da base sem perder centavo", () => {
    // Total real da carga: R$ 64.541.696,82 em 7.253 lançamentos. Em centavos
    // são 6.454.169.682, bem dentro do inteiro seguro do JS.
    const valores = [64541696.8, 0.01, 0.01];
    expect(somarValores(valores)).toBe(64541696.82);
  });

  it("devolve zero na lista vazia", () => {
    expect(somarValores([])).toBe(0);
  });
});
