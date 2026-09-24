import { describe, expect, it } from "vitest";

import type { PedidoDaPedreira } from "@/modules/frete/_shared/pedreira";

import { detectAnomaliasFrete, diasEntre, type DetectFreteInput, type FreteDeteccao } from "./detect";

// Porte de Gestao_Obras/src/components/frete/anomalias/detect.test.ts. A origem casava o
// texto "Britam" com o fornecedor; aqui a localidade de origem já traz a pedreira.
function frete(over: Partial<FreteDeteccao>): FreteDeteccao {
  return {
    id: "f1",
    tipo: "material",
    data: "2026-01-10",
    dataChegada: "2026-01-11",
    pedreiraId: "fBritam",
    origemNome: "Britam",
    destinoNome: "Obra",
    insumoId: "brita4",
    peso: 30,
    valorMaterial: 30 * 121.98,
    notaFiscal: "NF1",
    placaCarreta: "ABC1D23",
    ...over,
  };
}
function pedido(over: Partial<PedidoDaPedreira>): PedidoDaPedreira {
  return { fornecedorId: "fBritam", itens: [{ insumoId: "brita4", quantidade: 1000, valorUnitario: 121.98 }], ...over };
}
const base = (over: Partial<DetectFreteInput>): DetectFreteInput => ({
  fretesNoPeriodo: [],
  fretesTodos: [],
  pedidos: [],
  insumoNome: new Map([
    ["brita4", "Brita 4"],
    ["bgs", "BGS"],
  ]),
  fornecedorNome: new Map([["fBritam", "Britam"]]),
  hoje: "2026-06-08",
  ...over,
});
const so = (res: ReturnType<typeof detectAnomaliasFrete>, d: string) => res.filter((a) => a.detector === d);

describe("F1: preço de material fora do padrão", () => {
  it("dispara quando o R$/t do frete não bate com nenhum preço de pedido", () => {
    const f = frete({ id: "fx", insumoId: "bgs", valorMaterial: 60 * 112.35, peso: 60 });
    const p = pedido({ itens: [{ insumoId: "bgs", quantidade: 1000, valorUnitario: 106.73 }] });
    const f1 = so(detectAnomaliasFrete(base({ fretesNoPeriodo: [f], fretesTodos: [f], pedidos: [p] })), "F1");
    expect(f1).toHaveLength(1);
    expect(f1[0]!.id).toBe("F1-fx");
    expect(f1[0]!.affectedFreteIds).toEqual(["fx"]);
    expect(f1[0]!.severity).toBe("warning");
    expect(f1[0]!.title).toBe("Preço de BGS fora do padrão (Britam)");
    expect(f1[0]!.description).toMatch(/^Nota NF1: R\$\s112,35\/t\. Pedidos de BGS nessa pedreira: R\$\s106,73\.$/);
  });

  it("NÃO dispara quando o preço bate com algum pedido", () => {
    const f = frete({ id: "fdez", valorMaterial: 30 * 128.4, peso: 30 });
    const p = pedido({
      itens: [
        { insumoId: "brita4", quantidade: 1000, valorUnitario: 121.98 },
        { insumoId: "brita4", quantidade: 400, valorUnitario: 128.4 },
      ],
    });
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [f], fretesTodos: [f], pedidos: [p] })), "F1")).toHaveLength(0);
  });

  it("respeita a tolerância de R$ 0,10/t (0,07 passa; controle 0,15 dispara)", () => {
    const dentro = frete({ valorMaterial: 30 * 122.05 });
    const fora = frete({ valorMaterial: 30 * 122.13 });
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [dentro], pedidos: [pedido({})] })), "F1")).toHaveLength(0);
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [fora], pedidos: [pedido({})] })), "F1")).toHaveLength(1);
  });
});

