import { describe, expect, it } from "vitest";

import { cetDaTaxaZero, filtrarContratosPorStatus, valorPagoDaCota } from "@/modules/financeiro/dividas/relatorio";

describe("cetDaTaxaZero", () => {
  const cet = { mensal: 0.002732, anual: 0.0333 };

  it("juro zero com custo no fluxo (IOF e tarifa financiados) devolve o CET anual", () => {
    // Komatsu CCB 6348/26: 0% a.m., 24 x R$ 13.965,78 sobre R$ 324.000 liberados.
    expect(cetDaTaxaZero({ taxaAm: 0, cet })).toBe(0.0333);
  });

  it("contrato com taxa não troca a taxa pelo CET", () => {
    expect(cetDaTaxaZero({ taxaAm: 1.25, cet })).toBeNull();
  });

  it("sem cronograma, ou sem custo nenhum, não há CET para mostrar", () => {
    expect(cetDaTaxaZero({ taxaAm: 0, cet: null })).toBeNull();
    expect(cetDaTaxaZero({ taxaAm: 0, cet: { mensal: 0, anual: 0 } })).toBeNull();
  });
});

describe("filtrarContratosPorStatus", () => {
  const contratos = [
    { numero: "a", status: "ativo" },
    { numero: "q", status: "quitado" },
    { numero: "r", status: "renegociado" },
  ];
  const numeros = (lista: { numero: string }[]) => lista.map((c) => c.numero);

  it("ativos traz o ativo e o renegociado (ainda há o que pagar)", () => {
    expect(numeros(filtrarContratosPorStatus(contratos, "ativos"))).toEqual(["a", "r"]);
  });

  it("quitados traz só o quitado; todos traz a lista inteira", () => {
    expect(numeros(filtrarContratosPorStatus(contratos, "quitados"))).toEqual(["q"]);
    expect(numeros(filtrarContratosPorStatus(contratos, "todos"))).toEqual(["a", "q", "r"]);
  });
});

describe("valorPagoDaCota", () => {
  it("soma fundo comum e taxa pagos, sem resíduo de ponto flutuante", () => {
    // 0,1 + 0,2 em float dá 0,30000000000000004
    expect(valorPagoDaCota({ fundoComumPago: 0.1, taxaPaga: 0.2 })).toBe(0.3);
    expect(valorPagoDaCota({ fundoComumPago: 3000, taxaPaga: 457.8 })).toBe(3457.8);
  });

  it("cota sem parcela paga dá zero", () => {
    expect(valorPagoDaCota({ fundoComumPago: 0, taxaPaga: 0 })).toBe(0);
  });
});
