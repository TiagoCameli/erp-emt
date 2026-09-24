import { describe, expect, it } from "vitest";

import { ajusteDoForm, ajusteFormSchema, ajusteSchema, payloadDoAjuste, type AjusteFormInput } from "@/modules/frete/ajustes/schemas";

const TRANSP = "11111111-1111-4111-8111-111111111111";
const OBRA = "22222222-2222-4222-8222-222222222222";

const FORM: AjusteFormInput = {
  transportadoraId: TRANSP,
  sinal: "credito",
  valor: "1234,5678",
  data: "2026-09-23T19:30",
  mesReferencia: "2026-08",
  centroCustoId: "",
  descricao: "  Diferença de preço do diesel de agosto  ",
};

describe("formulário do ajuste", () => {
  it("aceita valor com 4 casas e converte para o contrato da action (hora de Rio Branco)", () => {
    expect(ajusteFormSchema.safeParse(FORM).success).toBe(true);
    const dados = ajusteDoForm(FORM);
    expect(dados).toEqual({
      transportadoraId: TRANSP,
      sinal: "credito",
      valor: 1234.5678,
      data: "2026-09-23T19:30:00-05:00",
      mesReferencia: "2026-08-01",
      centroCustoId: null,
      descricao: "Diferença de preço do diesel de agosto",
    });
    expect(ajusteSchema.safeParse(dados).success).toBe(true);
  });

  it("valor precisa ser maior que zero e ter no máximo 4 casas", () => {
    for (const valor of ["0", "", "-1", "1,23456"]) {
      expect(ajusteFormSchema.safeParse({ ...FORM, valor }).success).toBe(false);
    }
  });

  it("descrição e transportadora são obrigatórias; mês vazio vai nulo (o banco usa o mês da data)", () => {
    expect(ajusteFormSchema.safeParse({ ...FORM, descricao: "   " }).success).toBe(false);
    expect(ajusteFormSchema.safeParse({ ...FORM, transportadoraId: "" }).success).toBe(false);
    expect(ajusteFormSchema.safeParse({ ...FORM, mesReferencia: "2026-13" }).success).toBe(false);
    expect(ajusteDoForm({ ...FORM, mesReferencia: "" }).mesReferencia).toBeNull();
  });

  it("data inválida não passa", () => {
    expect(ajusteFormSchema.safeParse({ ...FORM, data: "2026-02-31T10:00" }).success).toBe(false);
  });

  it("o servidor recusa campo a mais e data sem fuso", () => {
    const dados = ajusteDoForm(FORM);
    expect(ajusteSchema.safeParse({ ...dados, extra: 1 }).success).toBe(false);
    expect(ajusteSchema.safeParse({ ...dados, data: "2026-09-23T19:30" }).success).toBe(false);
    expect(ajusteSchema.safeParse({ ...dados, valor: 1.23456 }).success).toBe(false);
  });

  it("p_dados tem as chaves da fn_frete_ajuste_salvar", () => {
    expect(payloadDoAjuste({ ...ajusteDoForm(FORM), centroCustoId: OBRA, sinal: "debito" })).toEqual({
      transportadora_id: TRANSP,
      sinal: "debito",
      valor: 1234.5678,
      data: "2026-09-23T19:30:00-05:00",
      mes_referencia: "2026-08-01",
      centro_custo_id: OBRA,
      descricao: "Diferença de preço do diesel de agosto",
    });
  });
});
