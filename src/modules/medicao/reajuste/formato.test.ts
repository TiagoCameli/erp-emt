import { describe, expect, it } from "vitest";

import {
  aniversario,
  diferencaReajuste,
  mesAno,
  rotuloOrigemReajuste,
  rotuloSituacaoReajuste,
  situacaoDaLinhaReajuste,
} from "./formato";

describe("rótulos", () => {
  it("situação e origem", () => {
    expect(rotuloSituacaoReajuste("provisorio")).toBe("Provisório");
    expect(rotuloSituacaoReajuste("definitivo")).toBe("Definitivo");
    expect(rotuloOrigemReajuste("siac")).toBe("SIAC");
    expect(rotuloOrigemReajuste("manual")).toBe("Manual");
  });
});

describe("diferencaReajuste", () => {
  it("positivo a receber, negativo a devolver, zero sem diferença", () => {
    expect(diferencaReajuste("2.99")).toEqual({ texto: "R$ 2,99 a receber", sinal: 1 });
    expect(diferencaReajuste("-1.5")).toEqual({ texto: "R$ 1,50 a devolver", sinal: -1 });
    expect(diferencaReajuste("0")).toEqual({ texto: "sem diferença", sinal: 0 });
    expect(diferencaReajuste("-0.00")).toEqual({ texto: "sem diferença", sinal: 0 });
  });

  it("valor grande sem perder centavo (BigInt)", () => {
    expect(diferencaReajuste("-40021.28")).toEqual({ texto: "R$ 40.021,28 a devolver", sinal: -1 });
    expect(diferencaReajuste("123456789012345.67").texto).toBe("R$ 123.456.789.012.345,67 a receber");
  });
});

describe("mesAno e aniversario", () => {
  it("mês/ano da data-base", () => {
    expect(mesAno("2025-01-01")).toBe("01/2025");
    expect(mesAno(null)).toBe("");
  });

  it("data-base + periodicidade", () => {
    expect(aniversario("2025-01-01", 12)).toBe("01/2026");
    expect(aniversario("2025-04-01", 12)).toBe("04/2026");
    expect(aniversario("2025-11-01", 3)).toBe("02/2026");
    expect(aniversario("2025-01-01", 24)).toBe("01/2027");
    expect(aniversario(null, 12)).toBe("");
  });
});

describe("situacaoDaLinhaReajuste", () => {
  it("sem relatório que valha é sem_relatorio; com relatório, a situação dele", () => {
    expect(situacaoDaLinhaReajuste({ relatorioId: null, situacao: null })).toBe("sem_relatorio");
    expect(situacaoDaLinhaReajuste({ relatorioId: "r1", situacao: "provisorio" })).toBe("provisorio");
    expect(situacaoDaLinhaReajuste({ relatorioId: "r1", situacao: "definitivo" })).toBe("definitivo");
  });
});
