import { describe, expect, it } from "vitest";

import { EQUIPAMENTO_DESCONHECIDO, type SaidaBase } from "@/modules/combustivel/anomalias/base";
import {
  calcularKpis,
  custoPorObra,
  ID_NAO_IDENTIFICADO,
  ID_SEM_OBRA,
  mixCombustivel,
  pctChange,
  percentualDoTanque,
  periodoAnterior,
  tendencia,
  topConsumidores,
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
