import { describe, expect, it } from "vitest";

import {
  detectAnomalias,
  EQUIPAMENTO_DESCONHECIDO,
  type Anomalia,
  type DetectInput,
  type SaidaDeteccao,
} from "@/modules/combustivel/anomalias/detect";

/**
 * O comportamento do detector da origem (Gestao_Obras v2/anomalias/detect.ts), que a
 * origem não testava. Cada caso fixa uma decisão de lá: σ populacional com a própria
 * saída dentro, R$/L = valor / litros, histórico do D3 contado até HOJE, âncora do D4,
 * placa em minúsculas, D5 que acusa quem nunca abasteceu.
 */

const AGORA = new Date("2026-09-23T15:00:00.000Z");
const DIESEL = "diesel";
const GASOLINA = "gasolina";

let sequencia = 0;
function saida(parcial: Partial<SaidaDeteccao> = {}): SaidaDeteccao {
  sequencia += 1;
  return {
    id: `s${String(sequencia).padStart(3, "0")}`,
    data: "2026-09-10T08:00:00",
    tipoConsumidor: "equipamento_proprio",
    equipamentoId: "eq-1",
    placa: null,
    obraId: "obra-1",
    tipoCombustivel: DIESEL,
    litros: 100,
    valorTotal: 600,
    ...parcial,
  };
}

function entrada(parcial: Partial<DetectInput> & { saidas?: SaidaDeteccao[] } = {}): DetectInput {
  const { saidas = [], ...resto } = parcial;
  return {
    saidasNoPeriodo: saidas,
    saidasTodas: saidas,
    // eq-1 com saída recente em quase todo teste; o D5 é testado à parte.
    equipamentos: [],
    combustivelNome: new Map([
      [DIESEL, "Diesel S10"],
      [GASOLINA, "Gasolina"],
    ]),
    obraNome: new Map([["obra-1", "Obra 009"]]),
    agora: AGORA,
    ...resto,
  };
}

const doDetector = (lista: Anomalia[], d: string) => lista.filter((a) => a.detector === d);

describe("D1: sentinela", () => {
  it("acusa só equipamento próprio no 'desconhecido', com id, texto e dia da origem", () => {
    const s = saida({ equipamentoId: EQUIPAMENTO_DESCONHECIDO, litros: 150.5, valorTotal: 963.25, data: "2026-09-12T23:30:00" });
    const carreta = saida({ tipoConsumidor: "carreta_transportadora", equipamentoId: EQUIPAMENTO_DESCONHECIDO, placa: "ABC1D23" });
    const d1 = doDetector(detectAnomalias(entrada({ saidas: [s, carreta, saida()] })), "D1");
    expect(d1).toHaveLength(1);
    expect(d1[0]).toMatchObject({
      id: `D1-${s.id}`,
      severity: "warning",
      title: "Saída sem equipamento identificado",
      affectedSaidaIds: [s.id],
      affectedObraId: "obra-1",
      data: "2026-09-12",
    });
    expect(d1[0]!.description).toBe("150,50 L · R$ 963,25 · obra Obra 009");
  });
});

describe("D2: R$/L fora de ±2σ por combustível no período", () => {
  it("usa valor / litros e σ populacional com a própria saída dentro (n conta ela)", () => {
    const normais = Array.from({ length: 5 }, () => saida({ litros: 100, valorTotal: 600 }));
    const cara = saida({ litros: 100, valorTotal: 1200 });
    const d2 = doDetector(detectAnomalias(entrada({ saidas: [...normais, cara] })), "D2");
    // média 7, σ = √5 = 2,236: 12 > 7 + 4,472
    expect(d2.map((a) => a.id)).toEqual([`D2-${cara.id}`]);
    expect(d2[0]!.title).toBe("R$/L acima da média para Diesel S10");
    expect(d2[0]!.description).toContain("R$ 12,0000/L vs média R$ 7,0000");
    expect(d2[0]!.description).toContain("n=6");
  });

  it("com a própria saída na população, um ponto isolado entre 5 não passa de 1,79σ", () => {
    const precos = [6, 6.1, 5.9, 6, 60];
    const saidas = precos.map((p) => saida({ litros: 100, valorTotal: p * 100 }));
    expect(doDetector(detectAnomalias(entrada({ saidas })), "D2")).toEqual([]);
  });

  it("menos de 5 no grupo, litros zero e grupo sem variância não acusam", () => {
    const quatro = [6, 6, 6, 60].map((p) => saida({ valorTotal: p * 100 }));
    expect(doDetector(detectAnomalias(entrada({ saidas: quatro })), "D2")).toEqual([]);

    const comZero = [...quatro, saida({ litros: 0, valorTotal: 0 })];
    expect(doDetector(detectAnomalias(entrada({ saidas: comZero })), "D2")).toEqual([]);

    const iguais = Array.from({ length: 6 }, () => saida());
    expect(doDetector(detectAnomalias(entrada({ saidas: iguais })), "D2")).toEqual([]);
  });

  it("agrupa por combustível: a gasolina não entra na média do diesel", () => {
    const diesel = Array.from({ length: 6 }, () => saida({ valorTotal: 600 }));
    const gasolina = saida({ tipoCombustivel: GASOLINA, valorTotal: 700 });
    expect(doDetector(detectAnomalias(entrada({ saidas: [...diesel, gasolina] })), "D2")).toEqual([]);
  });

  it("carreta entra no D2 do recorte (o modo é quem separa, não o detector)", () => {
    const carretas = Array.from({ length: 5 }, () =>
      saida({ tipoConsumidor: "carreta_transportadora", equipamentoId: null, placa: "AAA1111", valorTotal: 600 }),
    );
    const barata = saida({ tipoConsumidor: "carreta_transportadora", equipamentoId: null, placa: "BBB2222", valorTotal: 100 });
    const d2 = doDetector(detectAnomalias(entrada({ saidas: [...carretas, barata] })), "D2");
    expect(d2.map((a) => a.id)).toEqual([`D2-${barata.id}`]);
    expect(d2[0]!.title).toBe("R$/L abaixo da média para Diesel S10");
  });
});

