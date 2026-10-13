import { describe, expect, it } from "vitest";

import { chaveSaldo, saldosPorDepositoInsumo } from "@/modules/estoque/calculo";

describe("saldo por depósito e insumo", () => {
  const entradas = [
    { depositoId: "d1", insumoId: "i1", quantidade: 10 },
    { depositoId: "d1", insumoId: "i1", quantidade: 0.1 },
    { depositoId: "d2", insumoId: "i1", quantidade: 5 },
  ];
  const saidas = [
    { id: "s1", depositoId: "d1", insumoId: "i1", quantidade: 0.2 },
    { id: "s2", depositoId: "d1", insumoId: "i1", quantidade: 3 },
  ];

  it("entradas menos saídas, sem erro de ponto flutuante", () => {
    const saldos = saldosPorDepositoInsumo(entradas, saidas);
    expect(saldos.get(chaveSaldo("d1", "i1"))).toBe(6.9);
    expect(saldos.get(chaveSaldo("d2", "i1"))).toBe(5);
  });

  it("na edição, a própria saída não desconta", () => {
    expect(saldosPorDepositoInsumo(entradas, saidas, "s2").get(chaveSaldo("d1", "i1"))).toBe(9.9);
  });
});
