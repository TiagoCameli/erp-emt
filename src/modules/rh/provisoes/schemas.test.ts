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

  it("aceita quatro casas decimais", () => {
    expect(provisaoSchema.safeParse({ ...base, percentual: 8.3333 }).success).toBe(true);
  });

  it("recusa mais de quatro casas decimais", () => {
    expect(provisaoSchema.safeParse({ ...base, percentual: 8.33335 }).success).toBe(false);
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

  // Fix round 1: 1e-7 escapava do `percentual > 0` (JS: 1e-7 > 0 é true),
  // a coluna numeric(6,3) arredondava pra 0.000 e o check do banco estourava
  // como erro genérico em vez de mensagem de campo. As duas causas foram
  // fechadas: casasDecimais conta certo a notação exponencial (percentual.ts)
  // e o piso explícito de 0,001 documenta a regra independente disso.
  it("recusa 1e-7 e 0.0001 com mensagem de campo, não erro cru do Postgres", () => {
    for (const percentual of [1e-7, 0.0001]) {
      const r = provisaoSchema.safeParse({ ...base, percentual });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.length).toBeGreaterThan(0);
        expect(typeof r.error.issues[0]?.message).toBe("string");
      }
    }
  });

  it("aceita exatamente o piso de 0,001 (limite inclusive)", () => {
    const r = provisaoSchema.safeParse({ ...base, percentual: 0.001 });
    expect(r.success).toBe(true);
  });
});
