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

import { criarCronograma, definirAcesso, excluirLocal, salvarLocal } from "@/modules/execucao/obras/actions";

const OBRA = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  estado.negadas = [];
  estado.chamadas = [];
  estado.resposta = { data: ID, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("criarCronograma", () => {
  const dados = { obraId: OBRA, tipoObra: "edificacao" as const, codigo: "fund", nome: "Fundação", dataInicio: "2026-03-02", criterioPeso: "duracao" as const };

  it("sem execucao.cronogramas/criar não chama o banco", async () => {
    estado.negadas = ["execucao.cronogramas/criar"];
    await expect(criarCronograma(dados)).resolves.toEqual({ erro: "Sem permissão para criar cronograma" });
    expect(estado.chamadas).toEqual([]);
  });

  it("chama fn_ex_cronograma_salvar sem p_id e devolve o id", async () => {
    await expect(criarCronograma(dados)).resolves.toEqual({ ok: true, id: ID });
    expect(estado.chamadas[0].fn).toBe("fn_ex_cronograma_salvar");
    expect(estado.chamadas[0].args.p_id).toBeUndefined();
    expect((estado.chamadas[0].args.p_dados as Record<string, unknown>).codigo).toBe("FUND");
  });

  it("mensagem de negócio do banco passa para a tela", async () => {
    estado.resposta = { data: null, error: { code: "P0001", message: "Esta obra já tem cronogramas e você não está na lista" } };
    await expect(criarCronograma(dados)).resolves.toEqual({ erro: "Esta obra já tem cronogramas e você não está na lista" });
  });
});

describe("definirAcesso", () => {
  it("id inválido não chama o banco", async () => {
    await expect(definirAcesso("x", ID, true)).resolves.toEqual({ erro: "Dados inválidos" });
    expect(estado.chamadas).toEqual([]);
  });
});

describe("locais", () => {
  it("salvar novo usa criar; editar usa editar", async () => {
    estado.negadas = ["execucao.cronogramas/editar"];
    const local = { tipo: "bloco" as const, codigo: "A", nome: "Bloco A", ordem: 0 };
    await expect(salvarLocal(OBRA, null, local)).resolves.toEqual({ ok: true, id: ID });
    await expect(salvarLocal(OBRA, ID, local)).resolves.toEqual({ erro: "Sem permissão para editar local" });
  });

  it("excluir exige motivo", async () => {
    await expect(excluirLocal(ID, "  ")).resolves.toEqual({ erro: "Informe o motivo da exclusão" });
    expect(estado.chamadas).toEqual([]);
  });
});
