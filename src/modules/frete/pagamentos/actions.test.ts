// @vitest-environment node
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exigirPermissao = vi.fn();
const createClient = vi.fn();
const rpc = vi.fn();
const listarTransportadoras = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: (...args: unknown[]) => exigirPermissao(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));
vi.mock("@/modules/frete/pagamentos/queries", () => ({
  listarTransportadoras: () => listarTransportadoras(),
  trilhaDoRegistro: vi.fn(async () => []),
}));

import {
  excluirPagamento,
  importarPagamentos,
  restaurarPagamento,
  salvarPagamento,
  validarImportPagamentos,
} from "@/modules/frete/pagamentos/actions";
import type { DadosPagamento } from "@/modules/frete/pagamentos/regras";

const ID = "55555555-5555-4555-8555-555555555555";
const TRANSP = "11111111-1111-4111-8111-111111111111";
const DADOS: DadosPagamento = {
  data: "2026-09-10",
  transportadoraId: TRANSP,
  mesReferencia: "2026-08",
  valor: 1500.2575,
  metodo: "pix",
  quantidadeCombustivel: 0,
  responsavel: "Tiago",
  notaFiscal: null,
  pagoPor: "EMT Construtora",
  observacoes: null,
};

/** Permissões que o usuário de mentira tem. */
function permitir(...chaves: string[]) {
  exigirPermissao.mockImplementation(async (recurso: string, acao: string) => {
    if (!chaves.includes(`${recurso}/${acao}`)) throw new Error("Sem permissão");
  });
}

async function planilha(linhas: (string | number | null)[][]): Promise<FormData> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pagamentos");
  ws.addRow(["Data", "Transportadora", "Mês Referência", "Valor", "Método", "Responsavel", "NF", "Pago Por", "Observações"]);
  for (const l of linhas) ws.addRow(l);
  const buffer = await wb.xlsx.writeBuffer();
  const formData = new FormData();
  formData.append("arquivo", new File([new Uint8Array(buffer)], "p.xlsx"));
  return formData;
}

