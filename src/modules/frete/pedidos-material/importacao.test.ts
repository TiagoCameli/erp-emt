// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  agruparPedidos,
  COLUNAS_PEDIDOS,
  lerLinhaPedido,
  mensagemImportados,
  type LinhaCruaPedido,
} from "@/modules/frete/pedidos-material/importacao";
import { achatarItens, consolidarPedidos, nomeArquivoPedidos, percentual } from "@/modules/frete/pedidos-material/relatorio";
import { FILTROS_PEDIDOS_VAZIOS } from "@/modules/frete/pedidos-material/regras";

const CADASTROS = {
  fornecedores: [
    { id: "f-britam", nomes: ["Britam", "BRITAS DA AMAZONIA LTDA"] },
    { id: "f-areal", nomes: ["Areal Acre"] },
  ],
  insumos: [
    { id: "i-brita", nomes: ["Brita 1"] },
    { id: "i-po", nomes: ["Pó de pedra"] },
  ],
};

const LINHA: LinhaCruaPedido = {
  data: "2026-01-15",
  fornecedor: "britam",
  material: "BRITA 1",
  quantidade: 100,
  valorUnitario: "85,1234",
  observacoes: "",
};

describe("importação de pedidos (template_pedidos_material.xlsx)", () => {
  it("colunas da origem, na ordem", () => {
    expect(COLUNAS_PEDIDOS.map((c) => c.rotulo)).toEqual([
      "Data",
      "Fornecedor",
      "Material",
      "Quantidade",
      "Valor Unitário",
      "Observações",
    ]);
  });

  it("linha boa casa fornecedor e material pelo nome", () => {
    expect(lerLinhaPedido(LINHA, CADASTROS)).toEqual({
      erros: [],
      dados: {
        data: "2026-01-15",
        fornecedorId: "f-britam",
        observacoes: "",
        item: { insumoId: "i-brita", quantidade: 100, valorUnitario: 85.1234 },
      },
    });
    expect(lerLinhaPedido({ ...LINHA, material: "po de pedra" }, CADASTROS).dados?.item.insumoId).toBe("i-po");
  });

  it("erros da origem para o que falta ou não casa", () => {
    expect(lerLinhaPedido({ observacoes: "x" }, CADASTROS).erros).toEqual([
      "Falta data",
      "Falta fornecedor",
      "Falta material",
      "Falta quantidade",
      "Falta valor unitário",
    ]);
    expect(lerLinhaPedido({ ...LINHA, fornecedor: "Pedreira X", material: "Seixo" }, CADASTROS).erros).toEqual([
      'Fornecedor "Pedreira X" não encontrado',
      'Material "Seixo" não encontrado',
    ]);
  });

  it("quantidade e valor precisam ser > 0 (o banco exige)", () => {
    expect(lerLinhaPedido({ ...LINHA, quantidade: 0, valorUnitario: -1 }, CADASTROS).erros).toEqual([
      "Quantidade deve ser > 0",
      "Valor unitário deve ser > 0",
    ]);
  });

  it("agrupa por data e fornecedor num pedido só, com a observação da primeira linha", () => {
    const item = (insumoId: string) => ({ insumoId, quantidade: 1, valorUnitario: 2 });
    const grupos = agruparPedidos([
      { linha: 2, dados: { data: "2026-01-15", fornecedorId: "f-britam", observacoes: "primeira", item: item("i-brita") } },
      { linha: 3, dados: { data: "2026-01-15", fornecedorId: "f-areal", observacoes: "", item: item("i-po") } },
      { linha: 4, dados: { data: "2026-01-15", fornecedorId: "f-britam", observacoes: "segunda", item: item("i-po") } },
      { linha: 5, dados: { data: "2026-01-16", fornecedorId: "f-britam", observacoes: "", item: item("i-brita") } },
    ]);
    expect(grupos).toHaveLength(3);
    expect(grupos[0]).toEqual({
      linhas: [2, 4],
      dados: { data: "2026-01-15", fornecedorId: "f-britam", observacoes: "primeira", itens: [item("i-brita"), item("i-po")] },
    });
    expect(grupos[1].dados.observacoes).toBeNull();
    expect(grupos[2].linhas).toEqual([5]);
  });

  it("toast da origem", () => {
    expect(mensagemImportados(3, 7)).toBe("3 pedidos importados com sucesso (7 itens)");
    expect(mensagemImportados(1, 1)).toBe("1 pedido importado com sucesso (1 item)");
  });
});

describe("export de pedidos (pedidosMaterialExport da origem)", () => {
  const pedidos = [
    {
      data: "2026-08-01",
      fornecedorId: "f1",
      fornecedorNome: "Britam",
      observacoes: null,
      itens: [
        { insumoId: "i-brita", insumoNome: "Brita 1", quantidade: 10, valorUnitario: 80 },
        { insumoId: "i-po", insumoNome: "Pó de pedra", quantidade: 5, valorUnitario: 40 },
      ],
    },
    {
      data: "2026-09-01",
      fornecedorId: "f2",
      fornecedorNome: "Areal",
      observacoes: "urgente",
      itens: [{ insumoId: "i-brita", insumoNome: "Brita 1", quantidade: 20, valorUnitario: 90 }],
    },
  ];

  it("com filtro de material, achata só os itens daquele material", () => {
    expect(achatarItens(pedidos, "i-brita").map((i) => i.subtotal)).toEqual([800, 1800]);
    expect(achatarItens(pedidos, "").map((i) => i.observacoes)).toEqual(["-", "-", "urgente"]);
  });

  it("KPIs e as tabelas por fornecedor e por material ordenadas por valor", () => {
    const dados = consolidarPedidos(pedidos, FILTROS_PEDIDOS_VAZIOS);
    expect(dados.pedidos).toBe(2);
    expect(dados.itens).toHaveLength(3);
    expect(dados.quantidadeTotal).toBe(35);
    expect(dados.valorTotal).toBe(2800);
    expect(dados.porFornecedor).toEqual([
      { chave: "Areal", registros: 1, quantidade: 20, valor: 1800 },
      { chave: "Britam", registros: 2, quantidade: 15, valor: 1000 },
    ]);
    expect(dados.porMaterial[0]).toEqual({ chave: "Brita 1", registros: 2, quantidade: 30, valor: 2600 });
    expect(percentual(1800, 2800)).toBeCloseTo(0.642857, 5);
    expect(percentual(0, 0)).toBe(0);
    expect(nomeArquivoPedidos("2026-09-24")).toBe("pedidos-material-2026-09-24.xlsx");
  });
});
