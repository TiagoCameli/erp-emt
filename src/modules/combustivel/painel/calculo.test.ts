import { describe, expect, it } from "vitest";

import { percentualDoTanque, resumirMes, type SaidaPainel } from "@/modules/combustivel/painel/calculo";

const s = (parcial: Partial<SaidaPainel>): SaidaPainel => ({
  tipoConsumidor: "equipamento_proprio",
  equipamentoId: "a",
  insumoId: "diesel",
  litros: 10,
  valorTotal: 60,
  ...parcial,
});

describe("resumirMes", () => {
  it("litros de tudo, custo só do equipamento próprio, em 4 casas sem erro de float", () => {
    const resumo = resumirMes([
      s({ litros: 0.1, valorTotal: 0.6394 }),
      s({ litros: 0.2, valorTotal: 1.2789 }),
      s({ tipoConsumidor: "carreta_transportadora", equipamentoId: null, litros: 100, valorTotal: 640 }),
    ]);
    expect(resumo.abastecimentos).toBe(3);
    expect(resumo.litros).toBe(100.3);
    expect(resumo.custo).toBe(1.9183);
  });

  it("litros por combustível ordenado do maior para o menor, com a carreta junto", () => {
    const resumo = resumirMes([
      s({ insumoId: "gasolina", litros: 5 }),
      s({ insumoId: "diesel", litros: 50 }),
      s({ insumoId: "diesel", tipoConsumidor: "carreta_transportadora", equipamentoId: null, litros: 70 }),
    ]);
    expect(resumo.porCombustivel.map((c) => [c.id, c.litros, c.abastecimentos])).toEqual([
      ["diesel", 120, 2],
      ["gasolina", 5, 1],
    ]);
  });

  it("os maiores consumidores somam por equipamento antes de cortar, e só próprio", () => {
    const saidas = [
      s({ equipamentoId: "b", litros: 30 }),
      ...Array.from({ length: 4 }, () => s({ equipamentoId: "a", litros: 10 })),
      s({ equipamentoId: "c", litros: 5 }),
      s({ tipoConsumidor: "carreta_transportadora", equipamentoId: null, litros: 999 }),
    ];
    const resumo = resumirMes(saidas, 2);
    expect(resumo.maioresConsumidores.map((e) => [e.id, e.litros])).toEqual([
      ["a", 40],
      ["b", 30],
    ]);
  });

  it("empate desempata pelo id; mês vazio dá zeros", () => {
    const resumo = resumirMes([s({ equipamentoId: "z" }), s({ equipamentoId: "m" })]);
    expect(resumo.maioresConsumidores.map((e) => e.id)).toEqual(["m", "z"]);
    expect(resumirMes([])).toEqual({ abastecimentos: 0, litros: 0, custo: 0, porCombustivel: [], maioresConsumidores: [] });
  });
});

describe("percentualDoTanque", () => {
  it("uma casa, e null sem capacidade", () => {
    expect(percentualDoTanque(1234.5678, 5000)).toBe(24.7);
    expect(percentualDoTanque(0, 5000)).toBe(0);
    expect(percentualDoTanque(10, 0)).toBeNull();
    expect(percentualDoTanque(6000, 5000)).toBe(120);
  });
});
