import { describe, expect, it } from "vitest";

import {
  esvaziamentoDoForm,
  esvaziamentoFormSchema,
  esvaziamentoSchema,
  litrosDescartados,
  podeEsvaziar,
  type EsvaziamentoFormInput,
} from "@/modules/combustivel/esvaziamentos/schemas";

const TANQUE = "11111111-1111-4111-8111-111111111111";

function form(troca: Partial<EsvaziamentoFormInput> = {}): EsvaziamentoFormInput {
  return { tanqueId: TANQUE, motivo: "Diesel contaminado", ...troca };
}

describe("esvaziamento", () => {
  it("motivo precisa de pelo menos 3 caracteres, sem contar espaço (como a origem)", () => {
    expect(esvaziamentoFormSchema.safeParse(form({ motivo: "ab" })).success).toBe(false);
    expect(esvaziamentoFormSchema.safeParse(form({ motivo: "  ab   " })).success).toBe(false);
    expect(esvaziamentoFormSchema.safeParse(form({ motivo: "abc" })).success).toBe(true);
    expect(esvaziamentoSchema.safeParse({ tanqueId: TANQUE, motivo: "ab" }).success).toBe(false);
    expect(esvaziamentoSchema.safeParse({ tanqueId: TANQUE, motivo: "abc" }).success).toBe(true);
  });

  it("tanque é obrigatório", () => {
    expect(esvaziamentoFormSchema.safeParse(form({ tanqueId: "" })).success).toBe(false);
  });

  it("não pede litros nem data: vai só o tanque e o motivo aparado", () => {
    expect(esvaziamentoDoForm(form({ motivo: "  Limpeza do tanque " }))).toEqual({
      tanqueId: TANQUE,
      motivo: "Limpeza do tanque",
    });
  });

  it("os litros descartados são o nível atual inteiro", () => {
    expect(litrosDescartados({ nivel: 155.6123 })).toBe(155.6123);
    expect(litrosDescartados(null)).toBe(0);
  });

  it("só tanque da EMT com nível acima de zero se esvazia", () => {
    expect(podeEsvaziar({ nivel: 0.0001 })).toBe(true);
    expect(podeEsvaziar({ nivel: 0 })).toBe(false);
    expect(podeEsvaziar({ nivel: -1 })).toBe(false);
    expect(podeEsvaziar({ nivel: 500, ehExterno: true })).toBe(false);
  });
});
