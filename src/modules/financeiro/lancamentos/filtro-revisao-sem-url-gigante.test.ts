import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALIAS_PENDENTES,
  ALIAS_RESOLVIDAS,
} from "@/modules/financeiro/lancamentos/revisao-no-embed";

/**
 * O filtro de REVISÃO da listagem de lançamentos NÃO pode viajar como lista de
 * ids de lançamento.
 *
 * Irmão de `filtro-centro-sem-url-gigante.test.ts`, e a faixa medida lá vale
 * aqui: o `in.(...)` do PostgREST vai na QUERY STRING de um GET, 37 caracteres
 * por uuid, e 1.115 ids já dão HTTP 400, 1.753 dão 520, e a partir de ~1.871 **a
 * requisição não completa e não deixa log em lugar nenhum**.
 *
 * Medido no banco em 03/09/2026, sobre os lançamentos A PAGAR:
 *
 * - `revisado`     = **6.106** lançamentos -> **~226 KB de URL**
 * - `parcial`      = 1
 * - `sem_conta`    = 0
 * - `nao_revisado` = 1
 *
 * O sintoma era "Algo deu errado ao carregar esta tela" ao escolher **Revisado**
 * no filtro de Revisão, com nada nos logs do banco — porque a requisição morria
 * antes de existir. A página inteira caía, e não só os cartões: os cartões estão
 * em `Suspense`, mas `listarLancamentos` é `await`ado direto no Server Component.
 *
 * E lista do COMPLEMENTO não seria conserto: `revisado` e `nao_revisado` são
 * complemento um do outro dentro de `a_pagar`, então basta a empresa parar de
 * informar conta bancária para o lado pequeno virar o lado grande.
 *
 * O que este teste trava é o TAMANHO: nenhuma lista entregue à consulta de
 * lançamentos pode crescer com o número de lançamentos no estado escolhido.
 */

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from, rpc }),
}));

const { listarLancamentos } = await import(
  "@/modules/financeiro/lancamentos/queries"
);

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
 * Monta o banco falso: `revisados` lançamentos com todas as parcelas resolvidas
 * (conta bancária preenchida) e `pendentes` com nenhuma.
 *
 * Devolve o que a consulta de lançamentos recebeu, que é o objeto do teste.
 */
