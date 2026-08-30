import { describe, expect, it } from "vitest";

import {
  filtroDasAlcas,
  paraNumeroDoFiltro,
  passoDaBarra,
  posicaoDasAlcas,
  resumoDaFaixa,
  tetoDaBarra,
} from "@/components/canonicos/filtro-valor-calculo";
import { formatarBRL } from "@/lib/formatadores";

describe("tetoDaBarra", () => {
  it("arredonda para cima, na magnitude do maior valor", () => {
    expect(tetoDaBarra(154700)).toBe(200000);
    expect(tetoDaBarra(378.23)).toBe(400);
    expect(tetoDaBarra(3000)).toBe(3000);
  });

  it("a alça direita não nasce colada na borda por causa do maior valor", () => {
    // Colada, ela pareceria "sem limite" (que é o que a borda significa) quando
    // na verdade é o maior valor da lista.
    expect(tetoDaBarra(154700)).toBeGreaterThan(154700);
  });

  it("lista vazia ou zerada não deixa a barra sem escala", () => {
    expect(tetoDaBarra(0)).toBe(1000);
    expect(tetoDaBarra(-5)).toBe(1000);
    expect(tetoDaBarra(Number.NaN)).toBe(1000);
  });
});

describe("passoDaBarra", () => {
  it("dá um passo que se lê em voz alta", () => {
    expect(passoDaBarra(200000)).toBe(1000);
    expect(passoDaBarra(3000)).toBe(20);
    expect(passoDaBarra(400)).toBe(2);
  });

  it("cerca de 200 paradas ao longo da barra", () => {
    // Passo de R$ 1 num teto de R$ 200 mil daria 200 mil paradas: o arraste
    // ficaria nervoso e o número embaixo da alça mudaria a cada pixel.
    for (const teto of [400, 3000, 200000, 5_000_000]) {
      const paradas = teto / passoDaBarra(teto);
      expect(paradas).toBeGreaterThanOrEqual(40);
      expect(paradas).toBeLessThanOrEqual(400);
    }
  });

  it("nunca desce abaixo de 1 real", () => {
    expect(passoDaBarra(10)).toBeGreaterThanOrEqual(1);
  });
});

describe("paraNumeroDoFiltro", () => {
  it("lê o número como a URL manda (ponto)", () => {
    expect(paraNumeroDoFiltro("1234.56")).toBe(1234.56);
  });

  it("lê o número como a pessoa digita (vírgula e ponto de milhar)", () => {
    expect(paraNumeroDoFiltro("1.234,56")).toBe(1234.56);
    expect(paraNumeroDoFiltro("154.700,00")).toBe(154700);
  });

  it("vazio é ausência, não zero", () => {
    // Confundir os dois faria "sem limite inferior" virar "a partir de R$ 0,00",
    // que é a mesma coisa por acidente e deixa de ser quando alguém lança
    // estorno negativo.
    expect(paraNumeroDoFiltro("")).toBeNull();
    expect(paraNumeroDoFiltro("   ")).toBeNull();
  });

  it("texto que não é número volta nulo, sem NaN vazando", () => {
    expect(paraNumeroDoFiltro("banana")).toBeNull();
  });
});

describe("posicaoDasAlcas e filtroDasAlcas", () => {
  const TETO = 200000;

  it("sem filtro, as alças ficam nas duas bordas", () => {
    expect(posicaoDasAlcas("", "", TETO)).toEqual({ de: 0, ate: TETO });
  });

  it("com filtro, cada alça vai para o seu valor", () => {
    expect(posicaoDasAlcas("1000", "50000", TETO)).toEqual({
      de: 1000,
      ate: 50000,
    });
  });

  describe("a borda significa SEM LIMITE", () => {
    it("alça direita no teto devolve ponta VAZIA, não o teto", () => {
      // É a regra que impede o filtro de esconder as compras grandes quando o
      // teto (que vem da lista da tela) muda.
      expect(filtroDasAlcas({ de: 1000, ate: TETO }, TETO)).toEqual({
        de: "1000",
        ate: "",
      });
    });

    it("alça esquerda em zero devolve ponta VAZIA", () => {
      expect(filtroDasAlcas({ de: 0, ate: 50000 }, TETO)).toEqual({
        de: "",
        ate: "50000",
      });
    });

    it("as duas nas bordas é filtro nenhum", () => {
      expect(filtroDasAlcas({ de: 0, ate: TETO }, TETO)).toEqual({
        de: "",
        ate: "",
      });
    });

    it("CONTROLE: um passo para dentro da borda JÁ é limite", () => {
      // Se este caso também virasse vazio, a barra teria uma zona morta perto da
      // borda em que arrastar não faria nada.
      expect(filtroDasAlcas({ de: 1000, ate: TETO - 1000 }, TETO)).toEqual({
        de: "1000",
        ate: "199000",
      });
    });
  });

  it("valor acima do teto não empurra a alça para fora da barra", () => {
    // Acontece quando o filtro veio da URL e a lista de agora é menor.
    expect(posicaoDasAlcas("999999", "", 200000)).toEqual({
      de: 200000,
      ate: 200000,
    });
  });

  it("ida e volta preserva o filtro", () => {
    const original = { de: "1000", ate: "50000" };
    const posicao = posicaoDasAlcas(original.de, original.ate, TETO);
    expect(filtroDasAlcas(posicao, TETO)).toEqual(original);
  });
});

describe("resumoDaFaixa", () => {
  it("as duas pontas viram 'a'", () => {
    expect(resumoDaFaixa("1000", "50000", formatarBRL)).toBe(
      `${formatarBRL(1000)} a ${formatarBRL(50000)}`,
    );
  });

  it("uma ponta só é dita como tal", () => {
    // "1000 - " deixaria a pessoa em dúvida sobre se o campo está vazio ou se o
    // filtro está quebrado.
    expect(resumoDaFaixa("1000", "", formatarBRL)).toBe(
      `acima de ${formatarBRL(1000)}`,
    );
    expect(resumoDaFaixa("", "50000", formatarBRL)).toBe(
      `até ${formatarBRL(50000)}`,
    );
  });

  it("as duas pontas iguais aparecem uma vez", () => {
    expect(resumoDaFaixa("1000", "1000", formatarBRL)).toBe(formatarBRL(1000));
  });

  it("sem faixa, resumo vazio", () => {
    expect(resumoDaFaixa("", "", formatarBRL)).toBe("");
  });
});
