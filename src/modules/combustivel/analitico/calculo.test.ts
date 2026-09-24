import { describe, expect, it } from "vitest";

import {
  chipDeContagem,
  ID_NAO_IDENTIFICADO,
  kpisConsumidores,
  kpisFornecedores,
  kpisObras,
  porDia,
  rankingConsumidores,
  rankingFornecedores,
  rankingObras,
  temPontosDeTendencia,
  type EntradaAnalitica,
} from "@/modules/combustivel/analitico/calculo";
import { EQUIPAMENTO_DESCONHECIDO, type SaidaBase } from "@/modules/combustivel/anomalias/base";

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

function entrada(parcial: Partial<EntradaAnalitica> = {}): EntradaAnalitica {
  n += 1;
  return {
    id: `e${n}`,
    data: "2026-09-10T08:00:00",
    tanqueId: "t1",
    insumoId: "diesel",
    fornecedorId: "f1",
    fornecedorNome: "Posto A",
    litros: 1000,
    valorTotal: 6000,
    ...parcial,
  };
}

describe("porDia (bucketByDia da origem)", () => {
  it("um valor por dia do período, zero no dia sem dado, fora do período ignorado", () => {
    const serie = porDia(
      [
        { d: "2026-09-01T23:59:00", v: 1.1 },
        { d: "2026-09-01T00:00:00", v: 0.2 },
        { d: "2026-09-03T10:00:00", v: 5 },
        { d: "2026-08-31T10:00:00", v: 99 },
        { d: "2026-09-04T00:00:00", v: 99 },
      ],
      (x) => x.d,
      (x) => x.v,
      "2026-09-01",
      "2026-09-03",
    );
    expect(serie).toEqual([1.3, 0, 5]);
  });

  it("atravessa a virada de mês", () => {
    expect(porDia([], (x: { d: string }) => x.d, () => 0, "2026-02-27", "2026-03-02")).toHaveLength(4);
  });

  it("tendência precisa de 4 dias com valor, como a origem", () => {
    expect(temPontosDeTendencia([1, 0, 2, 0, 3])).toBe(false);
    expect(temPontosDeTendencia([1, 0, 2, 3, 4])).toBe(true);
  });
});

describe("chip de contagem (override da origem com base < 5)", () => {
  it("base pequena com diferença mostra o absoluto", () => {
    expect(chipDeContagem(3, 1)).toEqual({ tipo: "absoluto", valor: 2 });
    expect(chipDeContagem(0, 2)).toEqual({ tipo: "absoluto", valor: -2 });
  });
  it("base pequena sem diferença e base grande mostram o %", () => {
    expect(chipDeContagem(2, 2)).toEqual({ tipo: "percentual", valor: 0 });
    expect(chipDeContagem(12, 10)).toEqual({ tipo: "percentual", valor: 20 });
  });
});

