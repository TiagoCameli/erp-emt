import { describe, expect, it } from "vitest";

import { resumoPorCentroCusto, resumoPorEncargo } from "@/modules/rh/folha/calculo";
import type { FolhaDetalhe, FolhaItem } from "@/modules/rh/folha/queries";

function criarItem(overrides: Partial<FolhaItem> & { id: string }): FolhaItem {
  return {
    colaboradorId: `colab-${overrides.id}`,
    colaboradorNome: `Colaborador ${overrides.id}`,
    colaboradorFuncao: null,
    centroCustoId: null,
    centroCustoNome: null,
    centroCustoCodigo: null,
    salarioBase: 0,
    horasNormais: 0,
    horasExtras: 0,
    valorExtras: 0,
    inss: 0,
    irrf: 0,
    encargos: 0,
    encargosDetalhe: [],
    adiantamentos: 0,
    custoTotal: 0,
    valorLiquido: 0,
    ...overrides,
  };
}

function criarFolha(itens: FolhaItem[]): FolhaDetalhe {
  return {
    id: "folha-1",
    competencia: "2026-06",
    status: "fechada",
    encargosPercentual: 20,
    valorBruto: 0,
    valorEncargos: 0,
    valorAdiantamentos: 0,
    valorLiquido: 0,
    custoTotal: 0,
    dataFechamento: null,
    itens,
  };
}

describe("resumoPorCentroCusto", () => {
  it("agrupa e soma o custo total por centro de custo", () => {
    const folha = criarFolha([
      criarItem({
        id: "1",
        centroCustoId: "cc-obra",
        centroCustoNome: "Obra BR-364",
        centroCustoCodigo: "001",
        custoTotal: 1000,
      }),
      criarItem({
        id: "2",
        centroCustoId: "cc-obra",
        centroCustoNome: "Obra BR-364",
        centroCustoCodigo: "001",
        custoTotal: 500,
      }),
      criarItem({
        id: "3",
        centroCustoId: "cc-escritorio",
        centroCustoNome: "Escritório Central",
        centroCustoCodigo: "002",
        custoTotal: 2000,
      }),
    ]);

    const resumo = resumoPorCentroCusto(folha);

    expect(resumo).toEqual([
      {
        centroCustoId: "cc-escritorio",
        centroCustoNome: "Escritório Central",
        centroCustoCodigo: "002",
        custoTotal: 2000,
      },
      {
        centroCustoId: "cc-obra",
        centroCustoNome: "Obra BR-364",
        centroCustoCodigo: "001",
        custoTotal: 1500,
      },
    ]);
  });

  it("agrupa itens sem centro de custo num único grupo", () => {
    const folha = criarFolha([
      criarItem({ id: "1", centroCustoId: null, custoTotal: 300 }),
      criarItem({ id: "2", centroCustoId: null, custoTotal: 200 }),
    ]);

    const resumo = resumoPorCentroCusto(folha);

    expect(resumo).toEqual([
      {
        centroCustoId: null,
        centroCustoNome: null,
        centroCustoCodigo: null,
        custoTotal: 500,
      },
    ]);
  });

  it("a soma dos grupos bate com o custo_total da folha", () => {
    const folha = criarFolha([
      criarItem({ id: "1", centroCustoId: "cc-a", custoTotal: 123.45 }),
      criarItem({ id: "2", centroCustoId: "cc-b", custoTotal: 678.9 }),
    ]);

    const resumo = resumoPorCentroCusto(folha);
    const somaGrupos = resumo.reduce((acc, g) => acc + g.custoTotal, 0);

    expect(somaGrupos).toBeCloseTo(123.45 + 678.9, 2);
  });
});

describe("resumoPorEncargo", () => {
  it("soma o valor de cada encargo entre todos os itens", () => {
    const folha = criarFolha([
      criarItem({
        id: "1",
        encargosDetalhe: [
          { nome: "FGTS", valor: 80 },
          { nome: "INSS patronal", valor: 200 },
        ],
      }),
      criarItem({
        id: "2",
        encargosDetalhe: [
          { nome: "FGTS", valor: 40 },
          { nome: "INSS patronal", valor: 100 },
        ],
      }),
    ]);

    const resumo = resumoPorEncargo(folha);

    expect(resumo).toEqual([
      { nome: "FGTS", total: 120 },
      { nome: "INSS patronal", total: 300 },
    ]);
  });

  it("retorna lista vazia para folhas antigas sem quebra de encargos", () => {
    const folha = criarFolha([
      criarItem({ id: "1", encargosDetalhe: [], encargos: 150 }),
    ]);

    expect(resumoPorEncargo(folha)).toEqual([]);
  });

  it("a soma dos encargos bate com o valor_encargos da folha", () => {
    const folha = criarFolha([
      criarItem({
        id: "1",
        encargosDetalhe: [
          { nome: "FGTS", valor: 80 },
          { nome: "INSS patronal", valor: 200 },
        ],
      }),
      criarItem({
        id: "2",
        encargosDetalhe: [{ nome: "FGTS", valor: 40 }],
      }),
    ]);
    folha.valorEncargos = 320;

    const resumo = resumoPorEncargo(folha);
    const somaEncargos = resumo.reduce((acc, e) => acc + e.total, 0);

    expect(somaEncargos).toBe(folha.valorEncargos);
  });
});
