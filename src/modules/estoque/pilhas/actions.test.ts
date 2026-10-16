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
const listarCentrosCusto = vi.fn();
vi.mock("@/modules/_shared/centro-custo/queries", () => ({
  listarCentrosCusto: () => listarCentrosCusto(),
}));

import { carregarMovimentoDaPilha, criarPilha } from "@/modules/estoque/pilhas/actions";
import { pilhaSchema } from "@/modules/estoque/pilhas/schemas";

const BRITA = "79ea56b3-82fe-c79d-c598-09736c347c9f";
const GREGORIO = "0a04b9e6-5216-548a-2d90-41a9c0ca88b7";

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
    insert.mockResolvedValue({ data: { id: "p1" }, error: null });
    await expect(
      criarPilha({ nome: " Brita 1 ", localidadeId: GREGORIO, insumoId: BRITA, observacoes: " " }),
    ).resolves.toEqual({ ok: true, id: "p1", mapa: null });
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

  it("criada por quem edita o Mapa, volta o endereço que abre o mapa para marcar o lugar", async () => {
    insert.mockResolvedValue({ data: { id: "p9" }, error: null });
    enderecoParaColocar.mockResolvedValue("/mapa?colocar=pilha&id=p9");
    await expect(criarPilha({ nome: "Brita 1", localidadeId: GREGORIO, insumoId: BRITA, observacoes: "" })).resolves.toEqual({
      ok: true,
      id: "p9",
      mapa: "/mapa?colocar=pilha&id=p9",
    });
    expect(enderecoParaColocar).toHaveBeenCalledWith("pilha", "p9");
  });
});

describe("entrada e saída pelo card da pilha no Mapa", () => {
  const PILHA = "5b1f7c0e-3a2d-4c8e-9f10-2b3c4d5e6f70";
  const linha = { id: PILHA, nome: "Brita 1 - Canteiro Gregorio", saldo: "282.0000", insumo_id: BRITA, insumos: { nome: "BRITA 1", unidades_medida: { sigla: "t" } } };
  const CENTRO = { id: "c1", nome: "Obra", codigo: "01", paiId: null, tipo: "obra" };
  let resposta: { data: unknown; error: unknown };

  beforeEach(() => {
    exigirPermissao.mockReset();
    createClient.mockReset();
    listarCentrosCusto.mockReset();
    listarCentrosCusto.mockResolvedValue([CENTRO]);
    resposta = { data: linha, error: null };
    createClient.mockResolvedValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(resposta) }) }) }),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("quem pode as duas recebe a pilha já como local, o insumo dela e os centros", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    await expect(carregarMovimentoDaPilha(PILHA)).resolves.toEqual({
      ok: true,
      local: `pilha:${PILHA}`,
      nome: "Brita 1 - Canteiro Gregorio",
      insumo: { id: BRITA, nome: "BRITA 1", unidade: "t" },
      saldo: 282,
      centros: [CENTRO],
    });
  });

  it("quem só dá entrada não carrega os centros de custo", async () => {
    exigirPermissao.mockImplementation(async (recurso: string) => {
      if (recurso === "estoque.saidas") throw new Error("sem");
    });
    const r = await carregarMovimentoDaPilha(PILHA);
    expect("ok" in r && r.centros).toEqual([]);
    expect(listarCentrosCusto).not.toHaveBeenCalled();
  });

  it("sem entrada nem saída no Estoque, nem chega ao banco", async () => {
    exigirPermissao.mockRejectedValue(new Error("sem"));
    await expect(carregarMovimentoDaPilha(PILHA)).resolves.toEqual({ erro: "Sem permissão para registrar entrada ou saída" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("pilha antiga sem insumo manda escolher o material no Estoque", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    resposta = { data: { ...linha, insumo_id: null, insumos: null }, error: null };
    await expect(carregarMovimentoDaPilha(PILHA)).resolves.toEqual({
      erro: "Esta pilha está sem material: escolha o insumo dela no Estoque, aba Pilhas",
    });
  });
});
