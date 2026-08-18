import { describe, expect, it } from "vitest";

import { resumoPagas } from "./calculo";

describe("resumoPagas", () => {
  it("soma o líquido, que é o que saiu do banco, e não o valor devido", () => {
    const resumo = resumoPagas([
      { valorLiquido: 900, desconto: 100 },
      { valorLiquido: 500, desconto: 0 },
    ]);

    expect(resumo.totalLiquido).toBe(1400);
    expect(resumo.desconto).toBe(100);
    expect(resumo.quantidade).toBe(2);
  });

  it("conta só as parcelas que tiveram desconto", () => {
    const resumo = resumoPagas([
      { valorLiquido: 10, desconto: 0 },
      { valorLiquido: 10, desconto: 0.5 },
      { valorLiquido: 10, desconto: 2 },
    ]);

    expect(resumo.comDesconto).toBe(2);
    expect(resumo.quantidade).toBe(3);
  });

  it("não acumula erro de ponto flutuante em centavos", () => {
    // 0,10 + 0,20 em float dá 0,30000000000000004. Em centavos, dá 0,30.
    const resumo = resumoPagas([
      { valorLiquido: 0.1, desconto: 0 },
      { valorLiquido: 0.2, desconto: 0 },
    ]);

    expect(resumo.totalLiquido).toBe(0.3);
  });

  it("histórico vazio é zero, não NaN", () => {
    const resumo = resumoPagas([]);

    expect(resumo).toEqual({
      totalLiquido: 0,
      desconto: 0,
      quantidade: 0,
      comDesconto: 0,
    });
  });
});
