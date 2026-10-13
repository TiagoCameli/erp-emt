import { describe, expect, it } from "vitest";

import { chaveSaldo, codificarLocal, decodificarLocal, saldosPorDepositoInsumo } from "@/modules/estoque/calculo";

describe("saldo por depósito e insumo", () => {
  const entradas = [
    { local: "d1", insumoId: "i1", quantidade: 10 },
    { local: "d1", insumoId: "i1", quantidade: 0.1 },
    { local: "d2", insumoId: "i1", quantidade: 5 },
  ];
  const saidas = [
    { id: "s1", local: "d1", insumoId: "i1", quantidade: 0.2 },
    { id: "s2", local: "d1", insumoId: "i1", quantidade: 3 },
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

describe("local codificado", () => {
  const ID = "38673fc5-c55a-c7be-8687-e9b1d3589ef1";
  it("ida e volta de depósito e tanque", () => {
    expect(decodificarLocal(codificarLocal("deposito", ID))).toEqual({ depositoId: ID, tanqueId: null });
    expect(decodificarLocal(codificarLocal("tanque", ID))).toEqual({ depositoId: null, tanqueId: ID });
  });
  it("lixo não vira local", () => {
    expect(decodificarLocal("")).toBeNull();
    expect(decodificarLocal(ID)).toBeNull();
    expect(decodificarLocal(`caminhao:${ID}`)).toBeNull();
    expect(decodificarLocal("tanque:123")).toBeNull();
  });
});