describe("actions de pagamento de frete", () => {
  beforeEach(() => {
    exigirPermissao.mockReset();
    createClient.mockReset();
    rpc.mockReset();
    listarTransportadoras.mockReset();
    createClient.mockResolvedValue({ rpc });
    listarTransportadoras.mockResolvedValue([{ id: TRANSP, nome: "ETAM", ativo: true, nomes: ["ETAM"] }]);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("criar pede frete.pagamentos/criar e nem abre o banco sem ela", async () => {
    permitir("frete.pagamentos/editar");
    await expect(salvarPagamento(null, DADOS)).resolves.toEqual({ erro: "Sem permissão para registrar pagamento" });
    expect(exigirPermissao).toHaveBeenCalledWith("frete.pagamentos", "criar");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("editar pede frete.pagamentos/editar (não a chave do frete, como a origem)", async () => {
    permitir("frete.pagamentos/criar", "frete.fretes/editar");
    await expect(salvarPagamento(ID, DADOS)).resolves.toEqual({ erro: "Sem permissão para editar pagamento" });
    expect(exigirPermissao).toHaveBeenCalledWith("frete.pagamentos", "editar");
  });

  it("dado inválido não chega à RPC", async () => {
    permitir("frete.pagamentos/criar");
    const r = await salvarPagamento(null, { ...DADOS, valor: 0 });
    expect("erro" in r).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("cria com p_id nulo e o p_dados que a RPC lê, devolvendo o id novo", async () => {
    permitir("frete.pagamentos/criar");
    rpc.mockResolvedValue({ data: ID, error: null });
    await expect(salvarPagamento(null, DADOS)).resolves.toEqual({ ok: true, id: ID });
    expect(rpc).toHaveBeenCalledWith("fn_frete_pagamento_salvar", {
      p_id: null,
      p_dados: {
        data: "2026-09-10",
        transportadora_id: TRANSP,
        mes_referencia: "2026-08-01",
        valor: 1500.2575,
        metodo: "pix",
        quantidade_combustivel: 0,
        responsavel: "Tiago",
        nota_fiscal: null,
        pago_por: "EMT Construtora",
        observacoes: null,
      },
    });
  });

  it("a trava do banco (P0001) chega à tela com o texto dela; erro técnico não", async () => {
    permitir("frete.pagamentos/criar");
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "O fornecedor escolhido não está marcado como transportadora no cadastro" },
    });
    await expect(salvarPagamento(null, DADOS)).resolves.toEqual({
      erro: "O fornecedor escolhido não está marcado como transportadora no cadastro",
    });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "23514", message: "violates check constraint" } });
    await expect(salvarPagamento(null, DADOS)).resolves.toEqual({
      erro: "Não foi possível salvar o pagamento. Tente novamente",
    });
  });

  it("excluir pede excluir e motivo, e chama fn_frete_excluir na tabela certa", async () => {
    permitir("frete.pagamentos/excluir");
    await expect(excluirPagamento(ID, "  ")).resolves.toEqual({ erro: "Informe o motivo da exclusão" });
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(excluirPagamento(ID, " lançado em dobro ")).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("fn_frete_excluir", {
      p_tabela: "frete_pagamentos",
      p_id: ID,
      p_motivo: "lançado em dobro",
    });
  });

  it("excluir sem a permissão é recusado", async () => {
    permitir("frete.pagamentos/editar");
    await expect(excluirPagamento(ID, "motivo")).resolves.toEqual({ erro: "Sem permissão para excluir pagamento" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("restaurar exige administracao.lixeira/editar E frete.pagamentos/excluir", async () => {
    permitir("administracao.lixeira/editar");
    await expect(restaurarPagamento(ID)).resolves.toEqual({ erro: "Sem permissão para restaurar pagamento" });
    permitir("frete.pagamentos/excluir");
    await expect(restaurarPagamento(ID)).resolves.toEqual({ erro: "Sem permissão para restaurar pagamento" });
    expect(rpc).not.toHaveBeenCalled();

    permitir("administracao.lixeira/editar", "frete.pagamentos/excluir");
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(restaurarPagamento(ID)).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("fn_frete_restaurar", { p_tabela: "frete_pagamentos", p_id: ID });
  });

  it("prévia da importação separa linhas boas e recusadas, com o número da linha", async () => {
    permitir("frete.pagamentos/criar");
    const formData = await planilha([
      ["2026-01-15", "ETAM", "2026-01", 5000, "pix", "Carlos", "NF-1", "EMT Construtora", ""],
      ["2026-01-16", "Areacre", "2026-01", 100, "pix", "Carlos", "", "EMT Construtora", ""],
    ]);
    const resumo = await validarImportPagamentos(formData);
    expect(resumo.validas).toBe(1);
    expect(resumo.totalLinhas).toBe(2);
    expect(resumo.invalidas).toEqual([{ linha: 3, erros: ['Transportadora "Areacre" não encontrada'] }]);
  });

  it("importar grava linha a linha e devolve as recusadas pelo banco sem derrubar as outras", async () => {
    permitir("frete.pagamentos/criar");
    rpc
      .mockResolvedValueOnce({ data: ID, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "Valor deve ser > 0" } })
      .mockResolvedValueOnce({ data: ID, error: null });
    const formData = await planilha([
      ["2026-01-15", "ETAM", "2026-01", 5000, "pix", "Carlos", "", "EMT Construtora", ""],
      ["2026-01-16", "ETAM", "2026-01", 10, "boleto", "Carlos", "", "EMT Construtora", ""],
      ["2026-01-17", "ETAM", "02/2026", "1.234,56", "", "Carlos", "", "Fulano", ""],
    ]);
    await expect(importarPagamentos(formData)).resolves.toEqual({
      importadas: 2,
      falhas: [{ linha: 3, erro: "Valor deve ser > 0" }],
    });
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls[2][1].p_dados).toMatchObject({ mes_referencia: "2026-02-01", valor: 1234.56, metodo: "pix" });
  });

  it("importar sem permissão de criar é recusado", async () => {
    permitir();
    await expect(importarPagamentos(new FormData())).resolves.toEqual({ erro: "Sem permissão para importar pagamentos" });
  });
});
