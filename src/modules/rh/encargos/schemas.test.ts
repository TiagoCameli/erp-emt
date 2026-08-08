import { describe, expect, it } from "vitest";

import { encargoSchema } from "@/modules/rh/encargos/schemas";

const base = {
  nome: "INSS patronal",
  percentual: "20",
};

describe("encargoSchema — nome", () => {
  it("rejeita nome vazio", () => {
    const r = encargoSchema.safeParse({ ...base, nome: "" });
    expect(r.success).toBe(false);
  });

  it("rejeita nome com 1 caractere", () => {
    const r = encargoSchema.safeParse({ ...base, nome: "A" });
    expect(r.success).toBe(false);
  });

  it("aceita nome com pelo menos 2 caracteres", () => {
    const r = encargoSchema.safeParse({ ...base, nome: "FGTS" });
    expect(r.success).toBe(true);
  });
});

describe("encargoSchema — percentual", () => {
  it("rejeita percentual vazio (obrigatório)", () => {
    const r = encargoSchema.safeParse({ ...base, percentual: "" });
    expect(r.success).toBe(false);
  });

  it("rejeita percentual acima de 100", () => {
    const r = encargoSchema.safeParse({ ...base, percentual: "101" });
    expect(r.success).toBe(false);
  });

  it("rejeita percentual negativo", () => {
    const r = encargoSchema.safeParse({ ...base, percentual: "-1" });
    expect(r.success).toBe(false);
  });

  it("rejeita mais de 3 casas decimais", () => {
    const r = encargoSchema.safeParse({ ...base, percentual: "5,8333" });
    expect(r.success).toBe(false);
  });

  it("aceita 5,8 (uma casa decimal)", () => {
    const r = encargoSchema.safeParse({ ...base, percentual: "5,8" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.percentual).toBe(5.8);
  });

  it("aceita 20 (inteiro)", () => {
    const r = encargoSchema.safeParse({ ...base, percentual: "20" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.percentual).toBe(20);
  });

  it("aceita 0,2 (limite inferior próximo de zero)", () => {
    const r = encargoSchema.safeParse({ ...base, percentual: "0,2" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.percentual).toBe(0.2);
  });

  it("aceita 100 exatamente (limite superior)", () => {
    const r = encargoSchema.safeParse({ ...base, percentual: "100" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.percentual).toBe(100);
  });

  it("aceita 0 exatamente (limite inferior)", () => {
    const r = encargoSchema.safeParse({ ...base, percentual: "0" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.percentual).toBe(0);
  });

  it("converte vírgula decimal (pt-BR)", () => {
    const r = encargoSchema.safeParse({ ...base, percentual: "5,833" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.percentual).toBe(5.833);
  });
});

describe("encargoSchema — reparse (idempotência)", () => {
  it("reparse do resultado já convertido continua válido", () => {
    const primeiro = encargoSchema.safeParse(base);
    expect(primeiro.success).toBe(true);
    if (!primeiro.success) return;

    const segundo = encargoSchema.safeParse(primeiro.data);
    expect(segundo.success).toBe(true);
    if (segundo.success) expect(segundo.data.percentual).toBe(20);
  });
});

describe("encargoSchema — ativo", () => {
  it("usa default true quando ausente", () => {
    const r = encargoSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ativo).toBe(true);
  });

  it("aceita ativo explícito false", () => {
    const r = encargoSchema.safeParse({ ...base, ativo: false });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ativo).toBe(false);
  });
});

describe("encargoSchema — grupoRecolhimento", () => {
  it("aceita encargo sem grupo de recolhimento (não vira guia)", () => {
    const r = encargoSchema.safeParse({
      nome: "FGTS",
      percentual: 8,
      ativo: true,
      grupoRecolhimento: undefined,
    });
    expect(r.success).toBe(true);
  });

  it("normaliza o grupo cortando espaço nas pontas", () => {
    const r = encargoSchema.safeParse({
      nome: "INSS patronal",
      percentual: 20,
      ativo: true,
      grupoRecolhimento: "  INSS  ",
    });
    expect(r.success && r.data.grupoRecolhimento).toBe("INSS");
  });

  it("recusa grupo com mais de 60 caracteres", () => {
    const r = encargoSchema.safeParse({
      nome: "RAT",
      percentual: 3,
      ativo: true,
      grupoRecolhimento: "x".repeat(61),
    });
    expect(r.success).toBe(false);
  });
});