function bancoCom({
  revisados,
  pendentes,
}: {
  revisados: number;
  pendentes: number;
}) {
  const parcelas = [
    ...Array.from({ length: revisados }, (_, i) => ({
      lancamento_id: uuid("aaa", i),
      conta_bancaria_id: uuid("ccc", 0),
      status: "pendente",
    })),
    ...Array.from({ length: pendentes }, (_, i) => ({
      lancamento_id: uuid("bbb", i),
      conta_bancaria_id: null,
      status: "pendente",
    })),
  ];

  const filtrosDaListagem: ChamadaFiltro[] = [];

  from.mockImplementation((tabela: string) => {
    if (tabela === "lancamento_parcelas") {
      const construtor: Record<string, unknown> = {
        select: () => construtor,
        eq: () => construtor,
        neq: () => construtor,
        is: () => construtor,
        order: () => construtor,
        // Respeita o range para `lerEmPaginas` terminar como termina em produção.
        range: (de: number, ate: number) =>
          Promise.resolve({ data: parcelas.slice(de, ate + 1), error: null }),
      };
      return construtor;
    }

    if (tabela === "lancamentos") {
      const construtor: Record<string, unknown> = {
        select: () => construtor,
        order: () => construtor,
        range: () => construtor,
        not: (coluna: string, operador: string, valor: unknown) => {
          filtrosDaListagem.push({ metodo: `not.${operador}`, coluna, valor });
          return construtor;
        },
        // Página vazia de propósito: o objeto do teste é o que a consulta RECEBE.
        then: (resolver: (r: unknown) => void) =>
          resolver({ data: [], error: null, count: 0 }),
      };
      for (const metodo of ["in", "eq", "neq", "gte", "lte", "lt", "is", "or"]) {
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

/** O maior array entregue como valor de filtro para a consulta de lançamentos. */
function maiorLista(filtros: ChamadaFiltro[]): number {
  return filtros.reduce(
    (maior, f) =>
      Array.isArray(f.valor) ? Math.max(maior, f.valor.length) : maior,
    0,
  );
}

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
});

describe("filtro de revisão na listagem", () => {
  it("Revisado filtra pelos embeds das parcelas, não por lista de ids", async () => {
    const filtros = bancoCom({ revisados: 6106, pendentes: 1 });

    await listarLancamentos({
      pagina: 0,
      tamanho: 25,
      tipo: "a_pagar",
      revisao: "revisado",
    });

    // O que a correção mata: a lista de ids de lançamento na query string.
    expect(filtros.some((f) => f.metodo === "in" && f.coluna === "id")).toBe(
      false,
    );

    // "Nenhuma parcela pendente" é o anti-join: embed filtrado + `is.null`.
    expect(
      filtros.some((f) => f.metodo === "is" && f.coluna === ALIAS_PENDENTES),
    ).toBe(true);
    // E "pelo menos uma resolvida", que é o que exige o lançamento TER parcela.
    expect(
      filtros.some(
        (f) => f.metodo === "not.is" && f.coluna === ALIAS_RESOLVIDAS,
      ),
    ).toBe(true);
  });

  it("o tamanho do filtro não cresce com os lançamentos no estado", async () => {
    // A linha de controle desta prova. Antes, este número era 6.106 num caso e 9
    // no outro — era exatamente isso que estourava a URL.
    const grande = bancoCom({ revisados: 6106, pendentes: 1 });
    await listarLancamentos({
      pagina: 0,
      tamanho: 25,
      tipo: "a_pagar",
      revisao: "revisado",
    });
    const maiorNoGrande = maiorLista(grande);

    from.mockReset();

    const pequeno = bancoCom({ revisados: 9, pendentes: 1 });
    await listarLancamentos({
      pagina: 0,
      tamanho: 25,
      tipo: "a_pagar",
      revisao: "revisado",
    });

    expect(maiorNoGrande).toBe(maiorLista(pequeno));
    // Zero: nenhuma lista viaja para este filtro.
    expect(maiorNoGrande).toBe(0);
  });

  it("nenhum estado de revisão lê a tabela de parcelas para montar ids", async () => {
    // A leitura das 8.031 parcelas por carregamento de tela some junto: quem
    // classifica passa a ser o banco, na mesma consulta.
    for (const revisao of [
      "revisado",
      "sem_conta",
      "parcial",
      "nao_revisado",
      "em_revisao",
    ] as const) {
      from.mockReset();
      const filtros = bancoCom({ revisados: 6106, pendentes: 3 });

      await listarLancamentos({
        pagina: 0,
        tamanho: 25,
        tipo: "a_pagar",
        revisao,
      });

      expect(
        from.mock.calls.some(([tabela]) => tabela === "lancamento_parcelas"),
        `${revisao} ainda lê lancamento_parcelas`,
      ).toBe(false);
      expect(
        filtros.some((f) => f.metodo === "in" && f.coluna === "id"),
        `${revisao} ainda manda lista de ids`,
      ).toBe(false);
    }
  });

  it("a pagar continua sendo o recorte dos quatro estados de conta", async () => {
    // `idsPorRevisao` filtrava `lancamentos.tipo = 'a_pagar'` na própria consulta
    // de parcelas, então pedir revisão com o tipo em "a receber" devolvia lista
    // vazia. Sem reproduzir isso, a tela passaria a mostrar linha de a receber
    // com a coluna Revisão em "-".
    const filtros = bancoCom({ revisados: 6106, pendentes: 1 });

    const pagina = await listarLancamentos({
      pagina: 0,
      tamanho: 25,
      tipo: "a_receber",
      revisao: "revisado",
    });

    expect(pagina).toEqual({ itens: [], total: 0 });
    expect(filtros).toHaveLength(0);
  });

  it("em_revisao vale nos dois tipos, e não força a pagar", async () => {
    // Único estado que não é de conta bancária: é status de parcela, e existe em
    // lançamento a receber também.
    const filtros = bancoCom({ revisados: 10, pendentes: 3 });

    await listarLancamentos({
      pagina: 0,
      tamanho: 25,
      tipo: "a_receber",
      revisao: "em_revisao",
    });

    // A consulta foi MONTADA: o atalho de "a pagar só" não valeu aqui. O dublê
    // devolve página vazia sempre, então quem separa os dois casos é isto, e não
    // o retorno (ver o teste de a receber acima, onde `filtros` fica vazio).
    expect(filtros.length).toBeGreaterThan(0);
    expect(filtros).toEqual(
      expect.arrayContaining([
        {
          metodo: "eq",
          coluna: `${ALIAS_PENDENTES}.status`,
          valor: "em_revisao",
        },
        { metodo: "eq", coluna: "tipo", valor: "a_receber" },
      ]),
    );
    expect(
      filtros.filter((f) => f.coluna === "tipo").map((f) => f.valor),
    ).toEqual(["a_receber"]);
  });

  it("sem tipo na chamada, os estados de conta se restringem a a pagar", async () => {
    const filtros = bancoCom({ revisados: 6106, pendentes: 1 });

    await listarLancamentos({ pagina: 0, tamanho: 25, revisao: "revisado" });

    expect(filtros).toEqual(
      expect.arrayContaining([
        { metodo: "eq", coluna: "tipo", valor: "a_pagar" },
      ]),
    );
  });

  it("sem filtro de revisão, nada de sonda entra na consulta", async () => {
    const filtros = bancoCom({ revisados: 6106, pendentes: 1 });

    await listarLancamentos({ pagina: 0, tamanho: 25, tipo: "a_pagar" });

    expect(
      filtros.some((f) => String(f.coluna).startsWith("revisao_")),
    ).toBe(false);
  });
});