describe("D3: volume fora de ±2σ do histórico de 90 dias até hoje", () => {
  it("histórico inclui a própria saída e todas as de equipamento próprio dos últimos 90 dias", () => {
    const hist = Array.from({ length: 5 }, (_, i) => saida({ litros: 100, data: `2026-08-0${i + 1}T08:00:00` }));
    const grande = saida({ litros: 300, data: "2026-09-10T08:00:00" });
    const todas = [...hist, grande];
    const d3 = doDetector(
      detectAnomalias(entrada({ saidasNoPeriodo: [grande], saidasTodas: todas, equipamentos: [{ id: "eq-1", nome: "Escavadeira 320", ativo: true }] })),
      "D3",
    );
    expect(d3).toHaveLength(1);
    expect(d3[0]).toMatchObject({ id: `D3-${grande.id}`, severity: "warning", affectedEquipamentoId: "eq-1" });
    expect(d3[0]!.title).toBe("Volume acima do padrão de Escavadeira 320");
    expect(d3[0]!.description).toContain("n=6");
  });

  it("o corte é hoje menos 90 dias, não 90 dias antes da saída", () => {
    // Todas as de histórico em junho/2026: antes de 25/06 (hoje - 90) ficam fora.
    const antigas = Array.from({ length: 6 }, (_, i) => saida({ litros: 100, data: `2026-06-1${i}T08:00:00` }));
    const grande = saida({ litros: 400, data: "2026-06-20T08:00:00" });
    const d3 = doDetector(detectAnomalias(entrada({ saidasNoPeriodo: [grande], saidasTodas: [...antigas, grande] })), "D3");
    expect(d3).toEqual([]);
  });

  it("sentinela e carreta ficam fora; n < 5 não acusa", () => {
    const sentinela = Array.from({ length: 6 }, () => saida({ equipamentoId: EQUIPAMENTO_DESCONHECIDO, litros: 100 }));
    const outlierSentinela = saida({ equipamentoId: EQUIPAMENTO_DESCONHECIDO, litros: 900 });
    expect(doDetector(detectAnomalias(entrada({ saidas: [...sentinela, outlierSentinela] })), "D3")).toEqual([]);

    const poucas = [saida({ litros: 100 }), saida({ litros: 100 }), saida({ litros: 100 }), saida({ litros: 900 })];
    expect(doDetector(detectAnomalias(entrada({ saidas: poucas })), "D3")).toEqual([]);
  });
});

