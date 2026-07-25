import { describe, expect, it } from "vitest";

import { funcaoSchema } from "@/modules/cadastros/funcoes/schemas";

const base = { nome: "Pedreiro", salarioBase: "", cbo: "" };

describe("funcaoSchema — nome", () => {
  it("rejeita nome vazio", () => {
    const r = funcaoSchema.safeParse({ ...base, nome: "" });
    expect(r.success).toBe(false);
  });

  it("rejeita nome com 1 caractere", () => {
    const r = funcaoSchema.safeParse({ ...base, nome: "A" });
    expect(r.success).toBe(false);
  });

  it("aceita nome com pelo menos 2 caracteres", () => {
    const r = funcaoSchema.safeParse({ ...base, nome: "Pedreiro" });
    expect(r.success).toBe(true);
  });
});

describe("funcaoSchema — salarioBase (dinheiro opcional)", () => {
  it("aceita salário vazio como null (campo opcional)", () => {
    const r = funcaoSchema.safeParse({ ...base, salarioBase: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.salarioBase).toBeNull();
  });

  it("converte string digitada (pt-BR) em número", () => {
    const r = funcaoSchema.safeParse({ ...base, salarioBase: "3.500,00" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.salarioBase).toBe(3500);
  });

  it("rejeita salário com mais de 2 casas decimais", () => {
    const r = funcaoSchema.safeParse({ ...base, salarioBase: "10,999" });
    expect(r.success).toBe(false);
  });

  it("rejeita salário negativo", () => {
    const r = funcaoSchema.safeParse({ ...base, salarioBase: "-10" });
    expect(r.success).toBe(false);
  });

  it("é idempotente: reparse do número já convertido continua válido", () => {
    const primeiro = funcaoSchema.safeParse({ ...base, salarioBase: "3.500,00" });
    expect(primeiro.success).toBe(true);
    if (!primeiro.success) return;

    const segundo = funcaoSchema.safeParse(primeiro.data);
    expect(segundo.success).toBe(true);
    if (segundo.success) expect(segundo.data.salarioBase).toBe(3500);
  });
});

describe("funcaoSchema — cbo", () => {
  it("aceita cbo vazio como null", () => {
    const r = funcaoSchema.safeParse({ ...base, cbo: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.cbo).toBeNull();
  });

  it("aceita cbo preenchido", () => {
    const r = funcaoSchema.safeParse({ ...base, cbo: "7152-10" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.cbo).toBe("7152-10");
  });
});

describe("funcaoSchema — ativo", () => {
  it("usa default true quando ausente", () => {
    const r = funcaoSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ativo).toBe(true);
  });

  it("aceita ativo explícito false", () => {
    const r = funcaoSchema.safeParse({ ...base, ativo: false });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ativo).toBe(false);
  });
});
