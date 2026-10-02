// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

/**
 * `facetasAjustes`: com um filtro escolhido, as opções dos OUTROS saem só das linhas que passam
 * nele; as do próprio filtro ignoram ele (senão não daria para trocar). O banco é um builder falso
 * que aplica eq/gte/lt em memória, o mesmo recorte de `aplicarFiltrosAjustes`.
 */

vi.mock("server-only", () => ({}));

type Linha = Record<string, string>;

const AJUSTES: Linha[] = [
  { transportadora_id: "t1", status: "aprovado", sinal: "credito", data: "2026-09-10T15:00:00Z" },
  { transportadora_id: "t1", status: "pendente_aprovacao", sinal: "debito", data: "2026-09-12T15:00:00Z" },
  { transportadora_id: "t2", status: "rejeitado", sinal: "debito", data: "2026-08-05T15:00:00Z" },
];

function builder(linhas: Linha[]) {
  const b = {
    eq: (coluna: string, valor: string) => builder(linhas.filter((l) => l[coluna] === valor)),
    gte: (coluna: string, valor: string) => builder(linhas.filter((l) => l[coluna] >= valor)),
    lt: (coluna: string, valor: string) => builder(linhas.filter((l) => l[coluna] < valor)),
    order: () => b,
    range: (de: number, ate: number) => Promise.resolve({ data: linhas.slice(de, ate + 1), error: null }),
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (nome: string) => {
      if (nome !== "frete_ajustes") throw new Error(`tabela inesperada: ${nome}`);
      return { select: () => builder(AJUSTES) };
    },
  }),
}));

import { facetasAjustes } from "@/modules/frete/ajustes/queries";

const ordenado = (r: Record<string, string[]>) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [...v].sort()]));

describe("facetasAjustes", () => {
  it("sem filtro, oferece tudo o que existe", async () => {
    expect(ordenado(await facetasAjustes({}))).toEqual({
      transportadora: ["t1", "t2"],
      status: ["aprovado", "pendente_aprovacao", "rejeitado"],
      sinal: ["credito", "debito"],
    });
  });

  it("a transportadora escolhida corta status e sinal, mas não as transportadoras", async () => {
    expect(ordenado(await facetasAjustes({ transportadoraId: "t2" }))).toEqual({
      transportadora: ["t1", "t2"],
      status: ["rejeitado"],
      sinal: ["debito"],
    });
  });

  it("o período restringe todos os filtros de seleção", async () => {
    expect(ordenado(await facetasAjustes({ de: "2026-09-01", ate: "2026-09-30", sinal: "debito" }))).toEqual({
      transportadora: ["t1"],
      status: ["pendente_aprovacao"],
      sinal: ["credito", "debito"],
    });
  });
});
