import { describe, expect, it } from "vitest";

import {
  chaveConsumidor,
  detectarAnomalias,
  ehEquipamentoSentinela,
  estatistica,
  foraDaFaixa,
  normalizarNome,
  ordenarAnomalias,
  type Anomalia,
  type EntradaDeteccao,
  type EquipamentoParaDeteccao,
  type SaidaParaDeteccao,
} from "@/modules/combustivel/anomalias/detect";

const DIESEL = "insumo-diesel";
const GASOLINA = "insumo-gasolina";
const INICIO = "2026-07-01T05:00:00.000Z";
const FIM = "2026-10-01T05:00:00.000Z";

let sequencia = 0;
function saida(parcial: Partial<SaidaParaDeteccao> = {}): SaidaParaDeteccao {
  sequencia += 1;
  return {
    id: `s${String(sequencia).padStart(3, "0")}`,
    data: "2026-09-01T12:00:00.000Z",
    tipoConsumidor: "equipamento_proprio",
    equipamentoId: "eq-1",
    placa: null,
    transportadoraId: null,
    insumoId: DIESEL,
    litros: 100,
    valorTotal: 600,
    precoUnitario: 6,
    ...parcial,
  };
}

function equipamento(parcial: Partial<EquipamentoParaDeteccao> = {}): EquipamentoParaDeteccao {
  return { id: "eq-1", codigo: "EQ-1", descricao: "Escavadeira", ativo: true, rotulo: "EQ-1 Escavadeira", ...parcial };
}

function entrada(parcial: Partial<EntradaDeteccao> = {}): EntradaDeteccao {
  return {
    saidas: [],
    equipamentos: [equipamento()],
    combustiveis: new Map([
      [DIESEL, "Diesel S10"],
      [GASOLINA, "Gasolina"],
    ]),
    inicio: INICIO,
    fim: FIM,
    ...parcial,
  };
}

/** Data em dias a partir de 01/09/2026 12:00 UTC. */
function dia(n: number, minutos = 0): string {
  return new Date(Date.parse("2026-09-01T12:00:00.000Z") + n * 86_400_000 + minutos * 60_000).toISOString();
}

const daRegra = (lista: Anomalia[], regra: string) => lista.filter((a) => a.regra === regra);

describe("sentinela", () => {
  it("casa descrição ou código normalizados, e só o nome inteiro", () => {
    expect(ehEquipamentoSentinela({ codigo: null, descricao: "Outros" })).toBe(true);
    expect(ehEquipamentoSentinela({ codigo: null, descricao: "  OUTROS " })).toBe(true);
    expect(ehEquipamentoSentinela({ codigo: "OUTROS", descricao: "Sem nome" })).toBe(true);
    expect(ehEquipamentoSentinela({ codigo: null, descricao: "Equipamento Desconhecido" })).toBe(true);
    expect(ehEquipamentoSentinela({ codigo: null, descricao: "Outros serviços" })).toBe(false);
    expect(ehEquipamentoSentinela({ codigo: "EQ-1", descricao: "Escavadeira" })).toBe(false);
    expect(normalizarNome("  Equipamento   DESCONHECÍDO ")).toBe("equipamento desconhecido");
  });
});

