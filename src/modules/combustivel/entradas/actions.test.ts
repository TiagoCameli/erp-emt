// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const exigirPermissao = vi.fn();
const createClient = vi.fn();
const rpc = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: (...args: unknown[]) => exigirPermissao(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));

import { excluirEntrada, salvarEntrada } from "@/modules/combustivel/entradas/actions";
import type { EntradaInput } from "@/modules/combustivel/entradas/schemas";

const ID = "55555555-5555-4555-8555-555555555555";
const DADOS: EntradaInput = {
  tanqueId: "11111111-1111-4111-8111-111111111111",
  insumoId: "22222222-2222-4222-8222-222222222222",
  quantidade: 1000,
  valorTotal: 6394.7123,
  fornecedorId: null,
  notaFiscal: "123",
  dataHora: "2026-09-20T14:30:00-05:00",
  observacoes: null,
};

describe("actions de entrada", () => {
  beforeEach(() => {
    exigirPermissao.mockReset();
    createClient.mockReset();
    rpc.mockReset();
    createClient.mockResolvedValue({ rpc });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sem permissão de criar: recusa e nem abre o banco", async () => {
    exigirPermissao.mockRejectedValue(new Error("Sem permissão"));
    await expect(salvarEntrada(null, DADOS)).resolves.toEqual({ erro: "Sem permissão para lançar entrada" });
    expect(exigirPermissao).toHaveBeenCalledWith("combustivel.entradas", "criar");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("editar pede a permissão de editar", async () => {
    exigirPermissao.mockRejectedValue(new Error("Sem permissão"));
    await expect(salvarEntrada(ID, DADOS)).resolves.toEqual({ erro: "Sem permissão para editar entrada" });
    expect(exigirPermissao).toHaveBeenCalledWith("combustivel.entradas", "editar");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("dado inválido não chega à RPC", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    const resultado = await salvarEntrada(null, { ...DADOS, quantidade: 1.12345 });
    expect("erro" in resultado).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("cria com p_id nulo e os números como vieram (4 casas)", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: ID, error: null });
    await expect(salvarEntrada(null, DADOS)).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("fn_comb_salvar_entrada", {
      p_id: null,
      p_tanque: DADOS.tanqueId,
      p_insumo: DADOS.insumoId,
      p_quantidade: 1000,
      p_valor_total: 6394.7123,
      p_fornecedor: null,
      p_nota_fiscal: "123",
      p_data_hora: "2026-09-20T14:30:00-05:00",
      p_observacoes: null,
    });
  });

  it("a trava do banco (P0001) chega à tela com o texto dela", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "A entrada passa da capacidade do tanque (15000.0000 L)" },
    });
    await expect(salvarEntrada(null, DADOS)).resolves.toEqual({
      erro: "A entrada passa da capacidade do tanque (15000.0000 L)",
    });
  });

  it("erro técnico não vaza", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: null, error: { code: "08006", message: "connection failure" } });
    await expect(salvarEntrada(null, DADOS)).resolves.toEqual({
      erro: "Não foi possível salvar a entrada. Tente novamente",
    });
  });

  it("excluir: sem permissão recusa; sem motivo recusa; com motivo vai à fn_comb_excluir", async () => {
    exigirPermissao.mockRejectedValue(new Error("Sem permissão"));
    await expect(excluirEntrada(ID, "erro de digitação")).resolves.toEqual({ erro: "Sem permissão para excluir entrada" });
    expect(createClient).not.toHaveBeenCalled();

    exigirPermissao.mockResolvedValue(undefined);
    await expect(excluirEntrada(ID, "   ")).resolves.toEqual({ erro: "Informe o motivo da exclusão" });
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockResolvedValue({ data: null, error: null });
    await expect(excluirEntrada(ID, " erro de digitação ")).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("fn_comb_excluir", {
      p_tabela: "combustivel_entradas",
      p_id: ID,
      p_motivo: "erro de digitação",
    });
  });

  it("excluir de ciclo fechado: o motivo do banco chega", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    const mensagem = "Movimento de ciclo fechado (antes do reabastecimento de 01/09/2026 08:00): não se altera nem exclui";
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: mensagem } });
    await expect(excluirEntrada(ID, "duplicada")).resolves.toEqual({ erro: mensagem });
  });
});
