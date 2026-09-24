import { describe, expect, it } from "vitest";

import { EQUIPAMENTO_DESCONHECIDO, type SaidaBase } from "@/modules/combustivel/anomalias/base";
import {
  autoGranularidade,
  calcularKpis,
  custoPorObra,
  evolucaoNasTresGranularidades,
  evolucaoTemporal,
  heatmapDiaHora,
  ID_NAO_IDENTIFICADO,
  ID_SEM_OBRA,
  inicioDaSemana,
  mixCombustivel,
  niceMax,
  pctChange,
  percentualDoTanque,
  periodoAnterior,
  precoPorFornecedor,
  serieDiaria,
  sparksDosKpis,
  sparkVisivel,
  tendencia,
  topConsumidores,
  ultimasSaidas,
} from "@/modules/combustivel/painel/calculo";

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
    valorTotal: 639.47,
    origem: "tanque",
    tanqueId: "t1",
    transportadoraId: null,
    motorista: null,
    precoUnitario: 6.3947,
    pago: false,
    pagoEm: null,
    observacoes: null,
    createdBy: null,
    ...parcial,
  };
}

describe("KPIs da Visão Geral da origem", () => {
  it("volume, custo, R$/L = custo ÷ volume, consumidores sem o sentinela e o maior", () => {
    const atuais = [
      saida({ equipamentoId: "eq-1", litros: 100.1, valorTotal: 640.1 }),
      saida({ equipamentoId: "eq-1", litros: 0.2, valorTotal: 1.3 }),
      saida({ equipamentoId: "eq-2", litros: 50, valorTotal: 320 }),
      saida({ equipamentoId: EQUIPAMENTO_DESCONHECIDO, litros: 300, valorTotal: 1900 }),
    ];
    const k = calcularKpis(atuais, [], "proprios");
    // soma exata (em float, 100.1 + 0.2 dá 100.30000000000001)
    expect(k.volume).toBe(450.3);
    expect(k.custo).toBe(2861.4);
    expect(k.rPorL).toBeCloseTo(2861.4 / 450.3, 12);
    expect(k.qtdConsumidores).toBe(2);
    // O sentinela não é "maior equipamento" mesmo com mais litros.
    expect(k.maiorChave).toBe("eq-1");
    expect(k.maiorLitros).toBe(100.3);
    expect(k.maiorPct).toBeCloseTo((100.3 / 450.3) * 100, 10);
    expect(k.qtdSentinela).toBe(1);
    expect(k.volumeSentinela).toBe(300);
  });

  it("carretas: consumidor é a placa aparada; deltas contra o período anterior", () => {
    const carreta = { tipoConsumidor: "carreta_transportadora", equipamentoId: null } as const;
    const atuais = [saida({ ...carreta, placa: " ABC1D23 " }), saida({ ...carreta, placa: "ABC1D23" }), saida({ ...carreta, placa: "" })];
    const anteriores = [saida({ ...carreta, placa: "XYZ9A99", litros: 150, valorTotal: 959.2 })];
    const k = calcularKpis(atuais, anteriores, "carretas");
    expect(k.qtdConsumidores).toBe(1);
    expect(k.maiorChave).toBe("ABC1D23");
    expect(k.deltaVolume).toBeCloseTo(((300 - 150) / 150) * 100, 10);
    expect(k.qtdSaidasAnt).toBe(1);
    expect(k.diffConsumidores).toBe(0);
  });

  it("pctChange e a troca para diferença absoluta com base anterior pequena (pickTrend)", () => {
    expect(pctChange(10, 0)).toBe(100);
    expect(pctChange(0, 0)).toBe(0);
    expect(pctChange(150, 100)).toBe(50);
    expect(tendencia(100, 1, 3)).toEqual({ tipo: "absoluto", valor: 3 });
    expect(tendencia(25, 8, 2)).toEqual({ tipo: "percentual", valor: 25 });
    expect(tendencia(0, 1, 0)).toEqual({ tipo: "percentual", valor: 0 });
  });

  it("período anterior de mesma duração terminando na véspera", () => {
    expect(periodoAnterior("2026-09-01", "2026-09-30")).toEqual({ de: "2026-08-02", ate: "2026-08-31" });
    expect(periodoAnterior("2026-03-01", "2026-03-01")).toEqual({ de: "2026-02-28", ate: "2026-02-28" });
  });
});

