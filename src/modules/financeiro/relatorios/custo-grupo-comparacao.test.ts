import { describe, expect, it } from "vitest";

import {
  itensComparaveis,
  maioresAltas,
  mesesDoPeriodo,
  variacaoRelativa,
} from "@/modules/financeiro/relatorios/custo-grupo-comparacao";

describe("mesesDoPeriodo", () => {
  it("lista os meses da janela, inclusive as pontas", () => {
    expect(mesesDoPeriodo({ de: "2025-11", ate: "2026-02" })).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(mesesDoPeriodo({ mes: "2026-05" })).toEqual(["2026-05"]);
    expect(mesesDoPeriodo({})).toEqual([]);
  });
});

describe("maioresAltas", () => {
  it("junta pela chave, só altas, maior primeiro, em centavos", () => {
    const r = maioresAltas(
      [
        { chave: "a", nome: "Combustível", valor: 300.3 },
        { chave: "b", nome: "Mão de obra", valor: 100 },
        { chave: "c", nome: "Novo", valor: 50.1 },
      ],
      [
        { chave: "a", nome: "Combustível", valor: 100.1 },
        { chave: "b", nome: "Mão de obra", valor: 200 },
        { chave: "d", nome: "Sumiu", valor: 80 },
      ],
    );
    expect(r.map((i) => [i.nome, i.variacao])).toEqual([
      ["Combustível", 200.2],
      ["Novo", 50.1],
    ]);
  });

  it("corta na quantidade pedida", () => {
    const atual = Array.from({ length: 8 }, (_, i) => ({ chave: `${i}`, nome: `${i}`, valor: i + 1 }));
    expect(maioresAltas(atual, [], 3)).toHaveLength(3);
  });
});

describe("variacaoRelativa", () => {
  it("fração, e null sem base", () => {
    expect(variacaoRelativa(150, 100)).toBe(0.5);
    expect(variacaoRelativa(10, 0)).toBeNull();
  });
});

describe("itensComparaveis", () => {
  it("grupo com insumo inteiro; o sem insumo aberto por categoria", () => {
    expect(
      itensComparaveis([
        { grupoId: "g1", nome: "Material", valor: 10 },
        {
          grupoId: null,
          nome: "Sem insumo",
          valor: 30,
          categorias: [
            { categoriaId: "c1", nome: "Combustível", valor: 20 },
            { categoriaId: null, nome: "Sem categoria", valor: 10 },
          ],
        },
      ]).map((i) => i.chave),
    ).toEqual(["grupo:g1", "categoria:c1", "categoria:sem"]);
  });
});