describe("F2: frete de material sem pedido", () => {
  it("dispara quando o material+pedreira não tem pedido", () => {
    const f = frete({ id: "fnp", insumoId: "bgs" });
    const res = detectAnomaliasFrete(base({ fretesNoPeriodo: [f], fretesTodos: [f], pedidos: [pedido({})] }));
    const f2 = so(res, "F2");
    expect(f2).toHaveLength(1);
    expect(f2[0]!.id).toBe("F2-fnp");
    expect(f2[0]!.description).toBe("Nota NF1: não há pedido de BGS cadastrado para Britam.");
    expect(res.filter((a) => a.detector === "F1" && a.affectedFreteIds.includes("fnp"))).toHaveLength(0);
  });

  it("NÃO dispara quando há pedido do material+pedreira", () => {
    const f = frete({ id: "fok" });
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [f], pedidos: [pedido({})] })), "F2")).toHaveLength(0);
  });

  it("localidade sem pedreira não vira F2 (vira F5); controle: com pedreira vira F2", () => {
    const sem = frete({ id: "s", insumoId: "bgs", pedreiraId: null });
    const com = frete({ id: "c", insumoId: "bgs" });
    const resSem = detectAnomaliasFrete(base({ fretesNoPeriodo: [sem], pedidos: [pedido({})] }));
    expect(so(resSem, "F2")).toHaveLength(0);
    expect(so(resSem, "F5")[0]!.description).toContain("origem não casa com nenhum fornecedor");
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [com], pedidos: [pedido({})] })), "F2")).toHaveLength(1);
  });

  it("usa o nome da localidade quando o fornecedor não tem nome", () => {
    const f = frete({ id: "x", insumoId: "bgs", pedreiraId: "fDesconhecido", origemNome: "Pedreira Nova" });
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [f] })), "F2")[0]!.title).toBe("BGS transportado sem pedido (Pedreira Nova)");
  });
});

describe("F3: saldo negativo na pedreira", () => {
  it("dispara quando transportado (t) > pedido (t)", () => {
    const fretes = [frete({ id: "a", peso: 700 }), frete({ id: "b", peso: 500 })];
    const f3 = so(detectAnomaliasFrete(base({ fretesNoPeriodo: fretes, fretesTodos: fretes, pedidos: [pedido({})] })), "F3");
    expect(f3).toHaveLength(1);
    expect(f3[0]!.id).toBe("F3-fBritam-brita4");
    expect(f3[0]!.id).not.toContain("\x00");
    expect(f3[0]!.affectedFornecedorId).toBe("fBritam");
    expect(f3[0]!.data).toBe("2026-06-08");
    expect(f3[0]!.description).toBe("Transportado 1.200 t, mas só 1.000 t foram pedidas. Saldo -200 t.");
  });

  it("NÃO dispara quando transportado <= pedido, nem dentro de 0,1 t; controle: 0,2 t dispara", () => {
    const f = [frete({ peso: 800 })];
    expect(so(detectAnomaliasFrete(base({ fretesTodos: f, pedidos: [pedido({})] })), "F3")).toHaveLength(0);
    const dentro = [frete({ peso: 1000.05 })];
    expect(so(detectAnomaliasFrete(base({ fretesTodos: dentro, pedidos: [pedido({})] })), "F3")).toHaveLength(0);
    const fora = [frete({ peso: 1000.2 })];
    expect(so(detectAnomaliasFrete(base({ fretesTodos: fora, pedidos: [pedido({})] })), "F3")).toHaveLength(1);
  });

  it("usa fretesTodos e não fretesNoPeriodo", () => {
    const todos = [frete({ id: "a", peso: 700 }), frete({ id: "b", peso: 500 })];
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [], fretesTodos: todos, pedidos: [pedido({})] })), "F3")).toHaveLength(1);
  });
});

