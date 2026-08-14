import { describe, expect, it } from "vitest";

import { provisaoSchema } from "@/modules/rh/provisoes/schemas";

describe("provisaoSchema", () => {
  const base = { nome: "Provisão 13º", percentual: 8.333, ativo: true };

  it("aceita percentual com três casas", () => {
    expect(provisaoSchema.safeParse(base).success).toBe(true);
  });

  it("recusa percentual zero ou negativo", () => {
    for (const percentual of [0, -1]) {
      expect(provisaoSchema.safeParse({ ...base, percentual }).success).toBe(false);
    }
  });

  it("recusa percentual acima de 100", () => {
    expect(provisaoSchema.safeParse({ ...base, percentual: 100.001 }).success).toBe(false);
  });

  it("recusa mais de três casas decimais", () => {
    expect(provisaoSchema.safeParse({ ...base, percentual: 8.3333 }).success).toBe(false);
  });

  it("aceita o percentual como string digitada em pt-BR", () => {
    const r = provisaoSchema.safeParse({ ...base, percentual: "8,333" });
    expect(r.success && r.data.percentual).toBe(8.333);
  });

  it("normaliza o nome cortando espaço nas pontas", () => {
    const r = provisaoSchema.safeParse({ ...base, nome: "  Provisão férias  " });
    expect(r.success && r.data.nome).toBe("Provisão férias");
  });

  it("recusa nome vazio, curto e com mais de 60 caracteres", () => {
    for (const nome of ["   ", "x", "x".repeat(61)]) {
      expect(provisaoSchema.safeParse({ ...base, nome }).success).toBe(false);
    }
  });
});
