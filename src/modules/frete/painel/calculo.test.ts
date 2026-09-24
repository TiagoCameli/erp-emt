import { describe, expect, it } from "vitest";

import { agregarPedidos } from "@/modules/frete/_shared/pedreira";

import {
  abastecimentosPorEmpresa,
  alternarCruzado,
  analisarFretes,
  analisarMateriais,
  cardsDeSaldo,
  cardsTopo,
  cruzarFretes,
  custoMaterialFrete,
  gastoPorObra,
  gastoTransportePorPedreira,
  janelaDeComparacao,
  materialTransportado,
  pagamentosEmpresaMetodo,
  pagamentosPorEmpresa,
  passivoEmt,
  podeConfigurarCards,
  recortarBases,
  resumoPorTransportadora,
  SEM_FILTRO_LOCAL,
  tabelaSaldoPedreira,
  ultimoPrecoPorMaterial,
  variacao,
  type AbastecimentoPainel,
  type DadosPainel,
  type FretePainel,
  type NomesPainel,
  type PagamentoPainel,
  type PedidoPainel,
  type SaldoPainel,
} from "./calculo";

const nomes: NomesPainel = {
  obra: { o1: "Obra 1", o2: "Obra 2" },
  insumo: { brita: "Brita 1", bgs: "BGS" },
  localidade: { lBritam: "Pedreira Britam", lUsina: "Usina", lObra: "Canteiro" },
  fornecedor: { tA: "Transp A", tB: "Transp B", britam: "Britam", formate: "Formate" },
};

function frete(over: Partial<FretePainel>): FretePainel {
  return {
    id: "f",
    tipo: "material",
    data: "2026-03-10",
    dataChegada: "2026-03-11",
    obraId: "o1",
    origemId: "lBritam",
    destinoId: "lObra",
    pedreiraId: "britam",
    transportadoraId: "tA",
    insumoId: "brita",
    peso: 30,
    km: 100,
    valorTkm: 0.37,
    valorTotal: 30 * 100 * 0.37,
    valorMaterial: 30 * 120,
    notaFiscal: "1",
    placaCarreta: "ABC1D23",
    ...over,
  };
}
function pag(over: Partial<PagamentoPainel>): PagamentoPainel {
  return { id: "p", data: "2026-03-15", mesReferencia: "2026-03", transportadoraId: "tA", valor: 1000, metodo: "pix", pagoPor: "EMT Construtora", ...over };
}
function pedido(over: Partial<PedidoPainel>): PedidoPainel {
  return { id: "pd", data: "2026-03-01", fornecedorId: "britam", itens: [{ insumoId: "brita", quantidade: 100, valorUnitario: 120 }], ...over };
}
function dadosCom(over: Partial<DadosPainel>): DadosPainel {
  return { fretes: [], pagamentos: [], abastecimentos: [], pedidos: [], saldos: [], nomes, transportadoras: ["tA", "tB"], cardsIds: [], ...over };
}
const semFiltro = { obraId: "", de: "", ate: "" };

describe("recortes do topo", () => {
  it("frete por data e obra; pagamento pelo mês de referência e sem obra", () => {
    const dados = dadosCom({
      fretes: [frete({ id: "a" }), frete({ id: "b", data: "2026-04-01" }), frete({ id: "c", obraId: "o2" })],
      pagamentos: [pag({ id: "x", data: "2026-05-01", mesReferencia: "2026-03" }), pag({ id: "y", data: "2026-03-02", mesReferencia: "2026-02" })],
    });
    const b = recortarBases(dados, { obraId: "o1", de: "2026-03-01", ate: "2026-03-31" });
    expect(b.fretes.map((f) => f.id)).toEqual(["a"]);
    // pela data, "y" entraria e "x" não: vale o mês de referência.
    expect(b.pagamentos.map((p) => p.id)).toEqual(["x"]);
  });
});

