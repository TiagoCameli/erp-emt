import { describe, expect, it } from "vitest";

import { situacaoDaDiaria } from "@/modules/rh/diaristas/situacao";

describe("situacaoDaDiaria", () => {
  it("aberta: em aberto e alterável", () => {
    expect(
      situacaoDaDiaria({
        lancamentoId: null,
        folhaId: null,
        statusParcelas: [],
      }),
    ).toEqual({ situacao: "aberto", alteravel: true });
  });

  it("fechada com parcela pendente (pagamento estornado e desaprovado): a pagar e alterável", () => {
    expect(
      situacaoDaDiaria({
        lancamentoId: "l",
        folhaId: null,
        statusParcelas: ["pendente"],
      }),
    ).toEqual({ situacao: "fechada", alteravel: true });
  });

  it("fechada com parcela aprovada: a pagar, mas travada", () => {
    expect(
      situacaoDaDiaria({
        lancamentoId: "l",
        folhaId: null,
        statusParcelas: ["aprovado"],
      }),
    ).toEqual({ situacao: "fechada", alteravel: false });
  });

  it("parcela paga: paga e travada", () => {
    expect(
      situacaoDaDiaria({
        lancamentoId: "l",
        folhaId: null,
        statusParcelas: ["pago"],
      }),
    ).toEqual({ situacao: "paga", alteravel: false });
  });

  it("paga pela folha: paga e travada, mesmo sem lançamento próprio", () => {
    expect(
      situacaoDaDiaria({
        lancamentoId: null,
        folhaId: "f",
        statusParcelas: [],
      }),
    ).toEqual({ situacao: "paga", alteravel: false });
  });
});