describe("D4: duplicata em 5 minutos", () => {
  it("mesmo equipamento, litros, valor e combustível dentro da janela: um grupo crítico, id com os ids ordenados", () => {
    const a = saida({ id: "b-2", data: "2026-09-10T08:00:00" });
    const b = saida({ id: "a-1", data: "2026-09-10T08:05:00" });
    const d4 = doDetector(detectAnomalias(entrada({ saidas: [a, b] })), "D4");
    expect(d4).toHaveLength(1);
    expect(d4[0]).toMatchObject({
      id: "D4-a-1-b-2",
      severity: "critical",
      title: "2 saídas idênticas em janela de 5 minutos",
      affectedSaidaIds: ["a-1", "b-2"],
      data: "2026-09-10",
    });
    expect(d4[0]!.description).toBe("Mesmo consumidor + 100,00 L + R$ 600,00: provável duplicata");
  });

  it("ancora na primeira: 0, 4 e 8 minutos viram um par e uma sobra", () => {
    const s0 = saida({ data: "2026-09-10T08:00:00" });
    const s4 = saida({ data: "2026-09-10T08:04:00" });
    const s8 = saida({ data: "2026-09-10T08:08:00" });
    const d4 = doDetector(detectAnomalias(entrada({ saidas: [s8, s0, s4] })), "D4");
    expect(d4.map((a) => a.affectedSaidaIds)).toEqual([[s0.id, s4.id]]);
  });

  it("placa em minúsculas: 'ABC1D23' e 'abc1d23' são a mesma carreta; 'ABC-1D23' não", () => {
    const carreta = { tipoConsumidor: "carreta_transportadora", equipamentoId: null } as const;
    const x = saida({ ...carreta, placa: "ABC1D23", data: "2026-09-10T08:00:00" });
    const y = saida({ ...carreta, placa: "abc1d23", data: "2026-09-10T08:01:00" });
    const z = saida({ ...carreta, placa: "ABC-1D23", data: "2026-09-10T08:02:00" });
    const d4 = doDetector(detectAnomalias(entrada({ saidas: [x, y, z] })), "D4");
    expect(d4.map((a) => a.affectedSaidaIds)).toEqual([[x.id, y.id]]);
  });

  it("valor diferente ou fora da janela não é duplicata", () => {
    const s1 = saida({ data: "2026-09-10T08:00:00" });
    const outroValor = saida({ data: "2026-09-10T08:01:00", valorTotal: 601 });
    const longe = saida({ data: "2026-09-10T08:05:01" });
    expect(doDetector(detectAnomalias(entrada({ saidas: [s1, outroValor, longe] })), "D4")).toEqual([]);
  });
});

describe("D5: equipamento ativo sem saída em 60 dias", () => {
  const equipamentos = [
    { id: "eq-parado", nome: "Rolo CA25", ativo: true },
    { id: "eq-novo", nome: "Motoniveladora", ativo: true },
    { id: "eq-inativo", nome: "Caminhão velho", ativo: false },
    { id: "eq-1", nome: "Escavadeira", ativo: true },
  ];

  it("acusa o parado (com os dias até hoje) e quem nunca abasteceu; pula inativo e quem abasteceu", () => {
    const antiga = saida({ equipamentoId: "eq-parado", data: "2026-07-01T10:00:00" });
    const recente = saida({ equipamentoId: "eq-1", data: "2026-09-01T10:00:00" });
    const d5 = doDetector(detectAnomalias(entrada({ saidasNoPeriodo: [], saidasTodas: [antiga, recente], equipamentos })), "D5");
    expect(d5.map((a) => a.id).sort()).toEqual(["D5-eq-novo", "D5-eq-parado"]);

    const parado = d5.find((a) => a.id === "D5-eq-parado")!;
    expect(parado).toMatchObject({
      severity: "info",
      title: "Rolo CA25 sem saída há 84 dia(s)",
      description: "Última saída em 01/07/2026",
      affectedSaidaIds: [antiga.id],
      data: "2026-07-01",
    });
    const novo = d5.find((a) => a.id === "D5-eq-novo")!;
    expect(novo).toMatchObject({
      title: "Motoniveladora sem saída há 60+ dias",
      description: "Nunca teve saída registrada",
      affectedSaidaIds: [],
      data: "2026-09-23",
    });
  });

  it("a janela é fixa: não depende do período da tela", () => {
    const recente = saida({ equipamentoId: "eq-parado", data: "2026-08-01T10:00:00" });
    const d5 = doDetector(
      detectAnomalias(entrada({ saidasNoPeriodo: [], saidasTodas: [recente], equipamentos: [equipamentos[0]!] })),
      "D5",
    );
    expect(d5).toEqual([]);
  });
});

describe("ordem e ids", () => {
  it("crítica, atenção, informação; dentro da severidade, data desc; ids iguais em toda recarga", () => {
    const dupA = saida({ data: "2026-09-01T08:00:00" });
    const dupB = saida({ data: "2026-09-01T08:01:00" });
    const sentinelaNova = saida({ equipamentoId: EQUIPAMENTO_DESCONHECIDO, data: "2026-09-15T08:00:00" });
    const sentinelaVelha = saida({ equipamentoId: EQUIPAMENTO_DESCONHECIDO, data: "2026-09-05T08:00:00" });
    const input = entrada({
      saidas: [dupA, dupB, sentinelaNova, sentinelaVelha],
      equipamentos: [{ id: "eq-novo", nome: "Motoniveladora", ativo: true }],
    });
    const primeira = detectAnomalias(input);
    expect(primeira.map((a) => a.id)).toEqual([
      `D4-${dupA.id}-${dupB.id}`,
      `D1-${sentinelaNova.id}`,
      `D1-${sentinelaVelha.id}`,
      "D5-eq-novo",
    ]);
    expect(detectAnomalias(input).map((a) => a.id)).toEqual(primeira.map((a) => a.id));
  });
});
