// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const exigirPermissao = vi.fn();
const rpc = vi.fn();
const createClient = vi.fn(() => Promise.resolve({ rpc }));

vi.mock("@/lib/permissoes", () => ({ exigirPermissao: (...args: unknown[]) => exigirPermissao(...args) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/erros", () => ({
  erroAcao: (_contexto: string, _erro: unknown, mensagem: string) => ({ erro: mensagem }),
}));

import { conferirAnomaliaFrete } from "@/modules/frete/anomalias/actions";

const FRETE = "c4e0f922-3aec-4c72-8089-225523e04557";

beforeEach(() => {
  exigirPermissao.mockReset();
  rpc.mockReset();
  createClient.mockClear();
});

describe("conferirAnomaliaFrete", () => {
  it("sem frete.anomalias/editar: recusa e nem abre o banco", async () => {
    exigirPermissao.mockRejectedValue(new Error("Sem permissão"));
    expect(await conferirAnomaliaFrete({ chave: `F1-${FRETE}`, conferida: true })).toEqual({
      erro: "Sem permissão para conferir anomalias",
    });
    expect(exigirPermissao).toHaveBeenCalledWith("frete.anomalias", "editar");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("chave fora do formato das regras, ou com caractere de controle, é recusada", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    expect(await conferirAnomaliaFrete({ chave: "D1-x", conferida: true })).toEqual({ erro: "Anomalia inválida" });
    expect(await conferirAnomaliaFrete({ chave: "F3-a\x00b", conferida: true })).toEqual({ erro: "Anomalia inválida" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("marca a carga repetida com motivo aparado", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ error: null });
    const chave = "F4-carga-XYZ9Z99|31|brita4|2026-02-02";
    expect(await conferirAnomaliaFrete({ chave, conferida: true, motivo: "  duas viagens  " })).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("fn_frete_conferir_anomalia", { p_chave: chave, p_conferida: true, p_motivo: "duas viagens" });
  });

  it("desmarca sem motivo e sobe o texto da trava do banco", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ error: { code: "P0001", message: "Sem permissão para conferir anomalia" } });
    const r = await conferirAnomaliaFrete({ chave: `F6-${FRETE}`, conferida: false, motivo: "  " });
    expect(rpc).toHaveBeenCalledWith("fn_frete_conferir_anomalia", { p_chave: `F6-${FRETE}`, p_conferida: false });
    expect(r).toEqual({ erro: "Sem permissão para conferir anomalia" });
  });
});