describe("quadros da Visão Geral", () => {
  it("mix por combustível em litros, maior primeiro, com % dos litros", () => {
    const mix = mixCombustivel([
      saida({ tipoCombustivel: "gasolina", litros: 25 }),
      saida({ tipoCombustivel: "diesel", litros: 75 }),
    ]);
    expect(mix.map((l) => [l.id, l.litros, l.pct])).toEqual([
      ["diesel", 75, 75],
      ["gasolina", 25, 25],
    ]);
  });

  it("top equipamentos soma antes de cortar e mostra o sentinela como 'Não identificado'", () => {
    const muitasPequenas = Array.from({ length: 5 }, () => saida({ equipamentoId: "eq-muitas", litros: 30 }));
    const top = topConsumidores(
      [...muitasPequenas, saida({ equipamentoId: "eq-uma", litros: 100 }), saida({ equipamentoId: EQUIPAMENTO_DESCONHECIDO, litros: 60 })],
      "proprios",
      2,
    );
    expect(top.map((l) => [l.id, l.litros, l.qtd])).toEqual([
      ["eq-muitas", 150, 5],
      ["eq-uma", 100, 1],
    ]);
    expect(topConsumidores([saida({ equipamentoId: EQUIPAMENTO_DESCONHECIDO })], "proprios")[0]!.id).toBe(ID_NAO_IDENTIFICADO);
  });

  it("custo por obra: a saída inteira na obra dela, 'Sem obra' quando não tem, maior custo primeiro", () => {
    const linhas = custoPorObra([
      saida({ obraId: "obra-1", valorTotal: 100 }),
      saida({ obraId: null, valorTotal: 300 }),
      saida({ obraId: "obra-1", valorTotal: 100 }),
    ]);
    expect(linhas.map((l) => [l.id, l.custo, l.pct])).toEqual([
      [ID_SEM_OBRA, 300, 60],
      ["obra-1", 200, 40],
    ]);
  });

  it("ocupação do tanque", () => {
    expect(percentualDoTanque(1500, 3000)).toBe(50);
    expect(percentualDoTanque(1, 3)).toBe(33.3);
    expect(percentualDoTanque(10, 0)).toBeNull();
  });
});

describe("sparklines dos KPIs (bucketByDia da origem)", () => {
  it("um valor por dia do período, zero no dia sem saída, dia do relógio de parede", () => {
    const serie = serieDiaria(
      [
        saida({ data: "2026-09-01T23:59:00", litros: 10 }),
        saida({ data: "2026-09-01T06:00:00", litros: 0.1 }),
        saida({ data: "2026-09-03T00:00:00", litros: 0.2 }),
        saida({ data: "2026-09-04T00:00:00", litros: 999 }),
      ],
      "2026-09-01",
      "2026-09-03",
      (s) => s.litros,
    );
    expect(serie).toEqual([10.1, 0, 0.2]);
  });

  it("R$/L por dia sem os dias zerados; média do R$/L diário; 4 pontos para aparecer", () => {
    const sparks = sparksDosKpis(
      [
        saida({ data: "2026-09-01T08:00:00", litros: 100, valorTotal: 600 }),
        saida({ data: "2026-09-03T08:00:00", litros: 100, valorTotal: 700 }),
      ],
      "2026-09-01",
      "2026-09-03",
    );
    expect(sparks.volume).toEqual([100, 0, 100]);
    expect(sparks.custo).toEqual([600, 0, 700]);
    expect(sparks.rPorL).toEqual([6, 7]);
    expect(sparks.mediaRpL).toBe(6.5);
    expect(sparkVisivel(sparks.volume)).toBe(false);
    expect(sparkVisivel([1, 0, 2, 3, 4])).toBe(true);
    expect(sparksDosKpis([], "2026-09-01", "2026-09-02").mediaRpL).toBe(0);
  });
});

