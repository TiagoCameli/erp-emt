import { describe, expect, it } from "vitest";

import { EQUIPAMENTO_DESCONHECIDO, type SaidaBase } from "@/modules/combustivel/anomalias/base";
import {
  consolidarCompras,
  consolidarMensal,
  consolidarPorEquipamento,
  consolidarPorObra,
  consumidorDaSaida,
  rPorLDaSaida,
  type CadastrosRelatorio,
  type EntradaRelatorio,
} from "@/modules/combustivel/relatorios/consolidar";

/**
 * As contas dos relatórios da origem (mensalConsolidadoExport, porObraExport,
 * porEquipamentoExport), com as regras de lá: custo = valor total da saída (próprio e
 * carreta), obra leva a saída inteira, sentinela fora do top e contado à parte, carreta
 * pela placa aparada, tops de 10.
 */

let n = 0;
function saida(parcial: Partial<SaidaBase> = {}): SaidaBase {
  n += 1;
  return {
    id: `s${n}`,
    data: "2026-09-10T08:00:00",
    instante: "2026-09-10T13:00:00Z",
    tipoConsumidor: "equipamento_proprio",
    equipamentoId: "eq-1",
    equipamentoIdReal: "eq-1",
    placa: null,
    obraId: "obra-1",
    tipoCombustivel: "diesel",
    litros: 100,
    valorTotal: 600,
    origem: "tanque",
    tanqueId: "t1",
    transportadoraId: null,
    motorista: null,
    precoUnitario: 6,
    pago: false,
    pagoEm: null,
    observacoes: null,
    createdBy: null,
    ...parcial,
  };
}

function entrada(parcial: Partial<EntradaRelatorio> = {}): EntradaRelatorio {
  return {
    id: "e1",
    dataHora: "2026-09-05T10:00:00",
    tanqueId: "t1",
    tipoCombustivel: "diesel",
    litros: 5000,
    valorTotal: 31973.5,
    fornecedor: "Posto Progresso",
    notaFiscal: "123",
    observacoes: null,
    createdBy: null,
    ...parcial,
  };
}

const CADASTROS: CadastrosRelatorio = {
  equipamentos: new Map([
    ["eq-1", { descricao: "Escavadeira 320", codigo: "EQ-01", tipo: "Escavadeira" }],
    ["eq-2", { descricao: "Rolo", codigo: null, tipo: "Compactador" }],
  ]),
  transportadoraNome: new Map([["tr-1", "Transterra"]]),
  obraNome: new Map([
    ["obra-1", "Obra 009"],
    ["obra-2", "Obra 002"],
  ]),
};

const carreta = (placa: string, extra: Partial<SaidaBase> = {}) =>
  saida({ tipoConsumidor: "carreta_transportadora", equipamentoId: null, equipamentoIdReal: null, placa, transportadoraId: "tr-1", ...extra });

describe("Mensal consolidado", () => {
  it("totais somam próprios e carretas; sentinela fora do top e contado à parte", () => {
    const saidas = [
      saida({ litros: 100.1, valorTotal: 640.1 }),
      saida({ litros: 0.2, valorTotal: 1.3 }),
      saida({ equipamentoId: EQUIPAMENTO_DESCONHECIDO, litros: 50, valorTotal: 300 }),
      carreta(" ABC1D23 ", { litros: 200, valorTotal: 1300, obraId: "obra-2" }),
      carreta("", { litros: 10, valorTotal: 60, obraId: null }),
    ];
    const d = consolidarMensal(saidas, [entrada()], CADASTROS);
    expect(d.totais).toMatchObject({
      volume: 360.3,
      custo: 2301.4,
      qtdSaidas: 5,
      qtdEquipamentosProprios: 1,
      qtdSentinel: 1,
      qtdCarretas: 1,
      qtdObras: 2,
      volumeCompras: 5000,
      custoCompras: 31973.5,
      qtdFornecedores: 1,
    });
    expect(d.totais.rPorL).toBeCloseTo(2301.4 / 360.3, 12);
    expect(d.topEquipamentos).toEqual([
      { nome: "Escavadeira 320", codigo: "EQ-01", litros: 100.3, custo: 641.4, qtd: 2, rPorL: 641.4 / 100.3 },
    ]);
    expect(d.topCarretas).toEqual([
      { nome: "ABC1D23", placa: "ABC1D23", transportadora: "Transterra", litros: 200, custo: 1300, qtd: 1, rPorL: 6.5 },
    ]);
  });

  it("obras: a saída inteira (carreta também) na obra dela, top 10 por CUSTO", () => {
    const saidas = [
      saida({ obraId: "obra-1", litros: 300, valorTotal: 1000 }),
      carreta("XYZ9A99", { obraId: "obra-2", litros: 100, valorTotal: 2000 }),
    ];
    const d = consolidarMensal(saidas, [], CADASTROS);
    expect(d.topObras.map((o) => [o.nome, o.custo, o.litros])).toEqual([
      ["Obra 002", 2000, 100],
      ["Obra 009", 1000, 300],
    ]);
  });

  it("top de 10 equipamentos por litros, somando antes de cortar", () => {
    const saidas = Array.from({ length: 12 }, (_, i) =>
      saida({ equipamentoId: `eq-x${i}`, equipamentoIdReal: `eq-x${i}`, litros: 10 + i }),
    );
    const d = consolidarMensal(saidas, [], CADASTROS);
    expect(d.topEquipamentos).toHaveLength(10);
    expect(d.topEquipamentos[0]!.litros).toBe(21);
    // Equipamento sem cadastro mostra o id, como na origem.
    expect(d.topEquipamentos[0]!.nome).toBe("eq-x11");
  });
});

