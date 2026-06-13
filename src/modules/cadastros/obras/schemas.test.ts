import { describe, expect, it } from "vitest";

import { obraSchema } from "@/modules/cadastros/obras/schemas";

const base = {
  nome: "BR-364 Lote 09",
  status: "em_andamento" as const,
  ativo: true,
};

describe("obraSchema", () => {
  it("aceita obra sem datas (campos opcionais vazios não quebram)", () => {
    const r = obraSchema.safeParse({
      ...base,
      dataInicio: "",
      dataFimPrevista: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.dataInicio).toBeUndefined();
      expect(r.data.dataFimPrevista).toBeUndefined();
    }
  });

  it("aceita obra com datas válidas", () => {
    const r = obraSchema.safeParse({
      ...base,
      dataInicio: "2026-01-15",
      dataFimPrevista: "2026-12-20",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dataInicio).toBe("2026-01-15");
  });

  it("rejeita data em formato inválido", () => {
    const r = obraSchema.safeParse({ ...base, dataInicio: "15/01/2026" });
    expect(r.success).toBe(false);
  });

  it("exige nome", () => {
    const r = obraSchema.safeParse({ ...base, nome: "" });
    expect(r.success).toBe(false);
  });
});
