// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const exigirPermissao = vi.fn();
const createClient = vi.fn();
const insert = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: (...args: unknown[]) => exigirPermissao(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));

import { criarPilha } from "@/modules/estoque/pilhas/actions";
import { pilhaSchema } from "@/modules/estoque/pilhas/schemas";

const BRITA = "79ea56b3-82fe-c79d-c598-09736c347c9f";
const GREGORIO = "0a04b9e6-5216-548a-2d90-41a9c0ca88b7";

describe("pilha nasce com o insumo", () => {
  beforeEach(() => {
    exigirPermissao.mockReset();
    createClient.mockReset();
    insert.mockReset();
    createClient.mockResolvedValue({ from: () => ({ insert }) });
    exigirPermissao.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("o formulário exige o insumo", () => {
    const r = pilhaSchema.safeParse({ nome: "Brita 1 - Pátio", localidadeId: "", insumoId: "", observacoes: "" });
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join(".")).sort()).toEqual(["insumoId", "localidadeId"]);
  });

  it("sem insumo nem chega ao banco", async () => {
    await expect(criarPilha({ nome: "Brita 1", localidadeId: GREGORIO, insumoId: "", observacoes: "" })).resolves.toEqual({
      erro: "Escolha o insumo da pilha",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("grava nome, insumo e observação vazia como nula", async () => {
    insert.mockResolvedValue({ error: null });
    await expect(
      criarPilha({ nome: " Brita 1 ", localidadeId: GREGORIO, insumoId: BRITA, observacoes: " " }),
    ).resolves.toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith({ nome: "Brita 1", insumo_id: BRITA, localidade_id: GREGORIO, observacoes: null });
  });

  it("o CHECK do banco vira frase, e a trava do banco volta como está", async () => {
    const pilha = { nome: "Brita 1", localidadeId: GREGORIO, insumoId: BRITA, observacoes: "" };
    insert.mockResolvedValueOnce({ error: { code: "23514", message: 'violates check constraint "estoque_pilhas_insumo_obrigatorio"' } });
    await expect(criarPilha(pilha)).resolves.toEqual({ erro: "Escolha o insumo da pilha" });
    insert.mockResolvedValueOnce({
      error: { code: "23514", message: 'violates check constraint "estoque_pilhas_localidade_obrigatoria"' },
    });
    await expect(criarPilha(pilha)).resolves.toEqual({ erro: "Escolha o local da pilha" });
    insert.mockResolvedValueOnce({ error: { code: "P0001", message: "Insumo inexistente ou inativo" } });
    await expect(criarPilha(pilha)).resolves.toEqual({
      erro: "Insumo inexistente ou inativo",
    });
  });
});