describe("comparação de períodos e DeltaChip", () => {
  it("período anterior de mesma duração e ano anterior", () => {
    expect(janelaDeComparacao("periodo_anterior", "2026-05-01", "2026-05-31", "", "")).toEqual({ inicio: "2026-03-31", fim: "2026-04-30" });
    expect(janelaDeComparacao("ano_anterior", "2026-05-01", "2026-05-31", "", "")).toEqual({ inicio: "2025-05-01", fim: "2025-05-31" });
    expect(janelaDeComparacao("custom", "2026-05-01", "2026-05-31", "", "")).toBeNull();
    expect(janelaDeComparacao("periodo_anterior", "", "2026-05-31", "", "")).toBeNull();
  });

  it("variação: nada, novo e percentual sobre |anterior|", () => {
    expect(variacao(0, 0)).toBeNull();
    expect(variacao(10, 0)).toEqual({ tipo: "novo" });
    expect(variacao(150, 100)).toEqual({ tipo: "pct", valor: 50 });
    expect(variacao(50, -100)).toEqual({ tipo: "pct", valor: 150 });
  });

  it("total fretes inclui transferência; pagamentos EMT só pago por EMT Construtora", () => {
    const dados = dadosCom({
      fretes: [frete({ id: "a", valorTotal: 100 }), frete({ id: "b", tipo: "transferencia", valorTotal: 50 })],
      pagamentos: [pag({ valor: 10 }), pag({ id: "q", valor: 7, pagoPor: " EMT Construtora " }), pag({ id: "r", valor: 99, pagoPor: "Areacre" })],
    });
    const t = cardsTopo(dados, semFiltro, {}, null);
    expect(t.totalFretes).toBe(150);
    expect(t.qtdFretes).toBe(2);
    expect(t.pagosPelaEmt).toBe(17);
    expect(t.qtdPagamentosEmt).toBe(2);
    expect(t.totalFretesComparado).toBeNull();
  });
});

describe("cross-filter", () => {
  it("clicar de novo desmarca; cada gráfico ignora a própria dimensão", () => {
    let c = alternarCruzado({}, "transportadora", "tA");
    expect(c.transportadora).toBe("tA");
    c = alternarCruzado(c, "transportadora", "tA");
    expect(c.transportadora).toBeUndefined();

    const fretes = [frete({ id: "a", transportadoraId: "tA" }), frete({ id: "b", transportadoraId: "tB", valorTotal: 5000 })];
    const a = analisarFretes({ fretes, pagamentos: [], abastecimentos: [], pedidos: [] }, { transportadora: "tA" }, nomes);
    expect(a.qtdFretes).toBe(1);
    // o ranking da própria dimensão continua mostrando as duas
    expect(a.topTransportadoras.map((t) => t.id)).toEqual(["tB", "tA"]);
    expect(cruzarFretes(fretes, { mes: "2026-04" })).toHaveLength(0);
  });
});

describe("saldos (view) e cards", () => {
  const saldos: SaldoPainel[] = [
    { transportadoraId: "tA", nome: "Transp A", ehTransportadora: true, ehDonaDeTanque: false, ehPropria: false, saldo: 500, creditoFreteTotal: 800, pagoFreteTotal: 300, debitoCombustivelTotal: 0 },
    { transportadoraId: "etam", nome: "ETAM", ehTransportadora: true, ehDonaDeTanque: false, ehPropria: true, saldo: 9999, creditoFreteTotal: 0, pagoFreteTotal: 0, debitoCombustivelTotal: 0 },
    { transportadoraId: "posto", nome: "Posto", ehTransportadora: false, ehDonaDeTanque: true, ehPropria: false, saldo: 700, creditoFreteTotal: 0, pagoFreteTotal: 0, debitoCombustivelTotal: 40 },
  ];

  it("A pagar EMT soma transportadoras e donas de tanque, fora a própria empresa", () => {
    const p = passivoEmt(saldos);
    expect(p.total).toBe(1200);
    expect(p.linhas.map((l) => l.id)).toEqual(["posto", "tA"]);
  });

  it("card: crédito, pago e débito de combustível só quando há; fornecedor fora da view é zero", () => {
    const cards = cardsDeSaldo(["posto", "britam", "sumiu"], { ...nomes.fornecedor, posto: "Posto" }, saldos);
    expect(cards.map((c) => c.titulo)).toEqual(["Saldo Posto", "Saldo Britam"]);
    expect(cards[0]!.linhas.map((l) => l.rotulo)).toEqual(["Crédito Frete", "Pago Frete", "Débito Combustível"]);
    expect(cards[1]!.saldo).toBe(0);
    expect(cards[1]!.linhas).toHaveLength(2);
  });

  it("configurar cards pede painel/ver E pagamentos/criar", () => {
    const com = (lista: string[]) => (r: string, a: string) => lista.includes(`${r}/${a}`);
    expect(podeConfigurarCards(com(["frete.painel/ver", "frete.pagamentos/criar"]))).toBe(true);
    expect(podeConfigurarCards(com(["frete.painel/ver"]))).toBe(false);
    expect(podeConfigurarCards(com(["frete.pagamentos/criar"]))).toBe(false);
  });
});