describe("Equipamentos (KpisRowConsumidores e ConsumidoresRankingTable)", () => {
  const atuais = [
    saida({ equipamentoId: "eq-1", litros: 100.1, valorTotal: 640.1, data: "2026-09-01T08:00:00" }),
    saida({ equipamentoId: "eq-1", litros: 0.2, valorTotal: 1.3, data: "2026-09-02T08:00:00" }),
    saida({ equipamentoId: "eq-2", litros: 50, valorTotal: 320, data: "2026-09-02T09:00:00" }),
    saida({ equipamentoId: EQUIPAMENTO_DESCONHECIDO, litros: 200, valorTotal: 1200, data: "2026-09-03T09:00:00" }),
    saida({ equipamentoId: null, litros: 7, valorTotal: 42, data: "2026-09-03T10:00:00" }),
  ];
  const anteriores = [saida({ equipamentoId: "eq-1", litros: 100, valorTotal: 600 })];

  it("volume e custo somam TODAS as saídas do recorte; ativos sem o sentinela; +N sem ID", () => {
    const k = kpisConsumidores(atuais, anteriores, "proprios", "2026-09-01", "2026-09-03");
    expect(k.volume).toBe(357.3);
    expect(k.custo).toBe(2203.4);
    expect(k.qtdConsumidores).toBe(2);
    expect(k.qtdSentinela).toBe(1);
    expect(k.qtdConsumidoresAnt).toBe(1);
    expect(k.chipConsumidores).toEqual({ tipo: "absoluto", valor: 1 });
    expect(k.deltaVolume).toBeCloseTo(257.3, 6);
    expect(k.sparkVolume).toEqual([100.1, 50.2, 207]);
  });

  it("o top pode ser o grupo Não identificado (a origem pinta de âmbar)", () => {
    const k = kpisConsumidores(atuais, [], "proprios", "2026-09-01", "2026-09-03");
    expect(k.topChave).toBe(ID_NAO_IDENTIFICADO);
    expect(k.topLitros).toBe(200);
    expect(k.topPct).toBeCloseTo((200 / 357.3) * 100, 6);
  });

  it("no empate do top fica o primeiro que apareceu", () => {
    const k = kpisConsumidores(
      [saida({ equipamentoId: "b", litros: 10 }), saida({ equipamentoId: "a", litros: 10 })],
      [],
      "proprios",
      "2026-09-10",
      "2026-09-10",
    );
    expect(k.topChave).toBe("b");
  });

  it("ranking: todos, mais litros primeiro, % sobre os litros com consumidor, R$/L = custo ÷ litros", () => {
    const linhas = rankingConsumidores(atuais, "proprios", "2026-09-01", "2026-09-03");
    expect(linhas.map((l) => l.id)).toEqual([ID_NAO_IDENTIFICADO, "eq-1", "eq-2"]);
    const eq1 = linhas[1]!;
    expect(eq1.litros).toBe(100.3);
    expect(eq1.custo).toBe(641.4);
    expect(eq1.rPorL).toBeCloseTo(641.4 / 100.3, 10);
    expect(eq1.qtdSaidas).toBe(2);
    // A saída sem equipamento (null) sai do ranking E do denominador.
    expect(eq1.pctTotal).toBeCloseTo((100.3 / 350.3) * 100, 10);
    expect(linhas[0]!.sentinela).toBe(true);
    expect(linhas.reduce((s, l) => s + l.pctTotal, 0)).toBeCloseTo(100, 10);
  });

  it("carretas: agrupa pela placa (sem espaço), meta = transportadora da primeira saída que tem uma", () => {
    const carretas = [
      saida({ tipoConsumidor: "carreta_transportadora", equipamentoId: null, placa: " ABC1D23 ", transportadoraId: null, litros: 10 }),
      saida({ tipoConsumidor: "carreta_transportadora", equipamentoId: null, placa: "ABC1D23", transportadoraId: "tr-1", litros: 20 }),
      saida({ tipoConsumidor: "carreta_transportadora", equipamentoId: null, placa: "XYZ9K88", transportadoraId: "tr-2", litros: 40 }),
      saida({ tipoConsumidor: "carreta_transportadora", equipamentoId: null, placa: "  ", litros: 5 }),
    ];
    const linhas = rankingConsumidores(carretas, "carretas", "2026-09-10", "2026-09-10");
    expect(linhas.map((l) => [l.id, l.litros, l.transportadoraId])).toEqual([
      ["XYZ9K88", 40, "tr-2"],
      ["ABC1D23", 30, "tr-1"],
    ]);
    const k = kpisConsumidores(carretas, [], "carretas", "2026-09-10", "2026-09-10");
    expect(k.qtdConsumidores).toBe(2);
    expect(k.qtdSentinela).toBe(0);
    expect(k.volume).toBe(75);
  });
});

