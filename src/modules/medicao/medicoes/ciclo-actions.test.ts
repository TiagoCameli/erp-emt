// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Actions do ciclo da medição: cada uma confere a permissão certa antes de ir ao banco, valida o id
 * (e motivo/quantidade), chama a RPC com os nomes de parâmetro dela e devolve a recusa P0001 como
 * está (pt-BR). Revalida a lista e o detalhe.
 */

const estado = vi.hoisted(() => ({
  negadas: [] as string[],
  chamadas: [] as { fn: string; args: Record<string, unknown> }[],
  revalidadas: [] as string[],
  resposta: { data: null as unknown, error: null as { code?: string; message?: string } | null },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (rota: string) => estado.revalidadas.push(rota) }));
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

import {
  enviarMedicao,
  fecharMedicao,
  lancarAjuste,
  novaRevisao,
  reabrirMedicao,
  revisarAprovada,
} from "@/modules/medicao/medicoes/ciclo-actions";

const ID = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  estado.negadas = [];
  estado.chamadas = [];
  estado.revalidadas = [];
  estado.resposta = { data: null, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("fecharMedicao", () => {
  it("sem medicao.medicoes/editar não chama o banco", async () => {
    estado.negadas = ["medicao.medicoes/editar"];
    await expect(fecharMedicao(ID)).resolves.toEqual({ erro: "Sem permissão para fechar medição" });
    expect(estado.chamadas).toEqual([]);
  });

  it("id inválido não chama o banco", async () => {
    await expect(fecharMedicao("x")).resolves.toEqual({ erro: "Medição inválida" });
    expect(estado.chamadas).toEqual([]);
  });

  it("chama fn_mc_medicao_fechar e revalida lista e detalhe", async () => {
    await expect(fecharMedicao(ID)).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([{ fn: "fn_mc_medicao_fechar", args: { p_id: ID } }]);
    expect(estado.revalidadas).toEqual(["/medicao/medicoes", `/medicao/medicoes/${ID}`]);
  });

  it("recusa P0001 volta como está", async () => {
    estado.resposta = { data: null, error: { code: "P0001", message: "A 3ª medição está Enviada e só fecha quando aberta" } };
    await expect(fecharMedicao(ID)).resolves.toEqual({ erro: "A 3ª medição está Enviada e só fecha quando aberta" });
    expect(estado.revalidadas).toEqual([]);
  });

  it("erro de infraestrutura vira mensagem genérica", async () => {
    estado.resposta = { data: null, error: { code: "42501", message: "permission denied" } };
    await expect(fecharMedicao(ID)).resolves.toEqual({ erro: "Não foi possível fechar a medição. Tente novamente" });
  });
});

describe("reabrirMedicao", () => {
  it("motivo curto não chama o banco", async () => {
    await expect(reabrirMedicao(ID, " ab ")).resolves.toEqual({ erro: "Informe o motivo, com ao menos 3 letras" });
    expect(estado.chamadas).toEqual([]);
  });

  it("chama fn_mc_medicao_reabrir com o motivo sem espaços nas pontas", async () => {
    await expect(reabrirMedicao(ID, "  Faltou lançamento ")).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([{ fn: "fn_mc_medicao_reabrir", args: { p_id: ID, p_motivo: "Faltou lançamento" } }]);
  });

  it("confere editar", async () => {
    estado.negadas = ["medicao.medicoes/editar"];
    await expect(reabrirMedicao(ID, "Faltou lançamento")).resolves.toEqual({ erro: "Sem permissão para reabrir medição" });
  });
});

describe("lancarAjuste", () => {
  it("ajuste negativo vai como -2, texto com ponto", async () => {
    estado.resposta = { data: "ajuste-id", error: null };
    await expect(lancarAjuste({ medicaoId: ID, itemId: ITEM, quantidade: "-2", motivo: "Medido em dobro" })).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([
      { fn: "fn_mc_ajuste_lancar", args: { p_medicao: ID, p_item: ITEM, p_quantidade: "-2", p_motivo: "Medido em dobro" } },
    ]);
  });

  it("quantidade pt-BR chega com ponto decimal", async () => {
    await lancarAjuste({ medicaoId: ID, itemId: ITEM, quantidade: "1.234,5", motivo: "Conferência" });
    expect(estado.chamadas[0]?.args.p_quantidade).toBe("1234.5");
  });

  it("quantidade zero não chama o banco", async () => {
    await expect(lancarAjuste({ medicaoId: ID, itemId: ITEM, quantidade: "0", motivo: "Conferência" })).resolves.toHaveProperty("erro");
    expect(estado.chamadas).toEqual([]);
  });

  it("sem editar não chama o banco", async () => {
    estado.negadas = ["medicao.medicoes/editar"];
    await expect(lancarAjuste({ medicaoId: ID, itemId: ITEM, quantidade: "1", motivo: "Conferência" })).resolves.toEqual({
      erro: "Sem permissão para lançar ajuste",
    });
    expect(estado.chamadas).toEqual([]);
  });
});

describe("enviarMedicao", () => {
  it("chama fn_mc_medicao_enviar", async () => {
    await expect(enviarMedicao(ID)).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([{ fn: "fn_mc_medicao_enviar", args: { p_id: ID } }]);
  });

  it("o segundo pedido (duplo clique) volta a recusa do banco", async () => {
    estado.resposta = { data: null, error: { code: "P0001", message: "A 3ª medição não tem revisão para enviar: feche a medição antes" } };
    await expect(enviarMedicao(ID)).resolves.toEqual({ erro: "A 3ª medição não tem revisão para enviar: feche a medição antes" });
  });
});

describe("novaRevisao", () => {
  it("chama fn_mc_medicao_nova_revisao com o motivo", async () => {
    await expect(novaRevisao(ID, "DNIT devolveu")).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([{ fn: "fn_mc_medicao_nova_revisao", args: { p_id: ID, p_motivo: "DNIT devolveu" } }]);
  });
});

describe("revisarAprovada", () => {
  it("confere desaprovar (não editar)", async () => {
    estado.negadas = ["medicao.medicoes/desaprovar"];
    await expect(revisarAprovada(ID, "DNIT pediu correção")).resolves.toEqual({ erro: "Sem permissão para revisar medição aprovada" });
    expect(estado.chamadas).toEqual([]);
  });

  it("com desaprovar e sem editar, chama fn_mc_medicao_revisar_aprovada", async () => {
    estado.negadas = ["medicao.medicoes/editar"];
    await expect(revisarAprovada(ID, "DNIT pediu correção")).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([{ fn: "fn_mc_medicao_revisar_aprovada", args: { p_id: ID, p_motivo: "DNIT pediu correção" } }]);
  });
});
