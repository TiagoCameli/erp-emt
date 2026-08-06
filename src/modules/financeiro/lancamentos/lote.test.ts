import { describe, expect, it } from "vitest";

import {
  ehElegivelParaLote,
  LIMITE_LOTE,
  textoResumoLote,
} from "@/modules/financeiro/lancamentos/lote";

describe("ehElegivelParaLote", () => {
  it("sem conta e conta parcial entram", () => {
    expect(ehElegivelParaLote({ revisao: "sem-conta" })).toBe(true);
    // Parcial é lançamento quebrado (a conta deveria ser a mesma em todas as
    // parcelas pendentes) e o lote completa as vazias.
    expect(ehElegivelParaLote({ revisao: "parcial" })).toBe(true);
  });

  it("revisado não entra: já tem conta em tudo que está pendente", () => {
    expect(ehElegivelParaLote({ revisao: "revisado" })).toBe(false);
  });

  it("nao-se-aplica não entra: a receber, ou sem parcela nenhuma", () => {
    // Não há conta de pagamento para definir.
    expect(ehElegivelParaLote({ revisao: "nao-se-aplica" })).toBe(false);
  });
});

describe("textoResumoLote", () => {
  it("caso limpo diz só o que foi feito", () => {
    expect(
      textoResumoLote({
        definidos: 275,
        puladosComConta: 0,
        puladosSemParcelaPendente: 0,
        naoEncontrados: 0,
      }),
    ).toBe("Conta definida em 275 lançamentos");
  });

  it("singular não diz '1 lançamentos'", () => {
    expect(
      textoResumoLote({
        definidos: 1,
        puladosComConta: 0,
        puladosSemParcelaPendente: 0,
        naoEncontrados: 0,
      }),
    ).toBe("Conta definida em 1 lançamento");
  });

  it("diz quantos foram pulados e por quê", () => {
    expect(
      textoResumoLote({
        definidos: 275,
        puladosComConta: 12,
        puladosSemParcelaPendente: 3,
        naoEncontrados: 0,
      }),
    ).toBe(
      "Conta definida em 275 lançamentos. 12 já tinham conta e 3 não tinham parcela em aberto: pulados",
    );
  });

  it("id que sumiu é dito, não escondido", () => {
    expect(
      textoResumoLote({
        definidos: 4,
        puladosComConta: 0,
        puladosSemParcelaPendente: 0,
        naoEncontrados: 2,
      }),
    ).toBe(
      "Conta definida em 4 lançamentos. 2 não foram encontrados: a lista estava velha, recarregue a tela",
    );
  });

  it("nada feito é dito como nada feito", () => {
    expect(
      textoResumoLote({
        definidos: 0,
        puladosComConta: 9,
        puladosSemParcelaPendente: 0,
        naoEncontrados: 0,
      }),
    ).toBe("Nenhuma conta definida. 9 já tinham conta: pulados");
  });
});

describe("LIMITE_LOTE", () => {
  it("é 500, o mesmo número que a função do banco recusa passar", () => {
    // Se este número divergir do teto da fn_definir_conta_lancamentos_lote, o
    // usuário recebe erro do banco em vez do aviso da tela.
    expect(LIMITE_LOTE).toBe(500);
  });
});
