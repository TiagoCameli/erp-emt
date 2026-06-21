import { describe, expect, it } from "vitest";

import {
  avancoPercentual,
  calcularMargem,
  grupoDoConsumo,
  grupoDoLancamento,
  resolverObraPorCentroCusto,
  type NoCentroCusto,
} from "@/modules/gestao/_shared/calculo";

describe("resolverObraPorCentroCusto", () => {
  it("resolve a obra subindo a árvore até a raiz", () => {
    // raiz (obra A) -> etapa -> item, com obra_id só na raiz
    const nos: NoCentroCusto[] = [
      { id: "raiz", paiId: null, obraId: "obraA" },
      { id: "etapa", paiId: "raiz", obraId: null },
      { id: "item", paiId: "etapa", obraId: null },
      { id: "manut", paiId: null, obraId: null }, // Manutenção: sem obra
    ];
    const mapa = resolverObraPorCentroCusto(nos);
    expect(mapa.get("raiz")).toBe("obraA");
    expect(mapa.get("etapa")).toBe("obraA");
    expect(mapa.get("item")).toBe("obraA");
    expect(mapa.get("manut")).toBeNull();
  });

  it("não entra em loop com ciclo de pai", () => {
    const nos: NoCentroCusto[] = [
      { id: "x", paiId: "y", obraId: null },
      { id: "y", paiId: "x", obraId: null },
    ];
    const mapa = resolverObraPorCentroCusto(nos);
    expect(mapa.get("x")).toBeNull();
    expect(mapa.get("y")).toBeNull();
  });
});

describe("grupoDoConsumo", () => {
  it("mapeia categoria do insumo para o grupo", () => {
    expect(grupoDoConsumo("combustivel")).toBe("combustivel");
    expect(grupoDoConsumo("peca")).toBe("manutencao");
    expect(grupoDoConsumo("material")).toBe("material");
    expect(grupoDoConsumo(null)).toBe("material");
  });
});

describe("grupoDoLancamento (sem dupla contagem)", () => {
  it("os->manutencao, diaria->folha, manual->servicos", () => {
    expect(grupoDoLancamento("os")).toBe("manutencao");
    expect(grupoDoLancamento("diaria")).toBe("folha");
    expect(grupoDoLancamento("manual")).toBe("servicos");
  });

  it("oc (compra) e fatura (receita) NÃO são custo", () => {
    expect(grupoDoLancamento("oc")).toBeNull();
    expect(grupoDoLancamento("fatura")).toBeNull();
  });
});

describe("calcularMargem", () => {
  it("margem = medido - custo, com % sobre o medido", () => {
    const r = calcularMargem(100000, 70000);
    expect(r.margem).toBe(30000);
    expect(r.margemPct).toBe(30);
  });

  it("margem negativa (obra no prejuízo)", () => {
    const r = calcularMargem(50000, 60000);
    expect(r.margem).toBe(-10000);
    expect(r.margemPct).toBe(-20);
  });

  it("medido zero não divide por zero", () => {
    const r = calcularMargem(0, 5000);
    expect(r.margem).toBe(-5000);
    expect(r.margemPct).toBe(0);
  });
});

describe("avancoPercentual", () => {
  it("medido sobre contratual", () => {
    expect(avancoPercentual(25000, 100000)).toBe(25);
    expect(avancoPercentual(10000, 0)).toBe(0);
  });
});