describe("analytics", () => {
  it("KPIs, top pedreiras sem transferência, evolução mensal em toneladas arredondadas", () => {
    const fretes = [
      frete({ id: "a", peso: 10.4, valorTotal: 100, km: 50, dataChegada: null }),
      frete({ id: "b", peso: 20, valorTotal: 300, km: 150, data: "2026-04-02" }),
      frete({ id: "t", tipo: "transferencia", origemId: "lUsina", peso: 5, valorTotal: 100, km: 0 }),
    ];
    const a = analisarFretes({ fretes, pagamentos: [], abastecimentos: [], pedidos: [] }, {}, nomes);
    expect(a.totalFretes).toBe(500);
    expect(a.custoMedioPorTon).toBeCloseTo(500 / 35.4, 9);
    expect(a.custoMedioPorKm).toBe(500 / 200);
    expect(a.entregues).toBe(2);
    expect(a.topPedreiras.map((p) => p.id)).toEqual(["lBritam"]);
    expect(a.topPedreiras[0]!.custoMedio).toBeCloseTo(400 / 30.4, 9);
    expect(a.evolucaoMensal).toEqual([
      { ym: "2026-03", rotulo: "Mar/26", valor: 200, qtd: 2, toneladas: 15 },
      { ym: "2026-04", rotulo: "Abr/26", valor: 300, qtd: 1, toneladas: 20 },
    ]);
  });

  it("top soma antes de cortar (8)", () => {
    const fretes = [
      ...Array.from({ length: 9 }, (_, i) => frete({ id: `x${i}`, transportadoraId: `t${i}`, valorTotal: 10 + i })),
      frete({ id: "y1", transportadoraId: "t0", valorTotal: 50 }),
    ];
    const a = analisarFretes({ fretes, pagamentos: [], abastecimentos: [], pedidos: [] }, {}, nomes);
    expect(a.topTransportadoras).toHaveLength(8);
    expect(a.topTransportadoras[0]).toMatchObject({ id: "t0", valor: 60, qtd: 2 });
  });

  it("materiais: com filtro de material só contam os itens dele; último preço do pedido mais novo", () => {
    const pedidos = [
      pedido({ id: "1", data: "2026-01-01", itens: [{ insumoId: "brita", quantidade: 10, valorUnitario: 100 }, { insumoId: "bgs", quantidade: 5, valorUnitario: 80 }] }),
      pedido({ id: "2", data: "2026-02-01", itens: [{ insumoId: "brita", quantidade: 10, valorUnitario: 110 }] }),
    ];
    const bases = { fretes: [], pagamentos: [], abastecimentos: [], pedidos };
    const todos = analisarMateriais(bases, {}, nomes);
    expect(todos.totalComprado).toBe(1000 + 400 + 1100);
    expect(todos.topMateriais[0]).toMatchObject({ id: "brita", ultimoPreco: 110, precoMedio: 105 });
    const soBgs = analisarMateriais(bases, { insumoId: "bgs" }, nomes);
    expect(soBgs.totalComprado).toBe(400);
    expect(soBgs.pedidosEmitidos).toBe(1);
  });
});

