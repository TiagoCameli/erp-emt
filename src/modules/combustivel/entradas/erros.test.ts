// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ERRO_SEM_PERMISSAO_BANCO,
  traduzirErroCombustivel,
} from "@/modules/combustivel/entradas/erros";

const FALLBACK = "Não foi possível salvar. Tente novamente";

describe("traduzirErroCombustivel", () => {
  it("as travas do banco (P0001) chegam à tela como estão", () => {
    for (const mensagem of [
      "A entrada passa da capacidade do tanque (15000.0000 L)",
      "O tanque tem outro combustível: esvazie antes de receber este",
      "Tanque externo não recebe entrada: o estoque é do dono",
      "Data no futuro",
      "Movimento de ciclo fechado (antes do reabastecimento de 01/09/2026 08:00): não se altera nem exclui",
      "Saldo insuficiente no tanque nessa data: 120.50 L disponíveis",
    ]) {
      expect(traduzirErroCombustivel({ code: "P0001", message: mensagem }, FALLBACK)).toBe(mensagem);
    }
  });

  it("a trava de saldo negativo (23514 nosso) também chega", () => {
    const mensagem = "O tanque ficaria com saldo negativo em algum momento: confira as datas e os litros";
    expect(traduzirErroCombustivel({ code: "23514", message: mensagem }, FALLBACK)).toBe(mensagem);
  });

  it("CHECK de tabela (23514 técnico) não vaza", () => {
    expect(
      traduzirErroCombustivel(
        { code: "23514", message: 'new row for relation "combustivel_saidas" violates check constraint "x"' },
        FALLBACK,
      ),
    ).toBe(FALLBACK);
  });

  it("permissão negada vira frase própria; o resto é fallback", () => {
    expect(traduzirErroCombustivel({ code: "42501", message: "permission denied" }, FALLBACK)).toBe(
      ERRO_SEM_PERMISSAO_BANCO,
    );
    expect(traduzirErroCombustivel({ code: "22P02", message: "invalid input syntax for type uuid" }, FALLBACK)).toBe(
      FALLBACK,
    );
    expect(traduzirErroCombustivel(null, FALLBACK)).toBe(FALLBACK);
    expect(traduzirErroCombustivel({ code: "P0001", message: "" }, FALLBACK)).toBe(FALLBACK);
  });
});
