// @vitest-environment node
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exigirPermissao = vi.fn();
const createClient = vi.fn();
const rpc = vi.fn();
const listarPedidos = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: (...args: unknown[]) => exigirPermissao(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));
vi.mock("@/modules/frete/pagamentos/queries", () => ({ trilhaDoRegistro: vi.fn(async () => []) }));
vi.mock("@/modules/frete/pedidos-material/queries", () => ({
  listarPedidos: () => listarPedidos(),
  listarFornecedoresAtivos: async () => [{ id: FORN, nome: "Britam", nomes: ["Britam", "BRITAS DA AMAZONIA LTDA"] }],
  listarInsumosAtivos: async () => [
    { id: BRITA, nome: "Brita 1", unidade: "t" },
    { id: PO, nome: "Pó de pedra", unidade: "t" },
  ],
}));

const ID = "55555555-5555-4555-8555-555555555555";
const FORN = "44444444-4444-4444-8444-444444444444";
const BRITA = "22222222-2222-4222-8222-222222222222";
const PO = "33333333-3333-4333-8333-333333333333";

import {
  excluirPedido,
  gerarPlanilhaPedidosMaterial,
  importarPedidos,
  restaurarPedido,
  salvarPedido,
} from "@/modules/frete/pedidos-material/actions";
import type { DadosPedido } from "@/modules/frete/pedidos-material/regras";

const DADOS: DadosPedido = {
  data: "2026-09-01",
  fornecedorId: FORN,
  observacoes: null,
  itens: [{ insumoId: BRITA, quantidade: 12.345678, valorUnitario: 85.1234 }],
};

function permitir(...chaves: string[]) {
  exigirPermissao.mockImplementation(async (recurso: string, acao: string) => {
    if (!chaves.includes(`${recurso}/${acao}`)) throw new Error("Sem permissão");
  });
}

async function planilha(linhas: (string | number | null)[][]): Promise<FormData> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pedidos");
  ws.addRow(["Data", "Fornecedor", "Material", "Quantidade", "Valor Unitário", "Observações"]);
  for (const l of linhas) ws.addRow(l);
  const buffer = await wb.xlsx.writeBuffer();
  const formData = new FormData();
  formData.append("arquivo", new File([new Uint8Array(buffer)], "p.xlsx"));
  return formData;
}

