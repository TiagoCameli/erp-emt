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
vi.mock("@/modules/execucao/cronogramas/queries", () => ({ atividadesDoCronograma: async () => [] }));

import { excluirAtividades, mudarStatus, salvarCronograma, salvarLinhas } from "@/modules/execucao/cronogramas/actions";

const CRONO = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const VERSAO = "2026-10-10T13:00:00.123456+00:00";

beforeEach(() => {
  estado.negadas = [];
  estado.chamadas = [];
  estado.resposta = { data: { gravadas: 1 }, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("salvarLinhas", () => {
  it("linha sem id e sem execucao.cronogramas/criar: recusa sem chamar o banco", async () => {
    estado.negadas = ["execucao.cronogramas/criar"];
    await expect(salvarLinhas(CRONO, [{ codigo: "1", nome: "Limpeza" }])).resolves.toEqual({ erro: "Sem permissão para criar atividade" });
    expect(estado.chamadas).toEqual([]);
  });

  it("linhas só com id e sem editar: recusa", async () => {
    estado.negadas = ["execucao.cronogramas/editar"];
    await expect(salvarLinhas(CRONO, [{ id: ID, versao: VERSAO, nome: "Estacas" }])).resolves.toEqual({
      erro: "Sem permissão para editar atividade",
    });
    expect(estado.chamadas).toEqual([]);
  });

  it("erro P0001 de concorrência passa intacto para a tela", async () => {
    const mensagem = "Linha 1.2: esta linha foi alterada por outra pessoa. Recarregue a grade";
    estado.resposta = { data: null, error: { code: "P0001", message: mensagem } };
    await expect(salvarLinhas(CRONO, [{ id: ID, versao: VERSAO, nome: "Estacas" }])).resolves.toEqual({ erro: mensagem });
  });

  it("3.001 linhas: recusa sem chamar o banco", async () => {
    const linhas = Array.from({ length: 3001 }, (_, i) => ({ codigo: String(i + 1), nome: "x" }));
    await expect(salvarLinhas(CRONO, linhas)).resolves.toEqual({ erro: "No máximo 3.000 linhas por vez" });
    expect(estado.chamadas).toEqual([]);
  });

  it("chama o lote e devolve as atividades relidas; a versão vai como texto, sem passar por Date", async () => {
    await expect(salvarLinhas(CRONO, [{ id: ID, versao: VERSAO, nome: "Estacas" }])).resolves.toEqual({ ok: true, atividades: [] });
    expect(estado.chamadas[0]).toEqual({
      fn: "fn_ex_atividades_salvar_lote",
      args: { p_cronograma: CRONO, p_linhas: [{ id: ID, versao: VERSAO, nome: "Estacas" }] },
    });
  });
});

describe("excluirAtividades", () => {
  it("sem motivo: recusa", async () => {
    await expect(excluirAtividades(CRONO, [ID], " ")).resolves.toEqual({ erro: "Informe o motivo" });
    expect(estado.chamadas).toEqual([]);
  });
});

describe("cronograma", () => {
  it("salvarCronograma manda p_id e a data de corte", async () => {
    estado.resposta = { data: CRONO, error: null };
    const dados = { codigo: "fund", nome: "Fundação", dataInicio: "2026-03-02", dataCorte: "2026-04-01", criterioPeso: "duracao" as const };
    await expect(salvarCronograma(CRONO, dados)).resolves.toEqual({ ok: true });
    expect(estado.chamadas[0].fn).toBe("fn_ex_cronograma_salvar");
    expect(estado.chamadas[0].args.p_id).toBe(CRONO);
    expect((estado.chamadas[0].args.p_dados as Record<string, unknown>).data_corte).toBe("2026-04-01");
  });

  it("mudarStatus com situação fora da lista não chama o banco", async () => {
    await expect(mudarStatus(CRONO, "x" as never)).resolves.toEqual({ erro: "Dados inválidos" });
    expect(estado.chamadas).toEqual([]);
  });
});
