import { describe, expect, it } from "vitest";

import {
  consolidarMensal,
  consolidarPorCarreta,
  consolidarPorEquipamento,
  consolidarPorObra,
  raizDoCentro,
  resumoAlocacoes,
  SEM_ALOCACAO,
  type SaidaRelatorio,
} from "@/modules/combustivel/relatorios/consolidar";

let n = 0;
function saidaRelatorio(parcial: Partial<SaidaRelatorio> = {}): SaidaRelatorio {
  n += 1;
  return {
    id: `s${n}`,
    data: "2026-09-10T15:00:00.000Z",
    origem: "tanque",
    tipoConsumidor: "equipamento_proprio",
    tanqueNome: "Tanque 1",
    equipamentoId: "eq-1",
    equipamentoNome: "EQ-1 Escavadeira",
    transportadoraId: null,
    transportadoraNome: null,
    placa: null,
    motorista: null,
    insumoId: "diesel",
    combustivel: "Diesel S10",
    litros: 100,
    precoCombustivel: 6.3947,
    precoProprietario: null,
    taxaLitro: 0,
    precoUnitario: 6.3947,
    precoMedioTanque: 6.3947,
    valorTotal: 639.47,
    pago: false,
    pagoEm: null,
    medicao: null,
    tipoMedicao: null,
    centroCustoNome: "Manutenção",
    canal: "computador",
    observacoes: null,
    criadoEm: "2026-09-10T15:01:00.000Z",
    alocacoes: [],
    ...parcial,
  };
}

const carreta = (parcial: Partial<SaidaRelatorio> = {}) =>
  saidaRelatorio({
    tipoConsumidor: "carreta_transportadora",
    equipamentoId: null,
    equipamentoNome: null,
    transportadoraId: "t1",
    transportadoraNome: "Transterra",
    placa: "ABC1D23",
    ...parcial,
  });

describe("consolidarMensal", () => {
  it("agrupa por mês de Rio Branco, combustível e consumidor, em 4 casas", () => {
    const linhas = consolidarMensal([
      saidaRelatorio({ litros: 0.1, valorTotal: 0.6395 }),
      saidaRelatorio({ litros: 0.2, valorTotal: 1.2789 }),
      // 01/10 03:00 UTC é 30/09 22:00 em Rio Branco: setembro.
      saidaRelatorio({ data: "2026-10-01T03:00:00.000Z", litros: 1, valorTotal: 1 }),
      saidaRelatorio({ data: "2026-10-01T06:00:00.000Z", litros: 5, valorTotal: 5 }),
      carreta({ litros: 50, valorTotal: 300 }),
      saidaRelatorio({ insumoId: "arla", combustivel: "Arla 32", litros: 20, valorTotal: 80 }),
    ]);
    expect(linhas.map((l) => [l.mes, l.combustivel, l.tipoConsumidor, l.abastecimentos, l.litros, l.valor])).toEqual([
      ["2026-09", "Arla 32", "Equipamento", 1, 20, 80],
      ["2026-09", "Diesel S10", "Carreta de transportadora", 1, 50, 300],
      ["2026-09", "Diesel S10", "Equipamento", 3, 1.3, 2.9184],
      ["2026-10", "Diesel S10", "Equipamento", 1, 5, 5],
    ]);
  });
});

describe("consolidarPorObra", () => {
  it("litros da alocação e custo = percentual × valor, só de equipamento próprio", () => {
    const linhas = consolidarPorObra([
      saidaRelatorio({
        valorTotal: 1000,
        litros: 100,
        alocacoes: [
          { centroRaizId: "o9", centroRaizNome: "Obra 009", percentual: 60, litros: 60 },
          { centroRaizId: "o2", centroRaizNome: "Obra 002", percentual: 40, litros: 40 },
        ],
      }),
      saidaRelatorio({
        valorTotal: 100,
        litros: 10,
        alocacoes: [{ centroRaizId: "o9", centroRaizNome: "Obra 009", percentual: 100, litros: 10 }],
      }),
      carreta({
        valorTotal: 500,
        litros: 80,
        alocacoes: [{ centroRaizId: "o2", centroRaizNome: "Obra 002", percentual: 100, litros: 80 }],
      }),
    ]);
    expect(linhas).toEqual([
      { centro: "Obra 009", abastecimentos: 2, litros: 70, custo: 700 },
      { centro: "Obra 002", abastecimentos: 2, litros: 120, custo: 400 },
    ]);
  });

  it("fatia arredonda em 4 casas antes de somar; sem alocação vai inteira para a linha própria", () => {
    const linhas = consolidarPorObra([
      saidaRelatorio({
        valorTotal: 100,
        alocacoes: [
          { centroRaizId: "a", centroRaizNome: "A", percentual: 33.3333, litros: 33.3333 },
          { centroRaizId: "b", centroRaizNome: "B", percentual: 66.6667, litros: 66.6667 },
        ],
      }),
      saidaRelatorio({ valorTotal: 12.3456, litros: 2 }),
      carreta({ valorTotal: 99, litros: 3 }),
    ]);
    expect(linhas.find((l) => l.centro === "A")?.custo).toBe(33.3333);
    expect(linhas.find((l) => l.centro === "B")?.custo).toBe(66.6667);
    expect(linhas.find((l) => l.centro === SEM_ALOCACAO)).toEqual({
      centro: SEM_ALOCACAO,
      abastecimentos: 2,
      litros: 5,
      custo: 12.3456,
    });
  });

  it("homônimos com ids diferentes são dois centros", () => {
    const linhas = consolidarPorObra([
      saidaRelatorio({ alocacoes: [{ centroRaizId: "x1", centroRaizNome: "Obra", percentual: 100, litros: 1 }] }),
      saidaRelatorio({ alocacoes: [{ centroRaizId: "x2", centroRaizNome: "Obra", percentual: 100, litros: 1 }] }),
    ]);
    expect(linhas).toHaveLength(2);
  });
});