describe("actions de pedido de material", () => {
  beforeEach(() => {
    exigirPermissao.mockReset();
    createClient.mockReset();
    rpc.mockReset();
    listarPedidos.mockReset();
    createClient.mockResolvedValue({ rpc });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("criar e editar pedem as ações do recurso da aba", async () => {
    permitir("frete.pedidos-material/editar");
    await expect(salvarPedido(null, DADOS)).resolves.toEqual({ erro: "Sem permissão para criar pedido" });
    permitir("frete.pedidos-material/criar", "frete.fretes/editar");
    await expect(salvarPedido(ID, DADOS)).resolves.toEqual({ erro: "Sem permissão para editar pedido" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("grava pela fn_pedido_material_salvar com os itens (6 casas na quantidade, 4 no preço)", async () => {
    permitir("frete.pedidos-material/criar");
    rpc.mockResolvedValue({ data: ID, error: null });
    await expect(salvarPedido(null, DADOS)).resolves.toEqual({ ok: true, id: ID });
    expect(rpc).toHaveBeenCalledWith("fn_pedido_material_salvar", {
      p_id: null,
      p_dados: {
        data: "2026-09-01",
        fornecedor_id: FORN,
        observacoes: null,
        itens: [{ insumo_id: BRITA, quantidade: 12.345678, valor_unitario: 85.1234 }],
      },
    });
  });

  it("pedido sem item não chega à RPC", async () => {
    permitir("frete.pedidos-material/criar");
    await expect(salvarPedido(null, { ...DADOS, itens: [] })).resolves.toEqual({ erro: "Adicione ao menos um material" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("excluir com motivo e restaurar com as duas permissões", async () => {
    permitir("frete.pedidos-material/excluir");
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(excluirPedido(ID, "duplicado")).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("fn_frete_excluir", { p_tabela: "pedidos_material", p_id: ID, p_motivo: "duplicado" });

    await expect(restaurarPedido(ID)).resolves.toEqual({ erro: "Sem permissão para restaurar pedido" });
    permitir("administracao.lixeira/editar", "frete.pedidos-material/excluir");
    await expect(restaurarPedido(ID)).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenLastCalledWith("fn_frete_restaurar", { p_tabela: "pedidos_material", p_id: ID });
  });

  it("importar agrupa por data e fornecedor e grava um pedido por grupo", async () => {
    permitir("frete.pedidos-material/criar");
    rpc.mockResolvedValue({ data: ID, error: null });
    const formData = await planilha([
      ["2026-01-15", "Britam", "Brita 1", 100, "85,1234", "obs 1"],
      ["2026-01-15", "britas da amazonia ltda", "po de pedra", 50, 40, "ignorada"],
      ["2026-01-16", "Britam", "Brita 1", 10, 80, ""],
      ["2026-01-16", "Pedreira X", "Brita 1", 10, 80, ""],
    ]);
    await expect(importarPedidos(formData)).resolves.toEqual({ importadas: 2, itens: 3, falhas: [] });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1].p_dados).toEqual({
      data: "2026-01-15",
      fornecedor_id: FORN,
      observacoes: "obs 1",
      itens: [
        { insumo_id: BRITA, quantidade: 100, valor_unitario: 85.1234 },
        { insumo_id: PO, quantidade: 50, valor_unitario: 40 },
      ],
    });
  });

  it("pedido recusado pelo banco volta com as linhas dele", async () => {
    permitir("frete.pedidos-material/criar");
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "Selecione o fornecedor" } });
    const formData = await planilha([
      ["2026-01-15", "Britam", "Brita 1", 100, 80, ""],
      ["2026-01-15", "Britam", "Pó de pedra", 1, 1, ""],
    ]);
    await expect(importarPedidos(formData)).resolves.toEqual({
      importadas: 0,
      itens: 0,
      falhas: [
        { linha: 2, erro: "Selecione o fornecedor" },
        { linha: 3, erro: "Selecione o fornecedor" },
      ],
    });
  });

  it("exportar pede ver e devolve o xlsx com Resumo e Detalhamento", async () => {
    permitir();
    await expect(gerarPlanilhaPedidosMaterial({ fornecedorId: "", materialId: "", de: "", ate: "" })).resolves.toEqual({
      erro: "Sem permissão para exportar pedidos de material",
    });

    permitir("frete.pedidos-material/ver");
    listarPedidos.mockResolvedValue([
      {
        id: ID,
        data: "2026-09-01",
        fornecedorId: FORN,
        fornecedorNome: "Britam",
        observacoes: null,
        itens: [{ insumoId: BRITA, insumoNome: "Brita 1", unidade: "t", quantidade: 10, valorUnitario: 85.1234 }],
        valorTotal: 851.234,
      },
    ]);
    const r = await gerarPlanilhaPedidosMaterial({ fornecedorId: "", materialId: BRITA, de: "", ate: "" });
    if (!("ok" in r)) throw new Error(r.erro);
    expect(r.nomeArquivo).toMatch(/^pedidos-material-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(r.base64, "base64") as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumo", "Detalhamento"]);
    const det = wb.getWorksheet("Detalhamento");
    const valores: unknown[] = [];
    det?.eachRow((row) => valores.push(row.getCell(6).value));
    expect(valores).toContain(851.234);
  });

  it("filtro inválido no export é recusado", async () => {
    permitir("frete.pedidos-material/ver");
    await expect(gerarPlanilhaPedidosMaterial({ fornecedorId: "x" })).resolves.toEqual({ erro: "Filtro inválido" });
  });
});
