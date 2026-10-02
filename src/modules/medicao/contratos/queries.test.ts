// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

/**
 * `facetasContratos` (lista de contratos e painel): o status escolhido corta os tipos de
 * contratante oferecidos e vice-versa, sem cortar a si mesmo. O banco é um builder falso que
 * aplica is/not/in em memória, o mesmo recorte de `aplicarFiltrosContratos`.
 */

vi.mock("server-only", () => ({}));

type Linha = { status: string; contratante_tipo: string; excluido_em: string | null };

const CONTRATOS: Linha[] = [
  { status: "ativo", contratante_tipo: "publico", excluido_em: null },
  { status: "ativo", contratante_tipo: "privado", excluido_em: null },
  { status: "encerrado", contratante_tipo: "publico", excluido_em: null },
  { status: "suspenso", contratante_tipo: "privado", excluido_em: "2026-09-01T00:00:00Z" },
];

function builder(linhas: Linha[]) {
  const b = {
    is: (coluna: keyof Linha) => builder(linhas.filter((l) => l[coluna] === null)),
    not: (coluna: keyof Linha) => builder(linhas.filter((l) => l[coluna] !== null)),
    in: (coluna: keyof Linha, valores: readonly string[]) =>
      builder(linhas.filter((l) => valores.includes(l[coluna] ?? ""))),
    order: () => b,
    range: (de: number, ate: number) => Promise.resolve({ data: linhas.slice(de, ate + 1), error: null }),
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (nome: string) => {
      if (nome !== "mc_contratos") throw new Error(`tabela inesperada: ${nome}`);
      return { select: () => builder(CONTRATOS) };
    },
  }),
}));

import { facetasContratos } from "@/modules/medicao/contratos/queries";

const ordenado = (r: Record<string, string[]>) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [...v].sort()]));

describe("facetasContratos", () => {
  it("sem filtro, oferece o que existe fora da lixeira", async () => {
    expect(ordenado(await facetasContratos({}))).toEqual({
      status: ["ativo", "encerrado"],
      tipo: ["privado", "publico"],
    });
  });

  it("o tipo escolhido corta os status, mas não os tipos", async () => {
    expect(ordenado(await facetasContratos({ tipos: ["privado"] }))).toEqual({
      status: ["ativo"],
      tipo: ["privado", "publico"],
    });
  });

  it("escolha múltipla do painel e lixeira", async () => {
    expect(ordenado(await facetasContratos({ status: ["encerrado", "ativo"], tipos: ["publico"] }))).toEqual({
      status: ["ativo", "encerrado"],
      tipo: ["privado", "publico"],
    });
    expect(ordenado(await facetasContratos({ lixeira: true }))).toEqual({ status: ["suspenso"], tipo: ["privado"] });
  });
});
