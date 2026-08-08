import { describe, expect, it } from "vitest";

import {
  agruparLancamentosDaFolha,
  resumoPorCentroCusto,
  resumoPorEncargo,
} from "@/modules/rh/folha/calculo";
import type {
  FolhaDetalhe,
  FolhaItem,
  LancamentoDaFolha,
} from "@/modules/rh/folha/queries";

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
    status: "aprovado",
    encargosPercentual: 20,
    valorBruto: 0,
    valorEncargos: 0,
    valorAdiantamentos: 0,
    valorLiquido: 0,
    custoTotal: 0,
    aprovadoEm: null,
    aprovadoPorNome: null,
    motivoRejeicao: null,
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

function criarLancamento(
  overrides: Partial<LancamentoDaFolha> & { id: string },
): LancamentoDaFolha {
  return {
    tipo: "salario",
    descricao: `Lançamento ${overrides.id}`,
    numero: null,
    valor: 0,
    dataVencimento: null,
    statusParcela: "pendente",
    ...overrides,
  };
}

describe("agruparLancamentosDaFolha", () => {
  it("separa salários de guias e soma cada grupo", () => {
    const lancamentos = [
      criarLancamento({
        id: "1",
        tipo: "salario",
        descricao: "Salario Ana Souza 08/2026",
        valor: 3000,
      }),
      criarLancamento({
        id: "2",
        tipo: "salario",
        descricao: "Salario Bruno Lima 08/2026",
        valor: 2500,
      }),
      criarLancamento({
        id: "3",
        tipo: "guia",
        descricao: "GPS folha 08/2026",
        valor: 1200,
      }),
      criarLancamento({
        id: "4",
        tipo: "guia",
        descricao: "FGTS folha 08/2026",
        valor: 400,
      }),
    ];

    const agrupado = agruparLancamentosDaFolha(lancamentos);

    expect(agrupado.salarios.map((l) => l.id)).toEqual(["1", "2"]);
    expect(agrupado.guias.map((l) => l.id)).toEqual(["4", "3"]); // ordem alfabética: FGTS antes de GPS
    expect(agrupado.totalSalarios).toBe(5500);
    expect(agrupado.totalGuias).toBe(1600);
  });

  it("folha em rascunho ou pendente de aprovação não tem lançamento: lista vazia, sem quebrar", () => {
    const agrupado = agruparLancamentosDaFolha([]);

    expect(agrupado).toEqual({
      salarios: [],
      guias: [],
      totalSalarios: 0,
      totalGuias: 0,
    });
  });

  it("guia sem rateio completo (colaborador sem centro de custo) ainda soma pelo valor cheio do lançamento", () => {
    // docs/decisoes.md: o rateio por centro de custo de uma guia pode somar
    // menos que o valor do lançamento quando algum colaborador não tem centro
    // de custo. LancamentoDaFolha não carrega rateio — só o total do
    // lançamento — então essa lacuna nunca aparece aqui como erro: o grupo
    // "guias" soma o valor do lançamento, ponto.
    const lancamentos = [
      criarLancamento({
        id: "guia-1",
        tipo: "guia",
        descricao: "GPS folha 08/2026",
        valor: 9562.71,
      }),
    ];

    const agrupado = agruparLancamentosDaFolha(lancamentos);

    expect(agrupado.guias).toHaveLength(1);
    expect(agrupado.totalGuias).toBe(9562.71);
    expect(agrupado.salarios).toEqual([]);
  });

  it("só guias, sem nenhum salário (todos os líquidos ficaram <= 0)", () => {
    const lancamentos = [
      criarLancamento({ id: "guia-1", tipo: "guia", valor: 500 }),
    ];

    const agrupado = agruparLancamentosDaFolha(lancamentos);

    expect(agrupado.salarios).toEqual([]);
    expect(agrupado.totalSalarios).toBe(0);
    expect(agrupado.guias).toHaveLength(1);
  });
});
