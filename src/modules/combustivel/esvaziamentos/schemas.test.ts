import { describe, expect, it } from "vitest";

import {
  esvaziamentoDoForm,
  esvaziamentoFormSchema,
  esvaziamentoSchema,
  type EsvaziamentoFormInput,
} from "@/modules/combustivel/esvaziamentos/schemas";

const TANQUE = "11111111-1111-4111-8111-111111111111";

function form(troca: Partial<EsvaziamentoFormInput> = {}): EsvaziamentoFormInput {
  return {
    tanqueId: TANQUE,
    litros: "155,6",
    motivo: "Diesel contaminado",
    dataHora: "2026-09-23T07:05",
    ...troca,
  };
}

describe("esvaziamento", () => {
  it("motivo é obrigatório (só espaço não conta)", () => {
    expect(esvaziamentoFormSchema.safeParse(form({ motivo: "   " })).success).toBe(false);
    expect(esvaziamentoSchema.safeParse({ ...esvaziamentoDoForm(form()), motivo: "" }).success).toBe(false);
  });

  it("litros com 4 casas passam, com 5 não", () => {
    expect(esvaziamentoFormSchema.safeParse(form({ litros: "155,6123" })).success).toBe(true);
    expect(esvaziamentoFormSchema.safeParse(form({ litros: "155,61234" })).success).toBe(false);
    expect(esvaziamentoSchema.safeParse({ ...esvaziamentoDoForm(form()), litros: 155.61234 }).success).toBe(false);
  });

  it("tanque e data são obrigatórios", () => {
    expect(esvaziamentoFormSchema.safeParse(form({ tanqueId: "" })).success).toBe(false);
    expect(esvaziamentoFormSchema.safeParse(form({ dataHora: "" })).success).toBe(false);
  });

  it("converte para a action com o fuso de Rio Branco e o motivo aparado", () => {
    expect(esvaziamentoDoForm(form({ motivo: "  Limpeza do tanque " }))).toEqual({
      tanqueId: TANQUE,
      litros: 155.6,
      motivo: "Limpeza do tanque",
      dataHora: "2026-09-23T07:05:00-05:00",
    });
  });
});
