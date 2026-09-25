// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const exigirPermissao = vi.fn();
const rpc = vi.fn();
const createClient = vi.fn(() => Promise.resolve({ rpc }));

vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: (...args: unknown[]) => exigirPermissao(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/erros", () => ({
  erroAcao: (_contexto: string, _erro: unknown, mensagem: string) => ({ erro: mensagem }),
}));

import {
  atribuirEquipamento,
  conferirAnomalia,
  conferirAnomalias,
  revisarSemSuprimento,
} from "@/modules/combustivel/anomalias/actions";

const SAIDA = "c4e0f922-3aec-8c72-7089-225523e04557";
const OUTRA = "0b3c5d7e-1111-4222-8333-444455556666";

beforeEach(() => {
  exigirPermissao.mockReset();
  rpc.mockReset();
  createClient.mockClear();
});

describe("conferirAnomalia", () => {
  it("sem combustivel.anomalias/editar: recusa e nem abre o banco", async () => {
    exigirPermissao.mockRejectedValue(new Error("Sem permissão"));
    const resultado = await conferirAnomalia({ chave: `D1-${SAIDA}`, conferida: true });
    expect(resultado).toEqual({ erro: "Sem permissão para conferir anomalias" });
    expect(exigirPermissao).toHaveBeenCalledWith("combustivel.anomalias", "editar");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("chave fora do formato das regras é recusada", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    const resultado = await conferirAnomalia({ chave: "qualquer-coisa", conferida: true });
    expect(resultado).toEqual({ erro: "Anomalia inválida" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("marca com motivo aparado", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ error: null });
    const chave = `D4-${OUTRA}-${SAIDA}`;
    const resultado = await conferirAnomalia({ chave, conferida: true, motivo: "  foram dois tanques  " });
    expect(resultado).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("fn_comb_conferir_anomalia", {
      p_chave: chave,
      p_conferida: true,
      p_motivo: "foram dois tanques",
    });
  });

  it("desmarca sem motivo e sobe o texto da trava do banco", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ error: { code: "P0001", message: "Sem permissão para conferir anomalia" } });
    const resultado = await conferirAnomalia({ chave: `D5-${SAIDA}`, conferida: false, motivo: "   " });
    expect(rpc).toHaveBeenCalledWith("fn_comb_conferir_anomalia", { p_chave: `D5-${SAIDA}`, p_conferida: false });
    expect(resultado).toEqual({ erro: "Sem permissão para conferir anomalia" });
  });
});