describe("F4: frete duplicado", () => {
  it("mesma nota fiscal em 2+ fretes", () => {
    const fretes = [frete({ id: "a", notaFiscal: "999" }), frete({ id: "b", notaFiscal: "999", data: "2026-01-12" })];
    const f4 = so(detectAnomaliasFrete(base({ fretesNoPeriodo: fretes, pedidos: [pedido({})] })), "F4");
    expect(f4).toHaveLength(1);
    expect(f4[0]!.id).toBe("F4-nf-999");
    expect(f4[0]!.severity).toBe("critical");
    expect(f4[0]!.data).toBe("2026-01-12");
    expect(new Set(f4[0]!.affectedFreteIds)).toEqual(new Set(["a", "b"]));
  });

  it("placa+peso+material+data repetidos, com o id da origem", () => {
    const fretes = [
      frete({ id: "a", notaFiscal: "N1", placaCarreta: "XYZ9Z99", peso: 31, data: "2026-02-02" }),
      frete({ id: "b", notaFiscal: "N2", placaCarreta: "XYZ9Z99", peso: 31, data: "2026-02-02" }),
    ];
    const f4 = so(detectAnomaliasFrete(base({ fretesNoPeriodo: fretes, pedidos: [pedido({})] })), "F4");
    expect(f4).toHaveLength(1);
    expect(f4[0]!.id).toBe("F4-carga-XYZ9Z99|31|brita4|2026-02-02");
    expect(f4[0]!.title).toBe("Carga repetida: XYZ9Z99 em 02/02/2026");
  });

  it("NÃO dispara com notas e cargas distintas", () => {
    const fretes = [frete({ id: "a", notaFiscal: "N1" }), frete({ id: "b", notaFiscal: "N2", placaCarreta: "OUT0R00", peso: 25 })];
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: fretes, pedidos: [pedido({})] })), "F4")).toHaveLength(0);
  });
});

describe("F5: cadastro incompleto", () => {
  it("warning quando falta peso ou valor de material", () => {
    const f5 = so(detectAnomaliasFrete(base({ fretesNoPeriodo: [frete({ peso: 0, valorMaterial: 0 })], pedidos: [pedido({})] })), "F5");
    expect(f5).toHaveLength(1);
    expect(f5[0]!.severity).toBe("warning");
  });

  it("info quando só falta nota fiscal ou placa", () => {
    const f5 = so(detectAnomaliasFrete(base({ fretesNoPeriodo: [frete({ notaFiscal: "", placaCarreta: "" })], pedidos: [pedido({})] })), "F5");
    expect(f5).toHaveLength(1);
    expect(f5[0]!.severity).toBe("info");
    expect(f5[0]!.title).toBe("Frete com cadastro incompleto");
    expect(f5[0]!.description).toBe("Problemas: sem nota fiscal, sem placa.");
  });

  it("NÃO dispara para frete completo", () => {
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [frete({})], pedidos: [pedido({})] })), "F5")).toHaveLength(0);
  });
});

describe("F6: frete sem chegada", () => {
  it("dispara com chegada vazia há mais de 7 dias", () => {
    const f6 = so(detectAnomaliasFrete(base({ fretesNoPeriodo: [frete({ id: "nc", dataChegada: null, data: "2026-06-01" })], hoje: "2026-06-10" })), "F6");
    expect(f6).toHaveLength(1);
    expect(f6[0]!.severity).toBe("info");
    expect(f6[0]!.description).toBe("Saída em 01/06/2026, sem data de chegada registrada.");
  });

  it("limite exato: 7 dias não dispara, 8 dispara", () => {
    const f = frete({ dataChegada: null, data: "2026-06-01" });
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [f], hoje: "2026-06-08" })), "F6")).toHaveLength(0);
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [f], hoje: "2026-06-09" })), "F6")).toHaveLength(1);
  });

  it("NÃO dispara com data de chegada", () => {
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [frete({ dataChegada: "2026-06-02", data: "2026-06-01" })], hoje: "2026-06-30" })), "F6")).toHaveLength(0);
  });

  it("diasEntre atravessa virada de mês", () => {
    expect(diasEntre("2026-02-28", "2026-03-01")).toBe(1);
  });
});

