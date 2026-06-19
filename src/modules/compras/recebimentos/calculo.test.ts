import { describe, expect, it } from "vitest";

import {
  paraNumero,
  saldoAReceber,
  totalRecebido,
} from "@/modules/compras/recebimentos/calculo";

describe("paraNumero (recebimento)", () => {
  it("converte decimal pt-BR com milhar", () => {
    expect(paraNumero("1.234,5")).toBe(1234.5);
  });

  it("vazio vira 0", () => {
    expect(paraNumero("")).toBe(0);
  });

  it("inválido vira 0", () => {
    expect(paraNumero("xyz")).toBe(0);
  });
});

describe("totalRecebido", () => {
  it("soma as quantidades recebidas", () => {
    expect(
      totalRecebido([
        { quantidade_recebida: 2 },
        { quantidade_recebida: 3 },
      ]),
    ).toBe(5);
  });

  it("ignora quantidade nula", () => {
    expect(
      totalRecebido([
        { quantidade_recebida: 2 },
        { quantidade_recebida: null },
      ]),
    ).toBe(2);
  });

  it("lista vazia soma zero", () => {
    expect(totalRecebido([])).toBe(0);
  });
});

describe("saldoAReceber", () => {
  it("saldo = pedido menos recebido", () => {
    expect(saldoAReceber(10, 4)).toBe(6);
  });

  it("saldo zero quando recebeu tudo", () => {
    expect(saldoAReceber(10, 10)).toBe(0);
  });

  it("nunca fica negativo quando recebeu a mais", () => {
    expect(saldoAReceber(10, 12)).toBe(0);
  });

  it("saldo cheio quando nada foi recebido", () => {
    expect(saldoAReceber(7.5, 0)).toBe(7.5);
  });
});
