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

import { conferirAnomalia, revisarSemSuprimento } from "@/modules/combustivel/anomalias/actions";

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