describe("tabelas", () => {
  it("resumo por transportadora: TKM = Σ km×peso, valor médio do TKM = média simples", () => {
    const fretes = [frete({ id: "a", km: 100, peso: 30, valorTkm: 0.35, valorTotal: 1050 }), frete({ id: "b", km: 50, peso: 20, valorTkm: 0.37, valorTotal: 370 })];
    const r = resumoPorTransportadora(fretes, SEM_FILTRO_LOCAL, nomes);
    expect(r.linhas[0]).toMatchObject({ id: "tA", totalTkm: 4000, valor: 1420 });
    expect(r.linhas[0]!.tkmMedio).toBeCloseTo(0.36, 9);
    expect(resumoPorTransportadora(fretes, { ...SEM_FILTRO_LOCAL, destinos: ["lUsina"] }, nomes).linhas).toHaveLength(0);
  });

  it("empresa × método na ordem da origem", () => {
    const r = pagamentosEmpresaMetodo([pag({ metodo: "combustivel", valor: 5 }), pag({ id: "b", metodo: "boleto", valor: 7 }), pag({ id: "c", pagoPor: " ", valor: 99 })]);
    expect(r.colunas).toEqual(["boleto", "combustivel"]);
    expect(r.total).toBe(12);
  });

  it("pagamentos por empresa somam as saídas de carreta como Areacre", () => {
    const abast: AbastecimentoPainel[] = [
      { id: "s1", data: "2026-03-01", transportadoraId: "tA", placa: "AAA1A11", litros: 100, valorTotal: 600 },
      { id: "s2", data: "2026-03-02", transportadoraId: "tB", placa: "", litros: 50, valorTotal: 300 },
    ];
    const r = pagamentosPorEmpresa([pag({ valor: 100 }), pag({ id: "b", pagoPor: "Areacre", valor: 10 })], abast);
    expect(r.linhas).toEqual([
      { empresa: "Areacre", valor: 910, count: 3 },
      { empresa: "EMT Construtora", valor: 100, count: 1 },
    ]);
    const porEmpresa = abastecimentosPorEmpresa(abast, nomes);
    expect(porEmpresa.empresas[0]!.empresa).toBe("Transp A");
    expect(porEmpresa.empresas[1]!.placas[0]!.placa).toBe("Sem placa");
  });

  it("saldo na pedreira do painel: filtro de local só no transportado; cards de material aparecem", () => {
    const fretes = [frete({ id: "a", destinoId: "lObra", peso: 30 }), frete({ id: "b", destinoId: "lUsina", peso: 20 })];
    const semLocal = tabelaSaldoPedreira([pedido({})], fretes, { fornecedores: [], materiais: [], destinos: [] }, new Set(["formate"]), nomes);
    expect(semLocal.grupos.map((g) => g.fornecedorId)).toEqual(["britam", "formate"]);
    expect(semLocal.grupos[0]!.linhas[0]!.saldoQtd).toBe(50);
    const soObra = tabelaSaldoPedreira([pedido({})], fretes, { fornecedores: [], materiais: [], destinos: ["lObra"] }, new Set(), nomes);
    expect(soObra.grupos[0]!.linhas[0]!.saldoQtd).toBe(70);
    expect(soObra.opcoesFornecedores.map((o) => o.valor)).toEqual(["britam"]);
  });

  it("custo material + frete: preço ponderado do pedido da pedreira da origem, sem transferência", () => {
    const pedidos = [
      pedido({ itens: [{ insumoId: "brita", quantidade: 100, valorUnitario: 100 }] }),
      pedido({ id: "2", itens: [{ insumoId: "brita", quantidade: 100, valorUnitario: 140 }] }),
    ];
    const fretes = [frete({ peso: 10, valorTotal: 200 }), frete({ id: "t", tipo: "transferencia", origemId: "lUsina", valorTotal: 999 })];
    const r = custoMaterialFrete(fretes, agregarPedidos(pedidos), SEM_FILTRO_LOCAL, nomes);
    expect(r.pedreiras).toHaveLength(1);
    const linha = r.pedreiras[0]!.destinos[0]!.linhas[0]!;
    expect(linha.custoUnitMaterial).toBe(120);
    expect(linha.custoTotalMaterial).toBe(1200);
    expect(linha.custoTotal).toBe(1400);
    expect(linha.custoFretePorTon).toBe(20);
  });

  it("gasto com transporte e material transportado incluem a transferência (como a origem)", () => {
    const fretes = [frete({ valorTotal: 100 }), frete({ id: "t", tipo: "transferencia", origemId: "lUsina", valorTotal: 50, dataChegada: null })];
    expect(gastoTransportePorPedreira(fretes, SEM_FILTRO_LOCAL, nomes).total.valor).toBe(150);
    const mt = materialTransportado(fretes, SEM_FILTRO_LOCAL);
    expect(mt.total).toMatchObject({ entregue: 1, transito: 1, total: 60 });
  });

  it("gasto por obra ignora frete sem obra; último preço usa o pedido e o frete de pedreira mais novos", () => {
    const fretes = [
      frete({ id: "a", obraId: null, valorTotal: 10, data: "2026-03-01" }),
      frete({ id: "b", valorTotal: 300, peso: 10, data: "2026-03-05", transportadoraId: "tB" }),
      frete({ id: "t", tipo: "transferencia", valorTotal: 999, peso: 1, data: "2026-03-09" }),
    ];
    expect(gastoPorObra(fretes, nomes)).toEqual([{ id: "o1", nome: "Obra 1", valor: 1299 }]);
    const up = ultimoPrecoPorMaterial(
      [pedido({ data: "2026-02-01", itens: [{ insumoId: "brita", quantidade: 1, valorUnitario: 130 }] }), pedido({ id: "2", data: "2026-01-01" })],
      fretes,
      nomes,
    );
    expect(up).toEqual([
      expect.objectContaining({ insumoId: "brita", valorUnitario: 130, data: "2026-02-01", fretePorTon: 30, freteTransportadora: "Transp B" }),
    ]);
  });
});