describe("consolidarPorEquipamento e por carreta", () => {
  it("soma por equipamento e mede o rodado pelo medidor mais usado", () => {
    const linhas = consolidarPorEquipamento([
      saidaRelatorio({ litros: 100, valorTotal: 600, medicao: 1200.5, tipoMedicao: "horimetro" }),
      saidaRelatorio({ litros: 50, valorTotal: 310, medicao: 1250, tipoMedicao: "horimetro" }),
      saidaRelatorio({ litros: 10, valorTotal: 60, medicao: 99999, tipoMedicao: "km" }),
      saidaRelatorio({ equipamentoId: "eq-2", equipamentoNome: "EQ-2", litros: 5, valorTotal: 30 }),
      carreta({ litros: 999 }),
    ]);
    expect(linhas).toEqual([
      {
        equipamento: "EQ-1 Escavadeira",
        abastecimentos: 3,
        litros: 160,
        valor: 970,
        medidor: "Horímetro",
        leituraInicial: 1200.5,
        leituraFinal: 1250,
        rodado: 49.5,
      },
      {
        equipamento: "EQ-2",
        abastecimentos: 1,
        litros: 5,
        valor: 30,
        medidor: null,
        leituraInicial: null,
        leituraFinal: null,
        rodado: null,
      },
    ]);
  });

  it("carreta por transportadora e placa normalizada", () => {
    const linhas = consolidarPorCarreta([
      carreta({ placa: "abc-1d23", litros: 10, valorTotal: 60 }),
      carreta({ placa: "ABC1D23", litros: 20, valorTotal: 120 }),
      carreta({ placa: null, litros: 1, valorTotal: 6 }),
      saidaRelatorio(),
    ]);
    expect(linhas.map((l) => [l.transportadora, l.placa, l.abastecimentos, l.litros, l.valor])).toEqual([
      ["Transterra", "ABC1D23", 2, 30, 180],
      ["Transterra", "Sem placa", 1, 1, 6],
    ]);
  });
});

describe("raizDoCentro e resumo da alocação", () => {
  it("sobe até a raiz, e para em ciclo ou pai que sumiu", () => {
    const arvore = new Map([
      ["raiz", { nome: "Obra 009", paiId: null }],
      ["etapa", { nome: "Terraplenagem", paiId: "raiz" }],
      ["item", { nome: "Corte", paiId: "etapa" }],
      ["orfao", { nome: "Órfão", paiId: "sumiu" }],
      ["c1", { nome: "C1", paiId: "c2" }],
      ["c2", { nome: "C2", paiId: "c1" }],
    ]);
    expect(raizDoCentro("item", arvore)).toEqual({ id: "raiz", nome: "Obra 009" });
    expect(raizDoCentro("raiz", arvore)).toEqual({ id: "raiz", nome: "Obra 009" });
    expect(raizDoCentro("orfao", arvore)).toEqual({ id: "orfao", nome: "Órfão" });
    expect(raizDoCentro("c1", arvore)).toEqual({ id: "c2", nome: "C2" });
    expect(raizDoCentro("nao-existe", arvore)).toBeNull();
  });

  it("resumo em uma célula", () => {
    expect(
      resumoAlocacoes([
        { centroRaizId: "a", centroRaizNome: "Obra 009", percentual: 60, litros: 6 },
        { centroRaizId: "b", centroRaizNome: "Obra 002", percentual: 40.5, litros: 4 },
      ]),
    ).toBe("Obra 009 (60%); Obra 002 (40,5%)");
  });
});