describe("Transferência fica fora dos detectores de pedreira (com linha de controle)", () => {
  const transf = (over: Partial<FreteDeteccao>) => frete({ tipo: "transferencia", ...over });
  const material = (over: Partial<FreteDeteccao>) => frete({ tipo: "material", ...over });

  it("F2", () => {
    const comum = { id: "tr1", insumoId: "bgs", valorMaterial: 0 };
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [transf(comum)], pedidos: [pedido({})] })), "F2")).toHaveLength(0);
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [material(comum)], pedidos: [pedido({})] })), "F2")).toHaveLength(1);
  });

  it("F1", () => {
    const comum = { id: "tr2", insumoId: "bgs", peso: 60, valorMaterial: 60 * 112.35 };
    const p = pedido({ itens: [{ insumoId: "bgs", quantidade: 1000, valorUnitario: 106.73 }] });
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [transf(comum)], pedidos: [p] })), "F1")).toHaveLength(0);
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [material(comum)], pedidos: [p] })), "F1")).toHaveLength(1);
  });

  it("F3", () => {
    const comum = { id: "tr3", peso: 150 };
    const p = pedido({ itens: [{ insumoId: "brita4", quantidade: 100, valorUnitario: 121.98 }] });
    expect(so(detectAnomaliasFrete(base({ fretesTodos: [transf(comum)], pedidos: [p] })), "F3")).toHaveLength(0);
    expect(so(detectAnomaliasFrete(base({ fretesTodos: [material(comum)], pedidos: [p] })), "F3")).toHaveLength(1);
  });

  it("F5: não cobra NF, valor de material nem pedreira; cobra peso e placa", () => {
    const livre = transf({ id: "tr4", pedreiraId: null, notaFiscal: "", valorMaterial: 0 });
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [livre], pedidos: [pedido({})] })), "F5")).toHaveLength(0);
    const f5 = so(detectAnomaliasFrete(base({ fretesNoPeriodo: [transf({ id: "tr5", peso: 0, placaCarreta: "" })] })), "F5");
    expect(f5).toHaveLength(1);
    expect(f5[0]!.description).toContain("sem peso");
    expect(f5[0]!.description).toContain("sem placa");
    expect(f5[0]!.title).toContain("Transferência");
  });

  it("F5: transferência sem destino é grave", () => {
    const f5 = so(detectAnomaliasFrete(base({ fretesNoPeriodo: [transf({ destinoNome: " " })] })), "F5");
    expect(f5[0]!.severity).toBe("warning");
    expect(f5[0]!.description).toContain("sem destino");
  });

  it("F6", () => {
    const comum = { id: "tr6", dataChegada: null, data: "2026-06-01" };
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [transf(comum)], hoje: "2026-06-30" })), "F6")).toHaveLength(0);
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [material(comum)], hoje: "2026-06-30" })), "F6")).toHaveLength(1);
  });

  it("F4: transferência duplicada continua acusada", () => {
    const a = transf({ id: "tr7a", notaFiscal: "" });
    const b = transf({ id: "tr7b", notaFiscal: "" });
    expect(so(detectAnomaliasFrete(base({ fretesNoPeriodo: [a, b] })), "F4").length).toBeGreaterThan(0);
  });
});

describe("ordem", () => {
  it("severidade (crítica, atenção, informação) e depois data desc", () => {
    const fretes = [
      frete({ id: "a", notaFiscal: "9", data: "2026-01-01", dataChegada: null }),
      frete({ id: "b", notaFiscal: "9", data: "2026-01-02" }),
      frete({ id: "c", notaFiscal: "", insumoId: "bgs", data: "2026-03-01" }),
    ];
    const res = detectAnomaliasFrete(base({ fretesNoPeriodo: fretes, pedidos: [pedido({})] }));
    expect(res.map((a) => a.severity)).toEqual([...res.map((a) => a.severity)].sort((x, y) => ["critical", "warning", "info"].indexOf(x) - ["critical", "warning", "info"].indexOf(y)));
    expect(res[0]!.detector).toBe("F4");
    const atencao = res.filter((a) => a.severity === "warning").map((a) => a.data);
    expect(atencao).toEqual([...atencao].sort().reverse());
  });
});
