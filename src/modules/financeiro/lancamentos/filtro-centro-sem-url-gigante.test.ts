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
const OUTRA_RAIZ = "0a327d7e-6e2d-40d9-a87b-cf9b4a76be2e";

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
        // `returns` só carimba o tipo, não muda a consulta: devolve o próprio
        // construtor para o `await` continuar caindo no `then`. A consulta
        // passou a usar `.returns<T[]>()` porque o select é montado em tempo de
        // execução (o embed do filtro de conta só entra quando o filtro está
        // ligado) e sem string literal o supabase-js não tem o que inferir.
        returns: () => construtor,
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

    await listarLancamentos({ pagina: 0, tamanho: 25, centroCustoIds: [RAIZ] });

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
    await listarLancamentos({ pagina: 0, tamanho: 25, centroCustoIds: [RAIZ] });
    const maiorNoGrande = maiorLista(grande);

    from.mockReset();
    rpc.mockReset();

    const pequeno = bancoCom({ centros: 61, lancamentos: 45 });
    await listarLancamentos({ pagina: 0, tamanho: 25, centroCustoIds: [RAIZ] });

    expect(maiorNoGrande).toBe(maiorLista(pequeno));
    // 61 ids = ~2,3 KB de URL, dentro da faixa medida como segura.
    expect(maiorNoGrande).toBe(61);
  });

  it("vários centros: a união das subárvores viaja uma vez, sem repetição", async () => {
    // O filtro agora aceita vários centros, e a mesma regra de tamanho continua
    // valendo: o que viaja é a união das SUBÁRVORES (subconjunto dos 74 centros
    // do cadastro), nunca os lançamentos deles. O fixture devolve a mesma árvore
    // para os dois centros, que é o caso ruim de propósito: escolher a obra e uma
    // etapa dela não pode mandar o mesmo id duas vezes.
    const filtros = bancoCom({ centros: 61, lancamentos: 1871 });

    await listarLancamentos({
      pagina: 0,
      tamanho: 25,
      centroCustoIds: [RAIZ, OUTRA_RAIZ],
    });

    expect(rpc).toHaveBeenCalledTimes(2);
    const noEmbed = filtros.find(
      (f) => f.coluna === "lancamento_rateios.centro_custo_id",
    );
    expect(noEmbed?.valor).toHaveLength(61);
    expect(filtros.some((f) => f.metodo === "in" && f.coluna === "id")).toBe(
      false,
    );
  });

  it("centro sem nenhum id devolve lista vazia, não a lista inteira", async () => {
    // Centro excluído entre a tela e a consulta: "sem filtro" seria mostrar
    // TODOS os lançamentos da empresa para quem pediu um centro só.
    const filtros = bancoCom({ centros: 0, lancamentos: 0 });
    rpc.mockImplementation(() => Promise.resolve({ data: [], error: null }));

    const pagina = await listarLancamentos({
      pagina: 0,
      tamanho: 25,
      centroCustoIds: [RAIZ],
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
      listarLancamentos({ pagina: 0, tamanho: 25, centroCustoIds: [RAIZ] }),
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

/**
 * A conta bancária era o MESMO defeito, medido no banco em 01/09/2026.
 *
 * `idsPorContaBancaria` lia todos os lançamentos que passaram pela conta e
 * mandava a lista num `.in("id", ...)`. A maior conta tem **4.901 lançamentos**
 * — 177 KB de URL, muito além dos 69 KB que já matavam a requisição no caso do
 * centro. O `edge_logs` registrou `GET /rest/v1/lancamentos` com 29 KB
 * devolvendo 400.
 *
 * A correção é o mesmo par do centro, com uma diferença que importa: o embed vai
 * APELIDADO (`filtroConta:lancamento_parcelas!inner`), porque o embed sem
 * apelido alimenta o DINHEIRO da linha (pago, aberto, vencido, desconto, coluna
 * Revisão, contagem de parcelas). Filtrar aquele faria a linha somar só as
 * parcelas da conta escolhida — dinheiro errado na tela.
 */
describe("filtro de conta bancária na listagem", () => {
  const CONTA = "9f1b7c3e-1111-4111-8111-000000000001";

  it("filtra pelo embed apelidado, não por lista de ids de lançamento", async () => {
    const filtros = bancoCom({ centros: 61, lancamentos: 4901 });

    await listarLancamentos({
      pagina: 0,
      tamanho: 25,
      contaBancariaId: CONTA,
    });

    const noEmbed = filtros.find(
      (f) => f.coluna === "filtroConta.conta_bancaria_id",
    );
    expect(noEmbed?.metodo).toBe("eq");
    expect(noEmbed?.valor).toBe(CONTA);

    // E o que a correção mata: a lista de ids de lançamento na query string.
    expect(filtros.some((f) => f.metodo === "in" && f.coluna === "id")).toBe(
      false,
    );
  });

  it("não LÊ as parcelas da conta para montar lista de id", async () => {
    const filtros = bancoCom({ centros: 61, lancamentos: 4901 });

    await listarLancamentos({
      pagina: 0,
      tamanho: 25,
      contaBancariaId: CONTA,
    });

    // A asserção que trava o defeito na raiz: antes, o filtro varria
    // `lancamento_parcelas` inteira para juntar os ids dos lançamentos daquela
    // conta. Agora quem responde "existe parcela nesta conta?" é o próprio
    // banco, dentro do embed — nenhuma leitura de parcela sai daqui.
    const tabelasLidas = from.mock.calls.map((chamada) => chamada[0]);
    expect(tabelasLidas).not.toContain("lancamento_parcelas");

    // E nenhuma lista entregue à consulta cresce com os lançamentos da conta:
    // a mesma linha de controle da prova do centro.
    expect(maiorLista(filtros)).toBeLessThan(100);
  });

  it("sem filtro de conta, nada do embed apelidado entra na consulta", async () => {
    const filtros = bancoCom({ centros: 61, lancamentos: 4901 });

    await listarLancamentos({ pagina: 0, tamanho: 25 });

    expect(
      filtros.some((f) => String(f.coluna).startsWith("filtroConta")),
    ).toBe(false);
  });
});
