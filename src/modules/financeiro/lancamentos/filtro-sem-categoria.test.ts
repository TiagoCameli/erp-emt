import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Sem categoria" no filtro de categoria da listagem.
 *
 * `in.(...)` nunca casa nulo, então o lançamento sem categoria só entra por
 * `is.null`. Com categorias escolhidas junto, as duas pernas viram UM `or`: dois
 * filtros soltos seriam AND-ados e a lista sairia vazia.
 */

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));

const { listarLancamentos } =
  await import("@/modules/financeiro/lancamentos/queries");

const C1 = "fbd2556a-3e96-474b-818f-ff536a288dff";

interface ChamadaFiltro {
  metodo: string;
  coluna: string;
  valor: unknown;
}

function bancoFalso() {
  const filtros: ChamadaFiltro[] = [];
  from.mockImplementation((tabela: string) => {
    if (tabela !== "lancamentos") throw new Error(`tabela inesperada: ${tabela}`);
    const construtor: Record<string, unknown> = {
      select: () => construtor,
      order: () => construtor,
      range: () => construtor,
      then: (resolver: (r: unknown) => void) =>
        resolver({ data: [], error: null, count: 0 }),
    };
    for (const metodo of ["in", "eq", "neq", "gte", "lte", "lt", "is", "not"]) {
      construtor[metodo] = (coluna: string, valor: unknown) => {
        filtros.push({ metodo, coluna, valor });
        return construtor;
      };
    }
    construtor.or = (valor: string) => {
      filtros.push({ metodo: "or", coluna: "", valor });
      return construtor;
    };
    return construtor;
  });
  return filtros;
}

beforeEach(() => {
  from.mockReset();
});

describe("filtro sem categoria na listagem", () => {
  it("sozinho vira categoria_id.is.null", async () => {
    const filtros = bancoFalso();
    await listarLancamentos({ pagina: 0, tamanho: 25, semCategoria: true });
    expect(filtros).toContainEqual({
      metodo: "or",
      coluna: "",
      valor: "categoria_id.is.null",
    });
    expect(filtros.some((f) => f.coluna === "categoria_id")).toBe(false);
  });

  it("com categorias escolhidas, as duas pernas num or só", async () => {
    const filtros = bancoFalso();
    await listarLancamentos({
      pagina: 0,
      tamanho: 25,
      categoriaIds: [C1],
      semCategoria: true,
    });
    expect(filtros).toContainEqual({
      metodo: "or",
      coluna: "",
      valor: `categoria_id.in.(${C1}),categoria_id.is.null`,
    });
  });

  it("sem a opção, categoria escolhida continua sem nulo", async () => {
    const filtros = bancoFalso();
    await listarLancamentos({ pagina: 0, tamanho: 25, categoriaIds: [C1] });
    expect(filtros).toContainEqual({
      metodo: "or",
      coluna: "",
      valor: `categoria_id.in.(${C1})`,
    });
  });
});
