import { describe, expect, it } from "vitest";

import {
  adiantamentoFormParaInput,
  adiantamentoSchema,
} from "@/modules/rh/adiantamentos/schemas";

describe("adiantamentoSchema com parcelas", () => {
  const base = {
    colaboradorId: "11111111-1111-1111-1111-111111111111",
    competencia: "2026-09-01",
    valor: 1200,
    data: "2026-09-15",
    // Obrigatória desde 25/08/2026: é ela que decide o caminho do pagamento no
    // financeiro, e sem ela o lançamento do RH nascia sem forma nenhuma.
    formaPagamentoId: "22222222-2222-2222-2222-222222222222",
  };

  it("aceita parcelamento válido", () => {
    expect(adiantamentoSchema.safeParse({ ...base, parcelas: 3 }).success).toBe(
      true,
    );
  });

  it("aceita à vista como uma parcela", () => {
    expect(adiantamentoSchema.safeParse({ ...base, parcelas: 1 }).success).toBe(
      true,
    );
  });

  it("recusa zero, negativo e fracionário", () => {
    for (const parcelas of [0, -1, 2.5]) {
      expect(
        adiantamentoSchema.safeParse({ ...base, parcelas }).success,
      ).toBe(false);
    }
  });

  it("recusa acima do teto de 60", () => {
    expect(
      adiantamentoSchema.safeParse({ ...base, parcelas: 61 }).success,
    ).toBe(false);
  });

  it("recusa mais parcelas do que centavos no total", () => {
    // R$ 0,02 em 3 parcelas geraria parcela de zero.
    const r = adiantamentoSchema.safeParse({ ...base, valor: 0.02, parcelas: 3 });
    expect(r.success).toBe(false);
  });

  it("converte o formulário coerindo parcelas para número", () => {
    const input = adiantamentoFormParaInput({
      colaboradorId: base.colaboradorId,
      competencia: "2026-09",
      valor: "1.200,00",
      data: "2026-09-15",
      descricao: "",
      parcelas: "3",
      formaPagamentoId: base.colaboradorId,
    });
    expect(input.parcelas).toBe(3);
    expect(input.valor).toBe(1200);
    // A forma atravessa a conversão intacta: é ela que decide o caminho do
    // pagamento no financeiro, e perder no meio devolveria o lançamento sem forma.
    expect(input.formaPagamentoId).toBe(base.colaboradorId);
  });
});