describe("compras (entradas)", () => {
  it("fornecedores pelo nome aparado, todos, por litros; sem fornecedor fica fora da lista mas entra no total", () => {
    const c = consolidarCompras([
      entrada({ fornecedor: " Posto A ", litros: 100, valorTotal: 600 }),
      entrada({ fornecedor: "Posto A", litros: 50, valorTotal: 310 }),
      entrada({ fornecedor: "Posto B", litros: 300, valorTotal: 1800 }),
      entrada({ fornecedor: "", litros: 10, valorTotal: 60 }),
    ]);
    expect(c.volumeCompras).toBe(460);
    expect(c.custoCompras).toBe(2770);
    expect(c.qtdFornecedores).toBe(2);
    expect(c.fornecedores.map((f) => [f.nome, f.litros, f.custo, f.qtd])).toEqual([
      ["Posto B", 300, 1800, 1],
      ["Posto A", 150, 910, 2],
    ]);
  });
});

describe("Por obra", () => {
  it("saídas da obra (próprios e carretas), da mais recente para a mais antiga", () => {
    const antiga = saida({ data: "2026-09-01T08:00:00" });
    const nova = carreta("ABC1D23", { data: "2026-09-20T08:00:00" });
    const d = consolidarPorObra([antiga, nova], [], CADASTROS);
    expect(d.saidasDesc.map((s) => s.id)).toEqual([nova.id, antiga.id]);
    expect(d.totais).toMatchObject({ qtdSaidas: 2, qtdEquipamentos: 1, qtdCarretas: 1, volume: 200, custo: 1200 });
  });
});

describe("Por equipamento", () => {
  it("dias ativos pelo dia do relógio de parede e obras frequentes por LITROS", () => {
    const d = consolidarPorEquipamento(
      [
        saida({ data: "2026-09-01T08:00:00", obraId: "obra-1", litros: 100, valorTotal: 900 }),
        saida({ data: "2026-09-01T17:00:00", obraId: "obra-2", litros: 300, valorTotal: 100 }),
        saida({ data: "2026-09-03T08:00:00", obraId: null }),
      ],
      [],
      CADASTROS,
    );
    expect(d.totais.diasAtivos).toBe(2);
    expect(d.totais.qtdObras).toBe(2);
    expect(d.topObras.map((o) => o.nome)).toEqual(["Obra 002", "Obra 009"]);
  });
});

describe("rótulos das linhas", () => {
  it("consumidor como na origem e R$/L = valor ÷ litros", () => {
    expect(consumidorDaSaida(saida(), CADASTROS)).toBe("EQ-01 · Escavadeira 320");
    expect(consumidorDaSaida(saida({ equipamentoId: "eq-2" }), CADASTROS)).toBe("Compactador · Rolo");
    expect(consumidorDaSaida(saida({ equipamentoId: EQUIPAMENTO_DESCONHECIDO }), CADASTROS)).toBe("Não identificado");
    expect(consumidorDaSaida(carreta("ABC1D23"), CADASTROS)).toBe("ABC1D23 · Transterra");
    expect(rPorLDaSaida({ litros: 0, valorTotal: 10 })).toBe(0);
    expect(rPorLDaSaida({ litros: 100, valorTotal: 639.47 })).toBeCloseTo(6.3947, 10);
  });
});