describe("Obras (KpisRowObras e ObrasRankingTable)", () => {
  const atuais = [
    saida({ obraId: "o1", equipamentoId: "eq-1", litros: 100, valorTotal: 600 }),
    saida({ obraId: "o1", equipamentoId: "eq-1", litros: 50, valorTotal: 310 }),
    saida({ obraId: "o1", equipamentoId: EQUIPAMENTO_DESCONHECIDO, litros: 10, valorTotal: 60 }),
    saida({ obraId: "o2", equipamentoId: "eq-2", litros: 200, valorTotal: 1200 }),
    saida({ obraId: null, equipamentoId: "eq-3", litros: 40, valorTotal: 240 }),
  ];

  it("volume/custo contam a saída sem obra; obras ativas e top só com obra", () => {
    const k = kpisObras(atuais, [saida({ obraId: "o1" })], "2026-09-10", "2026-09-10");
    expect(k.volume).toBe(400);
    expect(k.custo).toBe(2410);
    expect(k.qtdObras).toBe(2);
    expect(k.topObraId).toBe("o2");
    expect(k.topPct).toBe(50);
    expect(k.chipObras).toEqual({ tipo: "absoluto", valor: 1 });
  });

  it("ranking: equipamentos distintos sem o sentinela, % sobre os litros COM obra", () => {
    const linhas = rankingObras(atuais, "2026-09-10", "2026-09-10");
    expect(linhas.map((l) => [l.id, l.litros, l.qtdEquipamentos])).toEqual([
      ["o2", 200, 1],
      ["o1", 160, 1],
    ]);
    expect(linhas[1]!.pctTotal).toBeCloseTo((160 / 360) * 100, 10);
    expect(linhas[1]!.rPorL).toBeCloseTo(970 / 160, 10);
  });
});

describe("Fornecedores (KpisRowFornecedores e FornecedoresRankingTable)", () => {
  const atuais = [
    entrada({ fornecedorId: "f1", litros: 1000, valorTotal: 6000, data: "2026-09-01T08:00:00" }),
    entrada({ fornecedorId: "f1", litros: 1000, valorTotal: 6200, data: "2026-09-02T08:00:00" }),
    entrada({ fornecedorId: "f2", litros: 500, valorTotal: 2950, data: "2026-09-02T09:00:00" }),
    entrada({ fornecedorId: null, litros: 100, valorTotal: 700, data: "2026-09-03T09:00:00" }),
    entrada({ fornecedorId: "f3", litros: 0, valorTotal: 0, data: "2026-09-03T09:00:00" }),
  ];

  it("melhor preço = menor R$/L PONDERADO, não a entrada mais barata", () => {
    const k = kpisFornecedores(
      [
        entrada({ fornecedorId: "a", litros: 10, valorTotal: 50 }), // 5,00
        entrada({ fornecedorId: "a", litros: 1000, valorTotal: 7000 }), // ponderado ≈ 6,98
        entrada({ fornecedorId: "b", litros: 100, valorTotal: 600 }), // 6,00
      ],
      [],
      "2026-09-10",
      "2026-09-10",
    );
    expect(k.melhorFornecedorId).toBe("b");
    expect(k.melhorRPorL).toBe(6);
  });

  it("com um fornecedor só, sem melhor preço", () => {
    const k = kpisFornecedores([entrada({ fornecedorId: "a" })], [], "2026-09-10", "2026-09-10");
    expect(k.qtdFornecedores).toBe(1);
    expect(k.melhorFornecedorId).toBeNull();
    expect(k.melhorRPorL).toBeNull();
  });

  it("volume e custo contam a entrada sem fornecedor; ativos, não", () => {
    const k = kpisFornecedores(atuais, [entrada({ fornecedorId: "f1" })], "2026-09-01", "2026-09-03");
    expect(k.volume).toBe(2600);
    expect(k.custo).toBe(15850);
    expect(k.qtdFornecedores).toBe(3);
    expect(k.chipFornecedores).toEqual({ tipo: "absoluto", valor: 2 });
  });

  it("ranking: mín/médio/máx de R$/L, compras, % dos litros com fornecedor, tendência só dos dias com compra", () => {
    const linhas = rankingFornecedores(atuais, "2026-09-01", "2026-09-03");
    expect(linhas.map((l) => l.id)).toEqual(["f1", "f2", "f3"]);
    const f1 = linhas[0]!;
    expect(f1.qtdCompras).toBe(2);
    expect(f1.rPorLMin).toBe(6);
    expect(f1.rPorLMax).toBe(6.2);
    expect(f1.rPorLMedio).toBe(6.1);
    expect(f1.pctTotal).toBeCloseTo((2000 / 2500) * 100, 10);
    expect(f1.spark).toEqual([6, 6.2]);
    // Entrada de 0 L não entra no mín/máx: sem nenhum preço, 0 (a tela mostra "—").
    expect(linhas[2]!.rPorLMin).toBe(0);
    expect(linhas[2]!.rPorLMedio).toBe(0);
  });
});