describe("conferirAnomalias", () => {
  it("sem permissão: recusa e nem abre o banco", async () => {
    exigirPermissao.mockRejectedValue(new Error("Sem permissão"));
    const resultado = await conferirAnomalias({ chaves: [`D2-${SAIDA}`] });
    expect(resultado).toEqual({ erro: "Sem permissão para conferir anomalias" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("lista vazia ou chave inválida não chegam à RPC", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    expect(await conferirAnomalias({ chaves: [] })).toEqual({ erro: "Selecione ao menos uma anomalia" });
    expect(await conferirAnomalias({ chaves: [`D2-${SAIDA}`, "qualquer-coisa"] })).toEqual({ erro: "Anomalia inválida" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("confere cada chave uma vez, com o mesmo motivo, e devolve quantas", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ error: null });
    const resultado = await conferirAnomalias({
      chaves: [`D2-${SAIDA}`, `D2-${OUTRA}`, `D2-${SAIDA}`],
      motivo: "  preço conferido na nota  ",
    });
    expect(resultado).toEqual({ ok: true, conferidas: 2 });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith("fn_comb_conferir_anomalia", {
      p_chave: `D2-${OUTRA}`,
      p_conferida: true,
      p_motivo: "preço conferido na nota",
    });
  });

  it("falha no meio diz quantas já foram gravadas", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { code: "P0001", message: "Sem permissão para conferir anomalia" } });
    const resultado = await conferirAnomalias({ chaves: [`D2-${SAIDA}`, `D2-${OUTRA}`] });
    expect(resultado).toEqual({ erro: "Sem permissão para conferir anomalia. 1 de 2 já foram conferidas" });
  });
});

describe("revisarSemSuprimento", () => {
  it("sem permissão: recusa e nem abre o banco", async () => {
    exigirPermissao.mockRejectedValue(new Error("Sem permissão"));
    const resultado = await revisarSemSuprimento({ saidaId: SAIDA, revisado: true });
    expect(resultado).toEqual({ erro: "Sem permissão para revisar saídas sem suprimento" });
    expect(exigirPermissao).toHaveBeenCalledWith("combustivel.anomalias", "editar");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("id inválido é recusado", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    const resultado = await revisarSemSuprimento({ saidaId: "nao-e-id", revisado: true });
    expect("erro" in resultado).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("marca revisado com observação e desfaz sem ela", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ error: null });
    expect(await revisarSemSuprimento({ saidaId: SAIDA, revisado: true, observacao: "entrada atrasada" })).toEqual({
      ok: true,
    });
    expect(rpc).toHaveBeenLastCalledWith("fn_comb_revisar_sem_suprimento", {
      p_saida: SAIDA,
      p_revisado: true,
      p_observacao: "entrada atrasada",
    });
    expect(await revisarSemSuprimento({ saidaId: SAIDA, revisado: false })).toEqual({ ok: true });
    expect(rpc).toHaveBeenLastCalledWith("fn_comb_revisar_sem_suprimento", { p_saida: SAIDA, p_revisado: false });
  });

  it("erro inesperado vira mensagem genérica", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ error: { code: "42501", message: "permission denied" } });
    expect(await revisarSemSuprimento({ saidaId: SAIDA, revisado: true })).toEqual({
      erro: "Não foi possível marcar como revisado",
    });
  });
});

describe("atribuirEquipamento", () => {
  const EQUIPAMENTO = "9f2b7c1d-2222-4333-8444-555566667777";

  it("sem combustivel.anomalias/editar (corrigir_anomalias_combustivel da origem): recusa e nem abre o banco", async () => {
    exigirPermissao.mockRejectedValue(new Error("Sem permissão"));
    const resultado = await atribuirEquipamento({ saidaIds: [SAIDA], equipamentoId: EQUIPAMENTO });
    expect(resultado).toEqual({ erro: "Sem permissão para atribuir equipamento" });
    expect(exigirPermissao).toHaveBeenCalledWith("combustivel.anomalias", "editar");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("lista vazia ou id inválido não chegam à RPC", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    expect(await atribuirEquipamento({ saidaIds: [], equipamentoId: EQUIPAMENTO })).toEqual({
      erro: "Selecione ao menos uma saída",
    });
    expect("erro" in (await atribuirEquipamento({ saidaIds: [SAIDA], equipamentoId: "x" }))).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("chama a RPC com a lista (sem repetição) e devolve quantas a RPC atualizou", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: 1, error: null });
    const resultado = await atribuirEquipamento({ saidaIds: [SAIDA, OUTRA, SAIDA], equipamentoId: EQUIPAMENTO });
    expect(rpc).toHaveBeenCalledWith("fn_comb_atribuir_equipamento", {
      p_saidas: [SAIDA, OUTRA],
      p_equipamento: EQUIPAMENTO,
    });
    // A RPC pula a excluída ou a de carreta: o número é o dela, não o pedido.
    expect(resultado).toEqual({ ok: true, atualizadas: 1 });
  });

  it("a trava do banco (P0001) sobe com o texto dela", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "Sem permissão para corrigir anomalias" } });
    expect(await atribuirEquipamento({ saidaIds: [SAIDA], equipamentoId: EQUIPAMENTO })).toEqual({
      erro: "Sem permissão para corrigir anomalias",
    });
  });
});
