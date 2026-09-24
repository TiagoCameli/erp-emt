import { describe, expect, it } from "vitest";

import {
  agregarPedidos,
  agregarTransporte,
  apenasFretesDePedreira,
  custoUnitarioDoPedido,
  saldoNaPedreira,
  saldosEmToneladas,
  tipoDoFrete,
  type FreteDaPedreira,
  type PedidoDaPedreira,
} from "./pedreira";

const BRITAM = "11111111-1111-4111-8111-111111111111";
const FORMATE = "22222222-2222-4222-8222-222222222222";
const BRITA4 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BGS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function frete(over: Partial<FreteDaPedreira>): FreteDaPedreira {
  return { tipo: "material", pedreiraId: BRITAM, insumoId: BRITA4, peso: 30, valorTotal: 1000, valorMaterial: 30 * 121.98, ...over };
}
function pedido(over: Partial<PedidoDaPedreira>): PedidoDaPedreira {
  return { fornecedorId: BRITAM, itens: [{ insumoId: BRITA4, quantidade: 100, valorUnitario: 121.98 }], ...over };
}
const nome = (id: string) => ({ [BRITAM]: "Britam", [FORMATE]: "Formate" })[id] ?? id;

describe("tipo do frete", () => {
  it("ausente, nulo ou desconhecido é material", () => {
    expect(tipoDoFrete({})).toBe("material");
    expect(tipoDoFrete({ tipo: null })).toBe("material");
    expect(tipoDoFrete({ tipo: "xyz" })).toBe("material");
    expect(tipoDoFrete({ tipo: "transferencia" })).toBe("transferencia");
    expect(apenasFretesDePedreira([{ tipo: "transferencia" }, { tipo: "material" }])).toHaveLength(1);
  });
});

