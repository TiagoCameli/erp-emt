import { describe, expect, it } from "vitest";

import { dividirEmParcelas } from "@/modules/rh/adiantamentos/parcelamento";

describe("dividirEmParcelas", () => {
  it("divide exato quando o valor fecha", () => {
    expect(dividirEmParcelas(1200, 3)).toEqual([400, 400, 400]);
  });

  it("joga a sobra de centavos na primeira parcela", () => {
    expect(dividirEmParcelas(1000, 3)).toEqual([333.34, 333.33, 333.33]);
  });

  it("mantém a soma exata mesmo com divisão feia", () => {
    const parcelas = dividirEmParcelas(100, 7);
    expect(parcelas).toEqual([14.32, 14.28, 14.28, 14.28, 14.28, 14.28, 14.28]);
    const soma = parcelas.reduce((a, b) => Math.round((a + b) * 100) / 100, 0);
    expect(soma).toBe(100);
  });

  it("funciona no limite de centavos", () => {
    expect(dividirEmParcelas(0.05, 3)).toEqual([0.03, 0.01, 0.01]);
  });

  it("uma parcela devolve o total", () => {
    expect(dividirEmParcelas(1234.56, 1)).toEqual([1234.56]);
  });

  it("nunca devolve parcela de zero", () => {
    // 3 centavos em 3 parcelas é o limite: 1 centavo cada.
    expect(dividirEmParcelas(0.03, 3)).toEqual([0.01, 0.01, 0.01]);
  });
});
