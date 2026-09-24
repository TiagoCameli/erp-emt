// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const exigirPermissao = vi.fn();
const insert = vi.fn();
const update = vi.fn();
const eq = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: (...args: unknown[]) => exigirPermissao(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      insert: (...args: unknown[]) => insert(...args),
      update: (...args: unknown[]) => {
        update(...args);
        return { eq: (...a: unknown[]) => eq(...a) };
      },
    }),
  }),
}));

import { criar, editar } from "@/modules/cadastros/localidades/actions";
import { localidadeSchema } from "@/modules/cadastros/localidades/schemas";

const ID = "11111111-1111-4111-8111-111111111111";
const FORNECEDOR = "22222222-2222-4222-8222-222222222222";

describe("localidade: pedreira (fornecedor)", () => {
  beforeEach(() => {
    exigirPermissao.mockReset().mockResolvedValue(undefined);
    insert.mockReset().mockResolvedValue({ error: null });
    update.mockReset();
    eq.mockReset().mockResolvedValue({ error: null });
  });

  it("o schema aceita vazio, um id, ou nada (opcional); recusa lixo", () => {
    const base = { nome: "Pedreira Britam", endereco: "", ativo: true };
    expect(localidadeSchema.safeParse(base).success).toBe(true);
    expect(localidadeSchema.safeParse({ ...base, fornecedorId: "" }).success).toBe(true);
    expect(localidadeSchema.safeParse({ ...base, fornecedorId: FORNECEDOR }).success).toBe(true);
    expect(localidadeSchema.safeParse({ ...base, fornecedorId: "abc" }).success).toBe(false);
  });

  it("criar grava fornecedor_id; vazio vira nulo", async () => {
    await expect(criar({ nome: "Pedreira Britam", endereco: "", ativo: true, fornecedorId: FORNECEDOR })).resolves.toEqual({
      ok: true,
    });
    expect(insert).toHaveBeenLastCalledWith({ nome: "Pedreira Britam", endereco: null, fornecedor_id: FORNECEDOR, ativo: true });
    await criar({ nome: "Canteiro", endereco: "", ativo: true, fornecedorId: "" });
    expect(insert).toHaveBeenLastCalledWith({ nome: "Canteiro", endereco: null, fornecedor_id: null, ativo: true });
  });

  it("editar também leva a pedreira", async () => {
    await expect(editar(ID, { nome: "Pedreira", endereco: "BR", ativo: true, fornecedorId: FORNECEDOR })).resolves.toEqual({
      ok: true,
    });
    expect(update).toHaveBeenCalledWith({ nome: "Pedreira", endereco: "BR", fornecedor_id: FORNECEDOR, ativo: true });
    expect(eq).toHaveBeenCalledWith("id", ID);
  });

  it("sem permissão de criar não grava", async () => {
    exigirPermissao.mockRejectedValue(new Error("x"));
    await expect(criar({ nome: "X1", endereco: "", ativo: true })).resolves.toEqual({
      erro: "Sem permissão para criar localidades",
    });
    expect(insert).not.toHaveBeenCalled();
  });
});