describe("saldo na pedreira", () => {
  it("pedido − transportado em t e em R$ (Σ pedido − Σ valor de material)", () => {
    const pedidos = agregarPedidos([pedido({})]);
    const transporte = agregarTransporte([frete({}), frete({ peso: 20, valorMaterial: 20 * 121.98 })]);
    const { grupos, total } = saldoNaPedreira({ pedidos, transporte, nomeFornecedor: nome });
    expect(grupos).toHaveLength(1);
    const linha = grupos[0]!.linhas[0]!;
    expect(linha.qtd).toBe(100);
    expect(linha.qtdTransportada).toBe(50);
    expect(linha.saldoQtd).toBe(50);
    expect(linha.saldoValor).toBeCloseTo(100 * 121.98 - 50 * 121.98, 6);
    expect(linha.custoMedioFrete).toBe(2000 / 50);
    expect(total.saldoQtd).toBe(50);
  });

  it("transferência não desconta; controle: o mesmo frete como material desconta", () => {
    const pedidos = agregarPedidos([pedido({})]);
    const comTransf = saldoNaPedreira({
      pedidos,
      transporte: agregarTransporte([frete({ tipo: "transferencia", peso: 150 })]),
      nomeFornecedor: nome,
    });
    const comMaterial = saldoNaPedreira({
      pedidos,
      transporte: agregarTransporte([frete({ tipo: "material", peso: 150 })]),
      nomeFornecedor: nome,
    });
    expect(comTransf.grupos[0]!.linhas[0]!.saldoQtd).toBe(100);
    expect(comMaterial.grupos[0]!.linhas[0]!.saldoQtd).toBe(-50);
  });

  it("frete de localidade sem pedreira fica fora; controle: com pedreira entra", () => {
    const pedidos = agregarPedidos([pedido({})]);
    const sem = agregarTransporte([frete({ pedreiraId: null })]);
    const com = agregarTransporte([frete({})]);
    expect(sem.size).toBe(0);
    expect(com.size).toBe(1);
    expect(saldoNaPedreira({ pedidos, transporte: sem, nomeFornecedor: nome }).grupos[0]!.linhas[0]!.saldoQtd).toBe(100);
  });

  it("zera o resíduo abaixo de 0,001 t e de R$ 0,01", () => {
    const pedidos = agregarPedidos([pedido({ itens: [{ insumoId: BRITA4, quantidade: 30.0004, valorUnitario: 10 }] })]);
    const transporte = agregarTransporte([frete({ peso: 30, valorMaterial: 300.001 })]);
    const linha = saldoNaPedreira({ pedidos, transporte, nomeFornecedor: nome }).grupos[0]!.linhas[0]!;
    expect(linha.saldoQtd).toBe(0);
    expect(linha.saldoValor).toBe(0);
    // Controle: 0,002 t não zera.
    const outra = saldoNaPedreira({
      pedidos: agregarPedidos([pedido({ itens: [{ insumoId: BRITA4, quantidade: 30.002, valorUnitario: 10 }] })]),
      transporte,
      nomeFornecedor: nome,
    }).grupos[0]!.linhas[0]!;
    expect(outra.saldoQtd).toBeCloseTo(0.002, 6);
  });

  it("material só transportado entra com pedido zero; pedreira sem pedido não vira grupo", () => {
    const pedidos = agregarPedidos([pedido({})]);
    const transporte = agregarTransporte([frete({ insumoId: BGS, peso: 10 }), frete({ pedreiraId: FORMATE, peso: 5 })]);
    const { grupos } = saldoNaPedreira({ pedidos, transporte, nomeFornecedor: nome });
    expect(grupos.map((g) => g.fornecedorId)).toEqual([BRITAM]);
    const bgs = grupos[0]!.linhas.find((l) => l.insumoId === BGS)!;
    expect(bgs.qtd).toBe(0);
    expect(bgs.saldoQtd).toBe(-10);
  });

  it("fornecedor dos cards aparece sem pedido; filtros de fornecedor e material", () => {
    const pedidos = agregarPedidos([pedido({})]);
    const transporte = agregarTransporte([]);
    const r = saldoNaPedreira({ pedidos, transporte, sempreVisiveis: new Set([FORMATE]), nomeFornecedor: nome });
    expect(r.grupos.map((g) => [g.fornecedorId, g.visivel])).toEqual([
      [BRITAM, true],
      [FORMATE, true],
    ]);
    const filtrado = saldoNaPedreira({ pedidos, transporte, fornecedores: [FORMATE], nomeFornecedor: nome });
    expect(filtrado.grupos).toHaveLength(0);
    const semMaterial = saldoNaPedreira({ pedidos, transporte, materiais: [BGS], nomeFornecedor: nome });
    expect(semMaterial.grupos[0]!.visivel).toBe(false);
    expect(semMaterial.total.qtd).toBe(0);
  });

  it("preços distintos com tolerância de R$ 0,005 e custo unitário ponderado", () => {
    const pedidos = agregarPedidos([
      pedido({
        itens: [
          { insumoId: BRITA4, quantidade: 100, valorUnitario: 100 },
          { insumoId: BRITA4, quantidade: 100, valorUnitario: 100.004 },
          { insumoId: BRITA4, quantidade: 200, valorUnitario: 130 },
        ],
      }),
    ]);
    expect(pedidos.porChave.values().next().value!.precos).toEqual([100, 130]);
    expect(custoUnitarioDoPedido(pedidos, BRITAM, BRITA4)).toBeCloseTo((10000 + 10000.4 + 26000) / 400, 6);
    expect(custoUnitarioDoPedido(pedidos, null, BRITA4)).toBe(0);
    expect(custoUnitarioDoPedido(pedidos, FORMATE, BRITA4)).toBe(0);
  });

  it("saldo em toneladas só para quem tem transporte", () => {
    const pedidos = agregarPedidos([pedido({}), pedido({ fornecedorId: FORMATE })]);
    const s = saldosEmToneladas(pedidos, agregarTransporte([frete({ peso: 120 })]));
    expect(s).toEqual([{ fornecedorId: BRITAM, insumoId: BRITA4, qtdPedida: 100, qtdTransportada: 120, saldo: -20 }]);
  });
});
