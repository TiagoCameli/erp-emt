import { describe, expect, it } from "vitest";

import { apontamentoSchema } from "@/modules/rh/apontamentos/schemas";
import { gerarFolhaSchema } from "@/modules/rh/folha/schemas";
import { diariaSchema } from "@/modules/rh/diaristas/schemas";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("apontamentoSchema", () => {
  it("aceita horas dentro de 0..24", () => {
    expect(
      apontamentoSchema.safeParse({ colaboradorId: UUID_A, horasNormais: 8, horasExtras: 2, tipo: "normal" }).success,
    ).toBe(true);
  });

  it("recusa horas acima de 24", () => {
    expect(
      apontamentoSchema.safeParse({ colaboradorId: UUID_A, horasNormais: 25, horasExtras: 0, tipo: "normal" }).success,
    ).toBe(false);
  });

  it("recusa horas negativas e tipo invalido", () => {
    expect(apontamentoSchema.safeParse({ colaboradorId: UUID_A, horasNormais: -1, horasExtras: 0, tipo: "normal" }).success).toBe(false);
    expect(apontamentoSchema.safeParse({ colaboradorId: UUID_A, horasNormais: 8, horasExtras: 0, tipo: "ferias" }).success).toBe(false);
  });
});

describe("gerarFolhaSchema", () => {
  it("aceita encargos não negativos", () => {
    expect(gerarFolhaSchema.safeParse({ competencia: "2026-06-01", encargosPercentual: 80 }).success).toBe(true);
    expect(gerarFolhaSchema.safeParse({ competencia: "2026-06-01", encargosPercentual: 0 }).success).toBe(true);
  });

  it("recusa encargos negativos", () => {
    expect(gerarFolhaSchema.safeParse({ competencia: "2026-06-01", encargosPercentual: -1 }).success).toBe(false);
  });

  it("recusa competência fora do formato yyyy-MM-01", () => {
    expect(gerarFolhaSchema.safeParse({ competencia: "2026-06", encargosPercentual: 80 }).success).toBe(false);
  });
});

describe("diariaSchema", () => {
  it("aceita diária válida (obra opcional)", () => {
    expect(
      diariaSchema.safeParse({ colaboradorId: UUID_A, data: "2026-06-05", competencia: "2026-06-01", valor: 150 }).success,
    ).toBe(true);
    expect(
      diariaSchema.safeParse({ colaboradorId: UUID_A, obraId: UUID_B, data: "2026-06-05", competencia: "2026-06-01", valor: 150 }).success,
    ).toBe(true);
  });

  it("recusa valor negativo e data inválida", () => {
    expect(diariaSchema.safeParse({ colaboradorId: UUID_A, data: "2026-06-05", competencia: "2026-06-01", valor: -1 }).success).toBe(false);
    expect(diariaSchema.safeParse({ colaboradorId: UUID_A, data: "05/06/2026", competencia: "2026-06-01", valor: 150 }).success).toBe(false);
  });
});
