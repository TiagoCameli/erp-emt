import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O filtro de centro de custo na listagem de lançamentos NÃO pode viajar como
 * lista de ids de lançamento.
 *
 * O `in.(...)` do PostgREST vai na QUERY STRING de um GET, e cada uuid custa 37
 * caracteres. O Escritório Central tem 1.871 lançamentos: 69 KB de URL. Medido
 * contra o projeto vivo em 20/08/2026, sem autenticação (o corte acontece ANTES
 * da auth, então é sobre tamanho, não sobre permissão):
 *
 * -   100 ids =  3,8 KB -> 401 (chegou na auth, URL ok)
 * -   453 ids = 16,8 KB -> 401 (é por isso que os centros pequenos funcionavam)
 * - 1.115 ids = 41,3 KB -> HTTP 400
 * - 1.753 ids = 64,9 KB -> HTTP 520
 * - 1.871 ids = 69,3 KB -> a requisição não completa
 *
 * O sintoma era "Algo deu errado ao carregar esta tela" ao clicar em qualquer um
 * dos três maiores centros de custo, e nada nos logs do banco — porque a
 * requisição morria antes de existir.
 *
 * A correção põe o filtro no EMBED (`lancamento_rateios.centro_custo_id`), então
 * o que viaja é a subárvore do centro (61 ids no maior caso), não os lançamentos
 * dele. É o mesmo par embed + `not.is.null` que a listagem de ordens de compra
 * usa para filtrar por centro pelo item.
 *
 * O que este teste trava é o TAMANHO: nenhuma lista entregue à consulta de
 * lançamentos pode crescer com o número de lançamentos do centro.
 */

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from, rpc }),
}));

const { listarLancamentos } =
  await import("@/modules/financeiro/lancamentos/queries");

const RAIZ = "fbd2556a-3e96-474b-818f-ff536a288dff";

/** Um uuid sintético estável, para o fixture não depender de sorteio. */
function uuid(prefixo: string, i: number): string {
  return `${prefixo}-0000-4000-8000-${String(i).padStart(12, "0")}`;
}

interface ChamadaFiltro {
  metodo: string;
  coluna: string;
  valor: unknown;
}

/**
 * Monta o banco falso: uma subárvore de `centros` centros e `lancamentos`
 * lançamentos rateados neles.
 *
 * Devolve o que a consulta de lançamentos recebeu, que é o objeto do teste.
 */
function bancoCom({
  centros,
  lancamentos,
}: {
  centros: number;
  lancamentos: number;
}) {
  const idsDaArvore = Array.from({ length: centros }, (_, i) => uuid("ccc", i));
  const rateios = Array.from({ length: lancamentos }, (_, i) => ({
    lancamento_id: uuid("aaa", i),
    // Espalha pelos centros da árvore, como manutenção espalha por equipamento.
    centro_custo_id: idsDaArvore[i % centros],
    valor: 10,
  }));

  rpc.mockImplementation((nome: string) => {
    if (nome !== "fn_centro_custo_subarvore") {
      throw new Error(`rpc inesperada: ${nome}`);
    }
    return Promise.resolve({
      data: idsDaArvore.map((id) => ({ id })),
      error: null,
    });
  });

  const filtrosDaListagem: ChamadaFiltro[] = [];

  from.mockImplementation((tabela: string) => {
    if (tabela === "lancamento_rateios") {
      const construtor: Record<string, unknown> = {
        select: () => construtor,
        in: () => construtor,
        order: () => construtor,
        range: () => Promise.resolve({ data: rateios, error: null }),
      };
      return construtor;
    }

    if (tabela === "lancamentos") {
      const construtor: Record<string, unknown> = {
        select: () => construtor,
        order: () => construtor,
        range: () => construtor,
        not: (coluna: string, operador: string, valor: unknown) => {
          filtrosDaListagem.push({
            metodo: `not.${operador}`,
            coluna,
            valor,
          });
          return construtor;
        },
        // Página vazia de propósito: o objeto do teste é o que a consulta RECEBE.
        then: (resolver: (r: unknown) => void) =>
          resolver({ data: [], error: null, count: 0 }),
      };
      for (const metodo of ["in", "eq", "neq", "gte", "lte", "lt", "or"]) {
        construtor[metodo] = (coluna: string, valor: unknown) => {
          filtrosDaListagem.push({ metodo, coluna, valor });
          return construtor;
        };
      }
      return construtor;
    }

    throw new Error(`tabela inesperada: ${tabela}`);
  });

  return filtrosDaListagem;
}

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
});

