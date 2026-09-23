import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prova das actions do cadastro de tanques: permissão antes do banco, só as
 * colunas que o grant libera, tanque da EMT sem dono, e as recusas do banco
 * traduzidas (nome repetido, tanque em uso).
 */

const estado = vi.hoisted(() => ({
  permitido: true,
  insercoes: [] as unknown[],
  updates: [] as unknown[],
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  erro: null as { code?: string; message?: string } | null,
  linhasUpdate: [{ id: "x" }] as { id: string }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: vi.fn(async () => {
    if (!estado.permitido) throw new Error("Sem permissão");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      insert: async (linha: unknown) => {
        estado.insercoes.push(linha);
        return { error: estado.erro };
      },
      update: (linha: unknown) => {
        estado.updates.push(linha);
        return {
          eq: () => ({
            select: async () => ({ data: estado.erro ? null : estado.linhasUpdate, error: estado.erro }),
          }),
        };
      },
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      estado.rpcs.push({ fn, args });
      return { data: null, error: estado.erro };
    },
  }),
}));

import { criarTanque, editarTanque, excluirTanque } from "@/modules/combustivel/tanques/actions";

const ID = "33333333-3333-4333-8333-333333333333";
const DONO = "44444444-4444-4444-8444-444444444444";

const DADOS = {
  nome: "Tanque Comboio 01",
  apelido: "",
  capacidade: 15000.5,
  ehExterno: false,
  proprietarioId: null,
  observacoes: "",
  ativo: true,
};

beforeEach(() => {
  estado.permitido = true;
  estado.insercoes = [];
  estado.updates = [];
  estado.rpcs = [];
  estado.erro = null;
  estado.linhasUpdate = [{ id: ID }];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("criarTanque", () => {
  it("sem permissão volta erro e não grava", async () => {
    estado.permitido = false;
    await expect(criarTanque(DADOS)).resolves.toEqual({ erro: "Sem permissão para criar tanques" });
    expect(estado.insercoes).toEqual([]);
  });

  it("grava só as colunas liberadas, com vazio virando null", async () => {
    await expect(criarTanque(DADOS)).resolves.toEqual({ ok: true });
    expect(estado.insercoes).toEqual([
      {
        nome: "Tanque Comboio 01",
        apelido: null,
        capacidade_litros: 15000.5,
        eh_externo: false,
        proprietario_id: null,
        observacoes: null,
        ativo: true,
      },
    ]);
  });

  it("tanque de terceiro sem dono não chega ao banco", async () => {
    await expect(criarTanque({ ...DADOS, ehExterno: true })).resolves.toHaveProperty("erro");
    expect(estado.insercoes).toEqual([]);
  });

  it("tanque de terceiro grava o dono", async () => {
    await expect(criarTanque({ ...DADOS, ehExterno: true, proprietarioId: DONO })).resolves.toEqual({ ok: true });
    expect(estado.insercoes[0]).toMatchObject({ eh_externo: true, proprietario_id: DONO });
  });

  it("nome repetido (23505) vira frase", async () => {
    estado.erro = { code: "23505", message: 'duplicate key value violates unique constraint "uq_tanques_nome"' };
    await expect(criarTanque(DADOS)).resolves.toEqual({ erro: "Já existe um tanque com este nome" });
  });
});

describe("editarTanque", () => {
  it("sem permissão não grava", async () => {
    estado.permitido = false;
    await expect(editarTanque(ID, DADOS)).resolves.toEqual({ erro: "Sem permissão para editar tanques" });
    expect(estado.updates).toEqual([]);
  });

  it("RLS que recusa (zero linhas) vira erro, não sucesso", async () => {
    estado.linhasUpdate = [];
    await expect(editarTanque(ID, DADOS)).resolves.toEqual({
      erro: "Tanque não encontrado ou sem permissão para editar",
    });
  });
});

describe("excluirTanque", () => {
  it("sem motivo ou sem permissão não chama a lixeira", async () => {
    await expect(excluirTanque(ID, "")).resolves.toEqual({ erro: "Informe o motivo da exclusão" });
    estado.permitido = false;
    await expect(excluirTanque(ID, "Cadastro errado")).resolves.toEqual({ erro: "Sem permissão para excluir tanques" });
    expect(estado.rpcs).toEqual([]);
  });

  it("vai para a lixeira dos cadastros", async () => {
    await expect(excluirTanque(ID, "Cadastro errado")).resolves.toEqual({ ok: true });
    expect(estado.rpcs).toEqual([
      { fn: "fn_excluir_cadastro", args: { p_tabela: "tanques", p_id: ID, p_motivo: "Cadastro errado" } },
    ]);
  });

  it("tanque com movimento (FK) vira aviso de desativar", async () => {
    estado.erro = { code: "23503", message: "update or delete on table violates foreign key constraint" };
    await expect(excluirTanque(ID, "Cadastro errado")).resolves.toEqual({
      erro: "Este registro está em uso e não pode ser excluído. Desative-o no lugar.",
    });
  });
});
