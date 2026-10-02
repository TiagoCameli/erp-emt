import { describe, expect, it } from "vitest";

import { lancarAjusteSchema, motivoCicloSchema, quantidadeAjusteParaBanco } from "./ciclo-schemas";

const MEDICAO = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";

describe("quantidadeAjusteParaBanco", () => {
  it("vira texto com ponto decimal, aceitando negativo", () => {
    expect(quantidadeAjusteParaBanco("-2")).toBe("-2");
    expect(quantidadeAjusteParaBanco("1.234,5")).toBe("1234.5");
    expect(quantidadeAjusteParaBanco("-0,0001")).toBe("-0.0001");
    expect(quantidadeAjusteParaBanco(" 3,25 ")).toBe("3.25");
  });

  it("recusa vazio, zero, texto, mais de 4 casas e sinal solto", () => {
    expect(quantidadeAjusteParaBanco("")).toBeNull();
    expect(quantidadeAjusteParaBanco("0")).toBeNull();
    expect(quantidadeAjusteParaBanco("-0,000")).toBeNull();
    expect(quantidadeAjusteParaBanco("abc")).toBeNull();
    expect(quantidadeAjusteParaBanco("1,23456")).toBeNull();
    expect(quantidadeAjusteParaBanco("-")).toBeNull();
    expect(quantidadeAjusteParaBanco("--2")).toBeNull();
  });

  it("a saída casa com o formato que a RPC aceita", () => {
    for (const t of ["-2", "1.234,5", "0,5", "-10"]) {
      expect(quantidadeAjusteParaBanco(t)).toMatch(/^-?[0-9]+(\.[0-9]+)?$/);
    }
  });
});

describe("lancarAjusteSchema", () => {
  it("transforma a quantidade digitada para o banco", () => {
    const r = lancarAjusteSchema.safeParse({ medicaoId: MEDICAO, itemId: ITEM, quantidade: "-2", motivo: "  Medida em dobro  " });
    expect(r.success && r.data).toEqual({ medicaoId: MEDICAO, itemId: ITEM, quantidade: "-2", motivo: "Medida em dobro" });
  });

  it("recusa sem serviço, quantidade inválida e motivo curto", () => {
    expect(lancarAjusteSchema.safeParse({ medicaoId: MEDICAO, itemId: "", quantidade: "1", motivo: "abc" }).success).toBe(false);
    const q = lancarAjusteSchema.safeParse({ medicaoId: MEDICAO, itemId: ITEM, quantidade: "0", motivo: "abc" });
    expect(q.success).toBe(false);
    expect(!q.success && q.error.issues[0]?.message).toBe("Informe a quantidade do ajuste, positiva ou negativa, até 4 casas");
    expect(lancarAjusteSchema.safeParse({ medicaoId: MEDICAO, itemId: ITEM, quantidade: "1", motivo: "ab" }).success).toBe(false);
  });
});

describe("motivoCicloSchema", () => {
  it("exige ao menos 3 letras, sem contar espaço", () => {
    expect(motivoCicloSchema.safeParse("  ab ").success).toBe(false);
    expect(motivoCicloSchema.safeParse(" DNIT devolveu ").data).toBe("DNIT devolveu");
  });
});
