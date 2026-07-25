import { describe, expect, it } from "vitest";

import { jornadaSchema } from "@/modules/cadastros/jornadas/schemas";

const base = {
  nome: "Padrão EMT",
  horasSegunda: "8",
  horasTerca: "8",
  horasQuarta: "8",
  horasQuinta: "8",
  horasSexta: "8",
  horasSabado: "5",
  horasDomingo: "0",
};

describe("jornadaSchema — nome", () => {
  it("rejeita nome vazio", () => {
    const r = jornadaSchema.safeParse({ ...base, nome: "" });
    expect(r.success).toBe(false);
  });

  it("rejeita nome com 1 caractere", () => {
    const r = jornadaSchema.safeParse({ ...base, nome: "A" });
    expect(r.success).toBe(false);
  });

  it("aceita nome com pelo menos 2 caracteres", () => {
    const r = jornadaSchema.safeParse({ ...base, nome: "Turno A" });
    expect(r.success).toBe(true);
  });
});

const CAMPOS_HORAS = [
  "horasSegunda",
  "horasTerca",
  "horasQuarta",
  "horasQuinta",
  "horasSexta",
  "horasSabado",
  "horasDomingo",
] as const;

describe.each(CAMPOS_HORAS)("jornadaSchema — %s", (campo) => {
  it("rejeita hora acima de 24", () => {
    const r = jornadaSchema.safeParse({ ...base, [campo]: "25" });
    expect(r.success).toBe(false);
  });

  it("rejeita hora negativa", () => {
    const r = jornadaSchema.safeParse({ ...base, [campo]: "-1" });
    expect(r.success).toBe(false);
  });

  it("hora vazia vira 0", () => {
    const r = jornadaSchema.safeParse({ ...base, [campo]: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data[campo]).toBe(0);
  });

  it("aceita 24 exatamente (limite superior)", () => {
    const r = jornadaSchema.safeParse({ ...base, [campo]: "24" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data[campo]).toBe(24);
  });

  it("converte vírgula decimal (pt-BR)", () => {
    const r = jornadaSchema.safeParse({ ...base, [campo]: "8,5" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data[campo]).toBe(8.5);
  });

  it("rejeita mais de 2 casas decimais", () => {
    const r = jornadaSchema.safeParse({ ...base, [campo]: "8,333" });
    expect(r.success).toBe(false);
  });
});

describe("jornadaSchema — reparse (idempotência)", () => {
  it("reparse do resultado já convertido continua válido", () => {
    const primeiro = jornadaSchema.safeParse(base);
    expect(primeiro.success).toBe(true);
    if (!primeiro.success) return;

    const segundo = jornadaSchema.safeParse(primeiro.data);
    expect(segundo.success).toBe(true);
    if (segundo.success) expect(segundo.data.horasSegunda).toBe(8);
  });
});

describe("jornadaSchema — ativo", () => {
  it("usa default true quando ausente", () => {
    const r = jornadaSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ativo).toBe(true);
  });

  it("aceita ativo explícito false", () => {
    const r = jornadaSchema.safeParse({ ...base, ativo: false });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ativo).toBe(false);
  });
});
