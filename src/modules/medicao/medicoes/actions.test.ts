// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  negadas: [] as string[],
  chamadas: [] as { fn: string; args: Record<string, unknown> }[],
  resposta: { data: null as unknown, error: null as { code?: string; message?: string } | null },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: vi.fn(async (recurso: string, acao: string) => {
    if (estado.negadas.includes(`${recurso}/${acao}`)) throw new Error("Sem permissão");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      estado.chamadas.push({ fn, args });
      return estado.resposta;
    },
  }),
}));

import { abrirMedicao, sugestaoMedicao } from "@/modules/medicao/medicoes/actions";

const ID = "33333333-3333-4333-8333-333333333333";
const SUGESTAO = {
  numero: 11,
  periodo_inicio: "2026-09-01",
  periodo_fim: "2026-09-30",
  versao_numero: 1,
  depois_de: "2026-08-31",
};

beforeEach(() => {
  estado.negadas = [];
  estado.chamadas = [];
  estado.resposta = { data: null, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sugestaoMedicao", () => {
  it("sem medicao.medicoes/criar não chama o banco", async () => {
    estado.negadas = ["medicao.medicoes/criar"];
    await expect(sugestaoMedicao(ID)).resolves.toEqual({ erro: "Sem permissão para abrir medição" });
    expect(estado.chamadas).toEqual([]);
  });

  it("contrato inválido não chama o banco", async () => {
    await expect(sugestaoMedicao("x")).resolves.toHaveProperty("erro");
    expect(estado.chamadas).toEqual([]);
  });

  it("devolve a sugestão da RPC como está", async () => {
    estado.resposta = { data: SUGESTAO, error: null };
    await expect(sugestaoMedicao(ID)).resolves.toEqual({ ok: true, sugestao: SUGESTAO });
    expect(estado.chamadas).toEqual([{ fn: "fn_mc_medicao_sugestao", args: { p_contrato: ID } }]);
  });

  it("a recusa da RPC (P0001) vira a mensagem do banco", async () => {
    estado.resposta = { data: null, error: { code: "P0001", message: "O contrato L09 não tem planilha vigente. Aprove a planilha antes de abrir medição" } };
    await expect(sugestaoMedicao(ID)).resolves.toEqual({
      erro: "O contrato L09 não tem planilha vigente. Aprove a planilha antes de abrir medição",
    });
  });

  it("erro de infraestrutura (não P0001) vira mensagem genérica, sem vazar detalhe técnico", async () => {
    estado.resposta = { data: null, error: { code: "42501", message: "permission denied for table mc_medicoes" } };
    await expect(sugestaoMedicao(ID)).resolves.toEqual({ erro: "Não foi possível sugerir o período da medição. Tente novamente" });
  });
});

describe("abrirMedicao", () => {
  it("sem medicao.medicoes/criar não chama o banco", async () => {
    estado.negadas = ["medicao.medicoes/criar"];
    await expect(abrirMedicao({ contratoId: ID, inicio: "2026-09-01", fim: "2026-09-30" })).resolves.toEqual({
      erro: "Sem permissão para abrir medição",
    });
    expect(estado.chamadas).toEqual([]);
  });

  it("fim antes do início não chama o banco (o zod recusa antes)", async () => {
    await expect(abrirMedicao({ contratoId: ID, inicio: "2026-09-30", fim: "2026-09-01" })).resolves.toHaveProperty("erro");
    expect(estado.chamadas).toEqual([]);
  });

  it("contrato inválido não chama o banco", async () => {
    await expect(abrirMedicao({ contratoId: "x", inicio: "2026-09-01", fim: "2026-09-30" })).resolves.toHaveProperty("erro");
    expect(estado.chamadas).toEqual([]);
  });

  it("abre a medição com o período informado", async () => {
    estado.resposta = { data: "novo-id", error: null };
    await expect(abrirMedicao({ contratoId: ID, inicio: "2026-09-01", fim: "2026-09-30" })).resolves.toEqual({
      ok: true,
      id: "novo-id",
    });
    expect(estado.chamadas).toEqual([
      { fn: "fn_mc_medicao_abrir", args: { p_contrato: ID, p_inicio: "2026-09-01", p_fim: "2026-09-30" } },
    ]);
  });

  it("a recusa do banco (P0001) chega como está, pt-BR", async () => {
    estado.resposta = {
      data: null,
      error: { code: "P0001", message: "A 11ª medição tem de começar depois de 31/08/2026 (fim da 10ª)" },
    };
    await expect(abrirMedicao({ contratoId: ID, inicio: "2026-08-15", fim: "2026-09-30" })).resolves.toEqual({
      erro: "A 11ª medição tem de começar depois de 31/08/2026 (fim da 10ª)",
    });
  });
});