describe("Evolução temporal (bucketize da origem)", () => {
  it("granularidade automática: até 92 dias por dia, até 731 por semana, acima por mês", () => {
    expect(autoGranularidade("2026-07-01", "2026-09-30")).toBe("dia"); // 92 dias
    expect(autoGranularidade("2026-07-01", "2026-10-01")).toBe("semana"); // 93
    expect(autoGranularidade("2024-05-08", "2026-05-08")).toBe("semana"); // 731
    expect(autoGranularidade("2024-05-08", "2026-05-09")).toBe("mes"); // 732
  });

  it("por dia: todos os dias do período, vazios inclusive, com litros e custo somados", () => {
    const baldes = evolucaoTemporal(
      [saida({ data: "2026-09-02T10:00:00", litros: 10, valorTotal: 60 }), saida({ data: "2026-09-02T11:00:00", litros: 5, valorTotal: 31 })],
      "2026-09-01",
      "2026-09-03",
      "dia",
    );
    expect(baldes.map((b) => [b.rotulo, b.litros, b.custo])).toEqual([
      ["01/09", 0, 0],
      ["02/09", 15, 91],
      ["03/09", 0, 0],
    ]);
    expect(baldes[1]).toMatchObject({ de: "2026-09-02", ate: "2026-09-02" });
  });

  it("por semana: semana começa na segunda e o balde passa das pontas do período", () => {
    // 2026-09-02 é quarta; a semana é 31/08 (seg) a 06/09 (dom).
    const baldes = evolucaoTemporal([saida({ data: "2026-09-07T10:00:00", litros: 7 })], "2026-09-02", "2026-09-08", "semana");
    expect(inicioDaSemana("2026-09-06")).toBe("2026-08-31");
    expect(baldes.map((b) => [b.de, b.ate, b.rotulo, b.litros])).toEqual([
      ["2026-08-31", "2026-09-06", "31/08–06/09", 0],
      ["2026-09-07", "2026-09-13", "07/09–13/09", 7],
    ]);
  });

  it("por mês: rótulo 'set/26' e o mês inteiro", () => {
    const baldes = evolucaoTemporal([saida({ data: "2026-10-05T10:00:00", valorTotal: 10 })], "2026-09-15", "2026-10-10", "mes");
    expect(baldes.map((b) => [b.rotulo, b.de, b.ate, b.custo])).toEqual([
      ["set/26", "2026-09-01", "2026-09-30", 0],
      ["out/26", "2026-10-01", "2026-10-31", 10],
    ]);
    const tres = evolucaoNasTresGranularidades([], "2026-09-01", "2026-09-03");
    expect(Object.keys(tres)).toEqual(["dia", "semana", "mes"]);
  });
});

describe("heatmap dia da semana × hora", () => {
  it("conta saídas no relógio de parede; 0 = domingo", () => {
    // 2026-09-06 é domingo, 2026-09-07 é segunda.
    const { matriz, maximo } = heatmapDiaHora([
      saida({ data: "2026-09-06T23:30:00" }),
      saida({ data: "2026-09-07T07:10:00" }),
      saida({ data: "2026-09-14T07:59:00" }),
      saida({ data: "sem data" }),
    ]);
    expect(matriz[0]![23]).toBe(1);
    expect(matriz[1]![7]).toBe(2);
    expect(maximo).toBe(2);
    expect(matriz.flat().reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe("R$/L por fornecedor (das entradas)", () => {
  it("do mais barato ao mais caro; média ponderada; entrada sem fornecedor fica de fora", () => {
    const { linhas, media } = precoPorFornecedor([
      { fornecedorId: "caro", litros: 100, valorTotal: 700 },
      { fornecedorId: "barato", litros: 300, valorTotal: 1800 },
      { fornecedorId: "barato", litros: 100, valorTotal: 600 },
      { fornecedorId: null, litros: 1000, valorTotal: 1 },
    ]);
    expect(linhas.map((l) => [l.id, l.litros, l.custo, l.rPorL, l.qtd])).toEqual([
      ["barato", 400, 2400, 6, 2],
      ["caro", 100, 700, 7, 1],
    ]);
    // (2400 + 700) / (400 + 100), e não a média simples de 6 e 7.
    expect(media).toBe(6.2);
    expect(precoPorFornecedor([]).media).toBe(0);
  });
});

describe("últimas saídas e eixo", () => {
  it("as mais recentes primeiro; no mesmo instante, a de id maior", () => {
    const a = saida({ id: "a", data: "2026-09-10T08:00:00" });
    const b = saida({ id: "b", data: "2026-09-10T08:00:00" });
    const c = saida({ id: "c", data: "2026-09-11T08:00:00" });
    expect(ultimasSaidas([a, b, c], 2).map((s) => s.id)).toEqual(["c", "b"]);
  });

  it("niceMax da origem", () => {
    expect(niceMax(200)).toBe(250);
    expect(niceMax(8470)).toBe(10_000);
    expect(niceMax(0)).toBe(1);
    expect(niceMax(4)).toBe(5);
  });
});
