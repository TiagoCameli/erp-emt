import { describe, expect, it } from "vitest";

import { situacaoDaParcela } from "@/modules/financeiro/aprovacao-pagamentos/aprovavel";

/** O caso bom: parcela pendente, lançamento a pagar e conta escolhida. */
const NA_FILA = {
  statusParcela: "pendente",
  statusLancamento: "a_pagar",
  contaBancariaId: "55555555-5555-4555-8555-555555555555",
} as const;

describe("situacaoDaParcela deixa aprovar", () => {
  it("quando a parcela está pendente, com conta e lançamento válido", () => {
    const situacao = situacaoDaParcela(NA_FILA);
    expect(situacao.podeAprovar).toBe(true);
    expect(situacao.motivo).toBeNull();
  });
});

describe("situacaoDaParcela recusa e explica", () => {
  it("parcela já aprovada", () => {
    const situacao = situacaoDaParcela({ ...NA_FILA, statusParcela: "aprovado" });
    expect(situacao.podeAprovar).toBe(false);
    expect(situacao.motivo).toMatch(/já está aprovad/i);
  });

  it("parcela já paga", () => {
    const situacao = situacaoDaParcela({ ...NA_FILA, statusParcela: "pago" });
    expect(situacao.podeAprovar).toBe(false);
    expect(situacao.motivo).toMatch(/já foi pag/i);
  });

  it("parcela devolvida para revisão", () => {
    const situacao = situacaoDaParcela({
      ...NA_FILA,
      statusParcela: "em_revisao",
    });
    expect(situacao.podeAprovar).toBe(false);
    expect(situacao.motivo).toMatch(/revisão/i);
  });

  it("parcela cancelada", () => {
    const situacao = situacaoDaParcela({
      ...NA_FILA,
      statusParcela: "cancelado",
    });
    expect(situacao.podeAprovar).toBe(false);
    expect(situacao.motivo).toMatch(/cancelad/i);
  });

  it("lançamento cancelado, mesmo com a parcela pendente", () => {
    const situacao = situacaoDaParcela({
      ...NA_FILA,
      statusLancamento: "cancelado",
    });
    expect(situacao.podeAprovar).toBe(false);
    expect(situacao.motivo).toMatch(/lançamento.*cancelad/i);
  });

  it("lançamento incompleto (previsto): as parcelas não somam o valor", () => {
    const situacao = situacaoDaParcela({
      ...NA_FILA,
      statusLancamento: "previsto",
    });
    expect(situacao.podeAprovar).toBe(false);
    expect(situacao.motivo).toMatch(/não somam o valor/i);
  });

  it("sem conta bancária escolhida no lançamento", () => {
    const situacao = situacaoDaParcela({ ...NA_FILA, contaBancariaId: null });
    expect(situacao.podeAprovar).toBe(false);
    expect(situacao.motivo).toMatch(/conta bancária/i);
  });
});

describe("situacaoDaParcela prioriza o motivo mais específico", () => {
  it("parcela paga sem conta fala do pagamento, não da conta", () => {
    // Dizer "falta escolher a conta" de uma parcela JÁ PAGA mandaria a pessoa
    // mexer no lançamento para resolver algo que não existe.
    const situacao = situacaoDaParcela({
      statusParcela: "pago",
      statusLancamento: "pago",
      contaBancariaId: null,
    });
    expect(situacao.motivo).toMatch(/já foi pag/i);
  });
});
