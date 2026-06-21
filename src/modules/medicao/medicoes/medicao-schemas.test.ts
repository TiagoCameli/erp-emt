import { describe, expect, it } from "vitest";

import {
  criarMedicaoFormParaInput,
  criarMedicaoSchema,
  itemSchema,
  motivoSchema,
} from "@/modules/medicao/medicoes/schemas";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";

describe("criarMedicaoSchema", () => {
  it("aceita medição válida", () => {
    const r = criarMedicaoSchema.safeParse({
      obraId: UUID_A,
      planilhaId: UUID_B,
      competencia: "2026-06-01",
      reajusteTipo: "percentual",
      reajusteValor: 10,
    });
    expect(r.success).toBe(true);
  });

  it("recusa tipo de reajuste fora do domínio", () => {
    const r = criarMedicaoSchema.safeParse({
      obraId: UUID_A,
      planilhaId: UUID_B,
      competencia: "2026-06-01",
      reajusteTipo: "indice",
      reajusteValor: 10,
    });
    expect(r.success).toBe(false);
  });

  it("recusa reajuste negativo", () => {
    const r = criarMedicaoSchema.safeParse({
      obraId: UUID_A,
      planilhaId: UUID_B,
      competencia: "2026-06-01",
      reajusteTipo: "valor",
      reajusteValor: -5,
    });
    expect(r.success).toBe(false);
  });
});

describe("itemSchema", () => {
  it("aceita quantidade não negativa", () => {
    expect(itemSchema.safeParse({ planilhaItemId: UUID_C, quantidade: 60 }).success).toBe(true);
    expect(itemSchema.safeParse({ planilhaItemId: UUID_C, quantidade: 0 }).success).toBe(true);
  });

  it("recusa quantidade negativa", () => {
    expect(itemSchema.safeParse({ planilhaItemId: UUID_C, quantidade: -1 }).success).toBe(false);
  });
});

describe("motivoSchema", () => {
  it("exige motivo não vazio", () => {
    expect(motivoSchema.safeParse("   ").success).toBe(false);
    expect(motivoSchema.safeParse("Erro de digitação").success).toBe(true);
  });
});

describe("criarMedicaoFormParaInput", () => {
  it("zera o reajuste quando o tipo é nenhum", () => {
    const out = criarMedicaoFormParaInput({
      obraId: UUID_A,
      planilhaId: UUID_B,
      competencia: "2026-06-01",
      descricao: "",
      reajusteTipo: "nenhum",
      reajusteValor: "999",
    });
    expect(out.reajusteValor).toBe(0);
    expect(out.descricao).toBeUndefined();
  });

  it("coage o reajuste percentual pt-BR", () => {
    const out = criarMedicaoFormParaInput({
      obraId: UUID_A,
      planilhaId: UUID_B,
      competencia: "2026-06-01",
      descricao: "Medição de junho",
      reajusteTipo: "percentual",
      reajusteValor: "12,5",
    });
    expect(out.reajusteValor).toBe(12.5);
    expect(out.descricao).toBe("Medição de junho");
  });
});
