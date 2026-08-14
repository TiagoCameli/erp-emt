import { describe, expect, it } from "vitest";

import { casasDecimais, paraNumero, percentualSchema } from "@/modules/rh/percentual";

describe("casasDecimais", () => {
  it("conta casas em notação decimal simples", () => {
    expect(casasDecimais(8.333)).toBe(3);
    expect(casasDecimais(100)).toBe(0);
    expect(casasDecimais(0.2)).toBe(1);
  });

  it("conta casas em notação exponencial negativa (fix round 1)", () => {
    // (1e-7).toString() é "1e-7", sem ponto: a versão anterior contava 0.
    expect(casasDecimais(1e-7)).toBe(7);
    expect(casasDecimais(1.5e-7)).toBe(8);
    expect(casasDecimais(9e-8)).toBe(8);
  });

  it("devolve 0 para valores não finitos", () => {
    expect(casasDecimais(NaN)).toBe(0);
    expect(casasDecimais(Infinity)).toBe(0);
  });
});

describe("paraNumero — agrupamento de milhar", () => {
  it("recusa grupo de milhar com menos de 3 dígitos (0.5 não vira 5)", () => {
    expect(Number.isNaN(paraNumero("0.5"))).toBe(true);
  });

  it("aceita grupo de milhar bem formado (8.333 = oito mil trezentos e trinta e três)", () => {
    expect(paraNumero("8.333")).toBe(8333);
  });

  it("aceita milhar de vários grupos (1.234.567)", () => {
    expect(paraNumero("1.234.567")).toBe(1234567);
  });

  it("aceita milhar seguido de decimal (1.234,56)", () => {
    expect(paraNumero("1.234,56")).toBe(1234.56);
  });

  it("aceita vírgula decimal sem milhar (8,333 = 8.333)", () => {
    expect(paraNumero("8,333")).toBe(8.333);
  });

  it("aceita número inteiro sem separador (1.234 = 1234)", () => {
    expect(paraNumero("1.234")).toBe(1234);
  });

  it("aceita negativo simples", () => {
    expect(paraNumero("-1")).toBe(-1);
  });
});

describe("percentualSchema — casos do fix round 1", () => {
  it("recusa 1e-7 (número) com mensagem de campo, não erro cru", () => {
    const r = percentualSchema.safeParse(1e-7);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("recusa '0.5' (string, agrupamento inválido) com mensagem de campo", () => {
    const r = percentualSchema.safeParse("0.5");
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("Percentual inválido");
    }
  });
});
