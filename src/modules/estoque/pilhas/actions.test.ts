// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const exigirPermissao = vi.fn();
const createClient = vi.fn();
const insert = vi.fn();
const enderecoParaColocar = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: (...args: unknown[]) => exigirPermissao(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));
vi.mock("@/modules/mapa/colocar-na-criacao", () => ({
  enderecoParaColocar: (...args: unknown[]) => enderecoParaColocar(...args),
}));

import { criarPilha } from "@/modules/estoque/pilhas/actions";
import { pilhaSchema } from "@/modules/estoque/pilhas/schemas";

const BRITA = "79ea56b3-82fe-c79d-c598-09736c347c9f";

describe("pilha nasce com o insumo", () => {
  beforeEach(() => {
    exigirPermissao.mockReset();
    createClient.mockReset();
    insert.mockReset();
    enderecoParaColocar.mockReset();
    enderecoParaColocar.mockResolvedValue(null);
    // insert(...).select("id").single(): o que o teste programa em `insert` é a resposta do single.
    createClient.mockResolvedValue({
      from: () => ({
        insert: (linha: unknown) => {
          const resposta = insert(linha);
          return { select: () => ({ single: () => resposta }) };
        },
      }),
    });
    exigirPermissao.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("o formulário exige o insumo", () => {
    const r = pilhaSchema.safeParse({ nome: "Brita 1 - Pátio", insumoId: "", observacoes: "" });
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join("."))).toEqual(["insumoId"]);
  });

  it("sem insumo nem chega ao banco", async () => {
    await expect(criarPilha({ nome: "Brita 1", insumoId: "", observacoes: "" })).resolves.toEqual({
      erro: "Escolha o insumo da pilha",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("grava nome, insumo e observação vazia como nula", async () => {
    insert.mockResolvedValue({ data: { id: "p1" }, error: null });
    await expect(criarPilha({ nome: " Brita 1 ", insumoId: BRITA, observacoes: " " })).resolves.toEqual({
      ok: true,
      id: "p1",
      mapa: null,
    });
    expect(insert).toHaveBeenCalledWith({ nome: "Brita 1", insumo_id: BRITA, observacoes: null });
  });

  it("o CHECK do banco vira frase, e a trava do banco volta como está", async () => {
    insert.mockResolvedValueOnce({ error: { code: "23514", message: "violates check constraint" } });
    await expect(criarPilha({ nome: "Brita 1", insumoId: BRITA, observacoes: "" })).resolves.toEqual({
      erro: "Escolha o insumo da pilha",
    });
    insert.mockResolvedValueOnce({ error: { code: "P0001", message: "Insumo inexistente ou inativo" } });
    await expect(criarPilha({ nome: "Brita 1", insumoId: BRITA, observacoes: "" })).resolves.toEqual({
      erro: "Insumo inexistente ou inativo",
    });
  });

  it("criada por quem edita o Mapa, volta o endereço que abre o mapa para marcar o lugar", async () => {
    insert.mockResolvedValue({ data: { id: "p9" }, error: null });
    enderecoParaColocar.mockResolvedValue("/mapa?colocar=pilha&id=p9");
    await expect(criarPilha({ nome: "Brita 1", insumoId: BRITA, observacoes: "" })).resolves.toEqual({
      ok: true,
      id: "p9",
      mapa: "/mapa?colocar=pilha&id=p9",
    });
    expect(enderecoParaColocar).toHaveBeenCalledWith("pilha", "p9");
  });
});