describe("filtro de centro de custo na listagem", () => {
  it("filtra pelo embed do rateio, não por lista de ids de lançamento", async () => {
    const filtros = bancoCom({ centros: 61, lancamentos: 1871 });

    await listarLancamentos({ pagina: 0, tamanho: 25, centroCustoId: RAIZ });

    const noEmbed = filtros.find(
      (f) => f.coluna === "lancamento_rateios.centro_custo_id",
    );
    expect(noEmbed?.metodo).toBe("in");
    expect(noEmbed?.valor).toHaveLength(61);

    // O par do embed: sem ele o join é à esquerda e traz lançamento que não tem
    // nenhum rateio no centro.
    expect(
      filtros.some(
        (f) => f.coluna === "lancamento_rateios" && f.metodo === "not.is",
      ),
    ).toBe(true);

    // E o que a correção mata: a lista de ids de lançamento na query string.
    expect(filtros.some((f) => f.metodo === "in" && f.coluna === "id")).toBe(
      false,
    );
  });

  it("o tamanho do filtro não cresce com os lançamentos do centro", async () => {
    // A linha de controle desta prova. Antes, este número era 1.871 num caso e
    // 45 no outro — era exatamente isso que estourava a URL.
    const grande = bancoCom({ centros: 61, lancamentos: 1871 });
    await listarLancamentos({ pagina: 0, tamanho: 25, centroCustoId: RAIZ });
    const maiorNoGrande = maiorLista(grande);

    from.mockReset();
    rpc.mockReset();

    const pequeno = bancoCom({ centros: 61, lancamentos: 45 });
    await listarLancamentos({ pagina: 0, tamanho: 25, centroCustoId: RAIZ });

    expect(maiorNoGrande).toBe(maiorLista(pequeno));
    // 61 ids = ~2,3 KB de URL, dentro da faixa medida como segura.
    expect(maiorNoGrande).toBe(61);
  });

  it("centro sem nenhum id devolve lista vazia, não a lista inteira", async () => {
    // Centro excluído entre a tela e a consulta: "sem filtro" seria mostrar
    // TODOS os lançamentos da empresa para quem pediu um centro só.
    const filtros = bancoCom({ centros: 0, lancamentos: 0 });
    rpc.mockImplementation(() => Promise.resolve({ data: [], error: null }));

    const pagina = await listarLancamentos({
      pagina: 0,
      tamanho: 25,
      centroCustoId: RAIZ,
    });

    expect(pagina).toEqual({ itens: [], total: 0 });
    expect(filtros).toHaveLength(0);
  });

  it("erro ao ler a árvore não vira lista vazia", async () => {
    // Filtro que não foi aplicado tem que falhar, não devolver "nada encontrado":
    // a tela diria que o centro não tem lançamento nenhum.
    bancoCom({ centros: 61, lancamentos: 10 });
    rpc.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "falhou" } }),
    );

    await expect(
      listarLancamentos({ pagina: 0, tamanho: 25, centroCustoId: RAIZ }),
    ).rejects.toThrow("Não foi possível aplicar o filtro");
  });

  it("sem filtro de centro, nada de rateio entra na consulta", async () => {
    const filtros = bancoCom({ centros: 61, lancamentos: 1871 });

    await listarLancamentos({ pagina: 0, tamanho: 25 });

    expect(rpc).not.toHaveBeenCalled();
    expect(
      filtros.some((f) => String(f.coluna).startsWith("lancamento_rateios")),
    ).toBe(false);
  });
});

/** O maior array entregue como valor de filtro para a consulta de lançamentos. */
function maiorLista(filtros: ChamadaFiltro[]): number {
  return filtros.reduce(
    (maior, f) =>
      Array.isArray(f.valor) ? Math.max(maior, f.valor.length) : maior,
    0,
  );
}
