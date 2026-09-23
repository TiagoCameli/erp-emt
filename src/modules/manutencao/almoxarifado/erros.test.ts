import { describe, expect, it } from "vitest";

import {
  ERRO_ENTRADA_JA_USADA,
  ehRepetido,
  ehSaldoInsuficiente,
  traduzErroEntrada,
} from "@/modules/manutencao/almoxarifado/erros";

const FALLBACK = "Não foi possível salvar a entrada. Tente novamente";

describe("traduzErroEntrada", () => {
  it("a trava de saldo (23514) vira a frase da OS", () => {
    const erro = {
      code: "23514",
      message:
        "Saldo insuficiente no almoxarifado: o saldo desta peça ficaria negativo (5 de entrada, 8 de saída)",
    };
    expect(ehSaldoInsuficiente(erro)).toBe(true);
    expect(traduzErroEntrada(erro, FALLBACK)).toBe(ERRO_ENTRADA_JA_USADA);
  });

  it("pega a trava pelo texto mesmo sem o código", () => {
    expect(
      traduzErroEntrada({ message: "Saldo insuficiente no almoxarifado: ..." }, FALLBACK),
    ).toBe(ERRO_ENTRADA_JA_USADA);
  });

  it("pega o check direto da tabela de saldos", () => {
    const erro = {
      code: "23514",
      message: 'new row for relation "almoxarifado_saldos" violates check constraint "almoxarifado_saldo_nao_negativo"',
    };
    expect(traduzErroEntrada(erro, FALLBACK)).toBe(ERRO_ENTRADA_JA_USADA);
  });

  it("outro 23514 não é saldo e não mente", () => {
    const erro = { code: "23514", message: 'violates check constraint "almoxarifado_entradas_quantidade_check"' };
    expect(traduzErroEntrada(erro, FALLBACK)).toBe(FALLBACK);
  });

  it("raise exception nosso (P0001) passa como está", () => {
    expect(traduzErroEntrada({ code: "P0001", message: "Entrada não encontrada" }, FALLBACK)).toBe(
      "Entrada não encontrada",
    );
  });

  it("erro de infraestrutura volta o fallback", () => {
    expect(
      traduzErroEntrada({ code: "42501", message: "permission denied for function" }, FALLBACK),
    ).toBe(FALLBACK);
    expect(traduzErroEntrada(null, FALLBACK)).toBe(FALLBACK);
  });
});

describe("ehRepetido", () => {
  it("reconhece unique violation pelo código e pelo texto", () => {
    expect(ehRepetido({ code: "23505", message: "" })).toBe(true);
    expect(
      ehRepetido({ message: 'duplicate key value violates unique constraint "almoxarifado_itens_insumo_id_key"' }),
    ).toBe(true);
    expect(ehRepetido({ code: "23503", message: "foreign key" })).toBe(false);
    expect(ehRepetido(null)).toBe(false);
  });
});
