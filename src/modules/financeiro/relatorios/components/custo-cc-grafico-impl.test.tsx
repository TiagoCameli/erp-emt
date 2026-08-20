import { describe, expect, it } from "vitest";

import { encurtarNome } from "@/modules/financeiro/relatorios/components/custo-cc-grafico-impl";

/**
 * O defeito que isto trava: o eixo antigo era girado -30° e o navegador cortava
 * o COMEÇO do nome, sobrando "…-364/AC - Lote 09 & 10" — sem o "009 - " que
 * identifica a obra. Cortar tem que ser sempre no fim.
 */
describe("encurtarNome", () => {
  const NOME_REAL = "009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10";

  it("não mexe em nome que já cabe", () => {
    expect(encurtarNome("Casa James")).toBe("Casa James");
    expect(encurtarNome("Escritório Central")).toBe("Escritório Central");
  });

  it("preserva o começo do nome, que é o que identifica", () => {
    const curto = encurtarNome(NOME_REAL);
    expect(curto.startsWith("009 - Manutenção")).toBe(true);
    expect(curto.endsWith("…")).toBe(true);
  });

  it("respeita o limite de caracteres", () => {
    expect(encurtarNome(NOME_REAL, 20)).toHaveLength(20);
    expect(encurtarNome("a".repeat(80), 36)).toHaveLength(36);
  });

  it("não deixa espaço solto antes das reticências", () => {
    // "Aquisição de " tem 13 caracteres: cortar em 14 cairia no espaço.
    expect(encurtarNome("Aquisição de Equipamentos", 14)).toBe("Aquisição de…");
  });

  it("cabe no nome mais longo da base sem estourar o eixo", () => {
    // O maior nome real hoje, medido no banco em 20/08/2026.
    const maior =
      "011 - CONSTRUÇÃO DE ESCOLA EM TEMPO INTEGRAL MARECHAL THAUMATURGO";
    expect(encurtarNome(maior).length).toBeLessThanOrEqual(36);
    expect(encurtarNome(maior).startsWith("011 - CONSTRUÇÃO")).toBe(true);
  });
});
