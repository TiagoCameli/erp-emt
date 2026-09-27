// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `carregarBoletim`: "até a última" não manda `p_ate` (a RPC usa o default), e a recusa da RPC
 * volta como a mensagem do banco, nunca como boletim vazio.
 */

const estado = vi.hoisted(() => ({
  chamadas: [] as [string, unknown][],
  resposta: { data: null as unknown, error: null as { message: string } | null },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (nome: string, args: unknown) => {
      estado.chamadas.push([nome, args]);
      return estado.resposta;
    },
  }),
}));

import { carregarBoletim } from "@/modules/medicao/boletim/queries";

const BOLETIM = {
  contrato: { id: "c" }, versao: null, ate: null, medicoes: [], linhas: [], fora_da_versao: [],
  total: { previsto: "0", valor_medicao: "0", acumulado: "0", saldo: "0", pct_executado: null, pct_a_medir: null },
};

beforeEach(() => {
  estado.chamadas = [];
  estado.resposta = { data: BOLETIM, error: null };
});

describe("carregarBoletim", () => {
  it("sem N não manda p_ate; com N manda", async () => {
    await carregarBoletim("c", null);
    await carregarBoletim("c", 9);
    expect(estado.chamadas).toEqual([
      ["fn_mc_boletim", { p_contrato: "c" }],
      ["fn_mc_boletim", { p_contrato: "c", p_ate: 9 }],
    ]);
  });

  it("devolve o jsonb como veio", async () => {
    expect(await carregarBoletim("c", null)).toEqual({ boletim: BOLETIM, erro: null });
  });

  it("recusa da RPC vira a mensagem do banco", async () => {
    estado.resposta = { data: null, error: { message: "A 11ª medição não existe no contrato L09-BR364." } };
    expect(await carregarBoletim("c", 11)).toEqual({
      boletim: null,
      erro: "A 11ª medição não existe no contrato L09-BR364.",
    });
  });

  it("formato inesperado não passa como boletim", async () => {
    estado.resposta = { data: { linhas: "x" }, error: null };
    const r = await carregarBoletim("c", null);
    expect(r.boletim).toBeNull();
    expect(r.erro).toMatch(/formato inesperado/);
  });
});
