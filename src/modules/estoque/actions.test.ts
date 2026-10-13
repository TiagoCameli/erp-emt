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

import { excluirMovimento, restaurarMovimento, salvarEntrada, salvarSaida } from "@/modules/estoque/actions";
import type { EntradaInput, SaidaInput } from "@/modules/estoque/schemas";

// Id real da carga (md5, sem os bits de versão): o schema tem de aceitar.
const ID = "38673fc5-c55a-c7be-8687-e9b1d3589ef1";
const DEPOSITO = "11111111-1111-4111-8111-111111111111";
const INSUMO = "22222222-2222-4222-8222-222222222222";
const OC_ITEM = "33333333-3333-4333-8333-333333333333";
const CENTRO = "44444444-4444-4444-8444-444444444444";

const AVULSA: EntradaInput = {
  ocItemId: null,
  depositoId: DEPOSITO,
  insumoId: INSUMO,
  quantidade: 10,
  valorUnitario: 6.3947,
  data: "2026-10-13",
  notaFiscal: "123",
  observacoes: null,
};

const SAIDA: SaidaInput = {
  depositoId: DEPOSITO,
  insumoId: INSUMO,
  quantidade: 3,
  data: "2026-10-13",
  centroCustoId: CENTRO,
  observacoes: null,
};

describe("actions do estoque", () => {
  beforeEach(() => {
    exigirPermissao.mockReset();
    createClient.mockReset();
    rpc.mockReset();
    createClient.mockResolvedValue({ rpc });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sem permissão de criar entrada: recusa e nem abre o banco", async () => {
    exigirPermissao.mockRejectedValue(new Error("Sem permissão"));
    await expect(salvarEntrada(null, AVULSA)).resolves.toEqual({ erro: "Sem permissão para registrar entrada" });
    expect(exigirPermissao).toHaveBeenCalledWith("estoque.entradas", "criar");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("editar saída pede a permissão de editar saídas", async () => {
    exigirPermissao.mockRejectedValue(new Error("Sem permissão"));
    await expect(salvarSaida(ID, SAIDA)).resolves.toEqual({ erro: "Sem permissão para editar saída" });
    expect(exigirPermissao).toHaveBeenCalledWith("estoque.saidas", "editar");
  });

  it("entrada avulsa vai com insumo e valor unitário, sem item de OC", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: ID, error: null });
    await expect(salvarEntrada(null, AVULSA)).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("fn_estoque_salvar_entrada", {
      p_id: null,
      p_deposito: DEPOSITO,
      p_insumo: INSUMO,
      p_quantidade: 10,
      p_valor_unitario: 6.3947,
      p_data: "2026-10-13",
      p_oc_item: undefined,
      p_nota_fiscal: "123",
      p_observacoes: undefined,
    });
  });

  it("entrada de OC vai sem insumo e sem valor: quem manda é a OC", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: ID, error: null });
    await salvarEntrada(null, { ...AVULSA, ocItemId: OC_ITEM, insumoId: null, valorUnitario: null });
    expect(rpc).toHaveBeenCalledWith(
      "fn_estoque_salvar_entrada",
      expect.objectContaining({ p_oc_item: OC_ITEM, p_insumo: null, p_valor_unitario: null }),
    );
  });

  it("avulsa sem valor unitário não chega à RPC", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    const resultado = await salvarEntrada(null, { ...AVULSA, valorUnitario: null });
    expect(resultado).toEqual({ erro: "Informe o valor unitário" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("quantidade com 5 casas não chega à RPC", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    const resultado = await salvarSaida(null, { ...SAIDA, quantidade: 1.12345 });
    expect("erro" in resultado).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("saída vai com o centro de custo e sem valor: o custo é o PEPS do banco", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: ID, error: null });
    await expect(salvarSaida(null, SAIDA)).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("fn_estoque_salvar_saida", {
      p_id: null,
      p_deposito: DEPOSITO,
      p_insumo: INSUMO,
      p_quantidade: 3,
      p_data: "2026-10-13",
      p_centro_custo: CENTRO,
      p_observacoes: undefined,
    });
  });

  it("saldo insuficiente chega à tela com o texto do banco", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    const mensagem = "Saldo insuficiente de Brita 1 em 06/10/2026: faltam 3";
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: mensagem } });
    await expect(salvarSaida(null, SAIDA)).resolves.toEqual({ erro: mensagem });
  });

  it("erro técnico do banco vira o texto genérico", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: null, error: { code: "23503", message: "violates foreign key constraint" } });
    await expect(salvarSaida(null, SAIDA)).resolves.toEqual({ erro: "Não foi possível salvar a saída. Tente novamente" });
  });

  it("excluir exige motivo e a permissão de excluir da aba certa", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    await expect(excluirMovimento("estoque_entradas", ID, "  ")).resolves.toEqual({ erro: "Informe o motivo da exclusão" });
    expect(exigirPermissao).toHaveBeenCalledWith("estoque.entradas", "excluir");
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(excluirMovimento("estoque_saidas", ID, "lançada em dobro")).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("fn_estoque_excluir", { p_tabela: "estoque_saidas", p_id: ID, p_motivo: "lançada em dobro" });
  });

  it("restaurar pede excluir e chama a RPC", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(restaurarMovimento("estoque_entradas", ID)).resolves.toEqual({ ok: true });
    expect(exigirPermissao).toHaveBeenCalledWith("estoque.entradas", "excluir");
    expect(rpc).toHaveBeenCalledWith("fn_estoque_restaurar", { p_tabela: "estoque_entradas", p_id: ID });
  });
});
