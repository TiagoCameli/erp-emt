import { describe, expect, it } from "vitest";

import {
  CLASSE_COR_GRUPO,
  corGrupo,
  CORES_GRUPO,
  ehSlugGrupo,
  SLUGS_GRUPO,
  SUBCATEGORIA_A_CLASSIFICAR,
} from "@/modules/cadastros/_shared/insumo-grupos";

describe("grupos de insumo", () => {
  it("tem exatamente os 4 grupos do modelo", () => {
    expect([...SLUGS_GRUPO]).toEqual([
      "material",
      "mao_de_obra",
      "equipamentos",
      "outros",
    ]);
  });

  it("ehSlugGrupo reconhece só o que existe", () => {
    expect(ehSlugGrupo("material")).toBe(true);
    expect(ehSlugGrupo("mao de obra")).toBe(false);
    expect(ehSlugGrupo(null)).toBe(false);
  });

  it("toda cor tem classe de badge", () => {
    for (const cor of CORES_GRUPO) {
      expect(CLASSE_COR_GRUPO[cor]).toBeTruthy();
    }
  });

  // Cor desconhecida no banco não pode quebrar a tela: cai em neutro.
  it("corGrupo cai em neutro quando não conhece", () => {
    expect(corGrupo("ambar")).toBe("ambar");
    expect(corGrupo("rosa")).toBe("neutro");
    expect(corGrupo(null)).toBe("neutro");
  });

  it("o nome da fila de trabalho é estável", () => {
    expect(SUBCATEGORIA_A_CLASSIFICAR).toBe("A classificar");
  });
});