describe("estatística", () => {
  it("média e desvio populacional", () => {
    const est = estatistica([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(est.n).toBe(8);
    expect(est.media).toBe(5);
    expect(est.desvio).toBe(2);
  });

  it("n < 5 nunca acusa, mesmo com desvio zero", () => {
    expect(foraDaFaixa(1000, estatistica([1, 1, 1, 1]))).toBe(false);
    expect(foraDaFaixa(1000, estatistica([1, 1, 1, 1, 1]))).toBe(true);
  });

  it("exatamente em 2σ não acusa; acima acusa", () => {
    const est = estatistica([2, 4, 4, 4, 5, 5, 7, 9]); // média 5, σ 2
    expect(foraDaFaixa(9, est)).toBe(false);
    expect(foraDaFaixa(1, est)).toBe(false);
    expect(foraDaFaixa(9.01, est)).toBe(true);
    expect(foraDaFaixa(0.99, est)).toBe(true);
  });
});

describe("D1: equipamento sentinela", () => {
  it("acusa só a saída do período no Outros, com id D1-saída", () => {
    const outros = equipamento({ id: "eq-outros", codigo: null, descricao: "Outros", rotulo: "Outros" });
    const noOutros = saida({ equipamentoId: "eq-outros" });
    const foraDoPeriodo = saida({ equipamentoId: "eq-outros", data: "2026-06-15T12:00:00.000Z" });
    const normal = saida();
    const lista = detectarAnomalias(
      entrada({ saidas: [noOutros, foraDoPeriodo, normal], equipamentos: [equipamento(), outros] }),
    );
    const d1 = daRegra(lista, "D1");
    expect(d1.map((a) => a.id)).toEqual([`D1-${noOutros.id}`]);
    expect(d1[0].severidade).toBe("atencao");
    expect(d1[0].saidaIds).toEqual([noOutros.id]);
  });

  it("sem sentinela cadastrado, não acusa nada", () => {
    expect(daRegra(detectarAnomalias(entrada({ saidas: [saida()] })), "D1")).toEqual([]);
  });
});

describe("D2: preço por litro do combustível", () => {
  it("acusa o preço fora de 2σ dos outros do mesmo combustível", () => {
    const normais = [6, 6.1, 5.9, 6, 6.05].map((p, i) => saida({ precoUnitario: p, data: dia(i), litros: 100 + i }));
    const caro = saida({ precoUnitario: 9, data: dia(10) });
    const d2 = daRegra(detectarAnomalias(entrada({ saidas: [...normais, caro] })), "D2");
    expect(d2.map((a) => a.id)).toEqual([`D2-${caro.id}`]);
    expect(d2[0].descricao).toContain("Diesel S10");
    expect(d2[0].descricao).toContain("5 abastecimentos");
  });

  it("com 4 na população (5 no total) não acusa", () => {
    const normais = [6, 6.1, 5.9, 6].map((p, i) => saida({ precoUnitario: p, data: dia(i) }));
    const caro = saida({ precoUnitario: 50, data: dia(10) });
    expect(daRegra(detectarAnomalias(entrada({ saidas: [...normais, caro] })), "D2")).toEqual([]);
  });

  it("combustíveis não se misturam e preço zero fica de fora", () => {
    const diesel = [6, 6, 6, 6, 6].map((p, i) => saida({ precoUnitario: p, data: dia(i) }));
    const gasolina = saida({ insumoId: GASOLINA, precoUnitario: 7, data: dia(8) });
    const semPreco = saida({ precoUnitario: 0, data: dia(9) });
    expect(daRegra(detectarAnomalias(entrada({ saidas: [...diesel, gasolina, semPreco] })), "D2")).toEqual([]);
  });

  it("só compara com o período: histórico anterior não entra na média", () => {
    const antigos = [6, 6, 6, 6, 6].map((p, i) => saida({ precoUnitario: p, data: `2026-06-0${i + 1}T12:00:00.000Z` }));
    const caro = saida({ precoUnitario: 9, data: dia(0) });
    expect(daRegra(detectarAnomalias(entrada({ saidas: [...antigos, caro] })), "D2")).toEqual([]);
  });
});

describe("D3: litros do equipamento nos 90 dias", () => {
  it("acusa litros fora de 2σ do histórico do equipamento, excluindo a própria saída", () => {
    const historico = [100, 102, 98, 101, 99].map((l, i) => saida({ litros: l, data: dia(i), precoUnitario: 6 }));
    const muito = saida({ litros: 300, data: dia(10) });
    const d3 = daRegra(detectarAnomalias(entrada({ saidas: [...historico, muito] })), "D3");
    expect(d3.map((a) => a.id)).toEqual([`D3-${muito.id}`]);
    expect(d3[0].equipamentoId).toBe("eq-1");
  });

  it("histórico com mais de 90 dias antes da saída não conta", () => {
    const velhos = [100, 100, 100, 100, 100].map((l, i) =>
      saida({ litros: l, data: new Date(Date.parse(dia(0)) - (91 + i) * 86_400_000).toISOString() }),
    );
    const muito = saida({ litros: 300, data: dia(0) });
    expect(daRegra(detectarAnomalias(entrada({ saidas: [...velhos, muito] })), "D3")).toEqual([]);
  });

  it("histórico antes do período conta (janela móvel), mas só acusa saída do período", () => {
    const antes = [100, 100, 100, 100, 100].map((l, i) => saida({ litros: l, data: `2026-06-2${i}T12:00:00.000Z` }));
    const muito = saida({ litros: 300, data: "2026-07-02T12:00:00.000Z" });
    const d3 = daRegra(detectarAnomalias(entrada({ saidas: [...antes, muito] })), "D3");
    expect(d3.map((a) => a.id)).toEqual([`D3-${muito.id}`]);
  });

  it("equipamentos não se misturam, n < 5 não acusa, e o sentinela fica de fora", () => {
    const outro = [100, 100, 100, 100, 100].map((l, i) => saida({ equipamentoId: "eq-2", litros: l, data: dia(i) }));
    const quatro = [100, 100, 100, 100].map((l, i) => saida({ litros: l, data: dia(i) }));
    const muito = saida({ litros: 300, data: dia(10) });
    const outros = equipamento({ id: "eq-outros", descricao: "Outros", codigo: null, rotulo: "Outros" });
    const doSentinela = [
      ...[100, 100, 100, 100, 100].map((l, i) => saida({ equipamentoId: "eq-outros", litros: l, data: dia(i) })),
      saida({ equipamentoId: "eq-outros", litros: 900, data: dia(11) }),
    ];
    const lista = detectarAnomalias(
      entrada({ saidas: [...outro, ...quatro, muito, ...doSentinela], equipamentos: [equipamento(), outros] }),
    );
    expect(daRegra(lista, "D3")).toEqual([]);
  });
});

describe("D4: duplicidade", () => {
  it("mesmo consumidor, litros, valor e combustível em até 5 minutos: um D4 com ids ordenados", () => {
    const b = saida({ id: "zz-b", data: dia(0, 3) });
    const a = saida({ id: "aa-a", data: dia(0) });
    const d4 = daRegra(detectarAnomalias(entrada({ saidas: [b, a] })), "D4");
    expect(d4).toHaveLength(1);
    expect(d4[0].id).toBe("D4-aa-a-zz-b");
    expect(d4[0].saidaIds).toEqual(["aa-a", "zz-b"]);
    expect(d4[0].severidade).toBe("critica");
  });

  it("o id ordena por texto, não pela data", () => {
    const primeiro = saida({ id: "c", data: dia(0) });
    const segundo = saida({ id: "a", data: dia(0, 1) });
    const terceiro = saida({ id: "b", data: dia(0, 2) });
    const d4 = daRegra(detectarAnomalias(entrada({ saidas: [primeiro, segundo, terceiro] })), "D4");
    expect(d4.map((x) => x.id)).toEqual(["D4-a-b-c"]);
  });

  it("5 minutos exatos entram; 5 minutos e 1 segundo não", () => {
    const a = saida({ id: "a", data: dia(0) });
    const b = saida({ id: "b", data: dia(0, 5) });
    expect(daRegra(detectarAnomalias(entrada({ saidas: [a, b] })), "D4")).toHaveLength(1);
    const c = saida({ id: "c", data: dia(1) });
    const d = saida({ id: "d", data: new Date(Date.parse(dia(1, 5)) + 1000).toISOString() });
    expect(daRegra(detectarAnomalias(entrada({ saidas: [c, d] })), "D4")).toEqual([]);
  });

  it("agrupa pela primeira do grupo: 0, 4 e 8 minutos viram um par e uma solta", () => {
    const a = saida({ id: "a", data: dia(0) });
    const b = saida({ id: "b", data: dia(0, 4) });
    const c = saida({ id: "c", data: dia(0, 8) });
    const d4 = daRegra(detectarAnomalias(entrada({ saidas: [a, b, c] })), "D4");
    expect(d4.map((x) => x.id)).toEqual(["D4-a-b"]);
  });

  it("litros, valor, combustível ou consumidor diferentes não são duplicidade", () => {
    const base = saida({ id: "a", data: dia(0) });
    const outrosLitros = saida({ id: "b", data: dia(0, 1), litros: 101 });
    const outroValor = saida({ id: "c", data: dia(0, 1), valorTotal: 601 });
    const outroCombustivel = saida({ id: "d", data: dia(0, 1), insumoId: GASOLINA });
    const outroEquipamento = saida({ id: "e", data: dia(0, 1), equipamentoId: "eq-2" });
    const lista = detectarAnomalias(entrada({ saidas: [base, outrosLitros, outroValor, outroCombustivel, outroEquipamento] }));
    expect(daRegra(lista, "D4")).toEqual([]);
  });

  it("carreta casa pela placa normalizada", () => {
    const carreta = { tipoConsumidor: "carreta_transportadora", equipamentoId: null, transportadoraId: "t1" };
    const a = saida({ ...carreta, id: "a", placa: "abc-1d23", data: dia(0) });
    const b = saida({ ...carreta, id: "b", placa: "ABC1D23", data: dia(0, 2) });
    const c = saida({ ...carreta, id: "c", placa: "XYZ9K88", data: dia(0, 2) });
    expect(chaveConsumidor(a)).toBe("placa:ABC1D23");
    const d4 = daRegra(detectarAnomalias(entrada({ saidas: [a, b, c] })), "D4");
    expect(d4.map((x) => x.id)).toEqual(["D4-a-b"]);
    expect(chaveConsumidor(saida({ ...carreta, placa: null }))).toBe("transportadora:t1:sem-placa");
  });

  it("saída fora do período não entra no par", () => {
    const a = saida({ id: "a", data: "2026-06-30T12:00:00.000Z" });
    const b = saida({ id: "b", data: "2026-06-30T12:02:00.000Z" });
    expect(daRegra(detectarAnomalias(entrada({ saidas: [a, b] })), "D4")).toEqual([]);
  });
});

describe("D5: equipamento ativo parado", () => {
  it("acusa quem abasteceu antes e não abastece há mais de 60 dias", () => {
    const antiga = saida({ data: "2026-07-15T12:00:00.000Z" });
    const lista = detectarAnomalias(entrada({ saidas: [antiga] }));
    const d5 = daRegra(lista, "D5");
    expect(d5.map((a) => a.id)).toEqual(["D5-eq-1"]);
    expect(d5[0].severidade).toBe("info");
    expect(d5[0].saidaIds).toEqual([]);
    expect(d5[0].descricao).toContain("EQ-1 Escavadeira");
  });

  it("usa o último abastecimento de antes da janela quando a janela não tem nenhum", () => {
    const eq = equipamento({ ultimaSaidaAntesDaJanela: "2026-03-01T12:00:00.000Z" });
    expect(daRegra(detectarAnomalias(entrada({ equipamentos: [eq] })), "D5").map((a) => a.id)).toEqual(["D5-eq-1"]);
  });

  it("não acusa: abasteceu nos 60 dias, nunca abasteceu, inativo ou sentinela", () => {
    const recente = saida({ data: "2026-09-20T12:00:00.000Z" });
    const nunca = equipamento({ id: "eq-2", rotulo: "EQ-2" });
    const inativo = equipamento({ id: "eq-3", ativo: false, ultimaSaidaAntesDaJanela: "2026-01-01T12:00:00.000Z" });
    const outros = equipamento({
      id: "eq-4",
      descricao: "Outros",
      codigo: null,
      ultimaSaidaAntesDaJanela: "2026-01-01T12:00:00.000Z",
    });
    const lista = detectarAnomalias(entrada({ saidas: [recente], equipamentos: [equipamento(), nunca, inativo, outros] }));
    expect(daRegra(lista, "D5")).toEqual([]);
  });

  it("saída depois do fim do período não conta como recente", () => {
    const antiga = saida({ data: "2026-07-15T12:00:00.000Z" });
    const depois = saida({ data: "2026-10-05T12:00:00.000Z" });
    expect(daRegra(detectarAnomalias(entrada({ saidas: [antiga, depois] })), "D5")).toHaveLength(1);
  });
});

describe("determinismo e ordem", () => {
  it("a mesma entrada, em qualquer ordem, dá os mesmos ids na mesma ordem", () => {
    const outros = equipamento({ id: "eq-outros", codigo: null, descricao: "Outros", rotulo: "Outros" });
    const saidas = [
      saida({ id: "a", data: dia(0) }),
      saida({ id: "b", data: dia(0, 1) }),
      saida({ id: "c", equipamentoId: "eq-outros", data: dia(2) }),
      saida({ id: "d", equipamentoId: "eq-2", data: "2026-07-02T12:00:00.000Z" }),
    ];
    const equipamentos = [equipamento(), outros, equipamento({ id: "eq-2", rotulo: "EQ-2" })];
    const ida = detectarAnomalias(entrada({ saidas, equipamentos })).map((a) => a.id);
    const volta = detectarAnomalias(entrada({ saidas: [...saidas].reverse(), equipamentos: [...equipamentos].reverse() })).map(
      (a) => a.id,
    );
    expect(ida).toEqual(volta);
    expect(ida).toEqual(["D4-a-b", "D1-c", "D5-eq-2"]);
  });

  it("ordena crítica, atenção, informativa; depois a mais recente", () => {
    const base = { saidaIds: [], equipamentoId: null, descricao: "" };
    const ordem = ordenarAnomalias([
      { ...base, id: "i", regra: "D5", severidade: "info", data: dia(9) },
      { ...base, id: "a1", regra: "D1", severidade: "atencao", data: dia(1) },
      { ...base, id: "a2", regra: "D2", severidade: "atencao", data: dia(5) },
      { ...base, id: "c", regra: "D4", severidade: "critica", data: dia(0) },
    ]);
    expect(ordem.map((a) => a.id)).toEqual(["c", "a2", "a1", "i"]);
  });
});
