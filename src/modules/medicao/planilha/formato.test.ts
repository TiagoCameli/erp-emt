import { describe, expect, it } from "vitest";

import { decimalPtBr, numeroExibicao } from "./formato";

describe("decimalPtBr", () => {
  it("mantém todas as casas e agrupa o milhar", () => {
    expect(decimalPtBr("580.8642996")).toBe("580,8642996");
    expect(decimalPtBr("17057.717")).toBe("17.057,717");
    expect(decimalPtBr("1234567.12345678901234567890")).toBe("1.234.567,12345678901234567890");
  });

  it("inteiro, negativo, nulo e texto estranho", () => {
    expect(decimalPtBr("100")).toBe("100");
    expect(decimalPtBr("-1000.5")).toBe("-1.000,5");
    expect(decimalPtBr(null)).toBe("");
    expect(decimalPtBr("abc")).toBe("abc");
  });
});

describe("numeroExibicao", () => {
  it.each([
    ["102.34700000000001", "102,347"],
    ["580.8643", "580,8643"],
    ["21154.63583333333", "21.154,6358333333"],
    ["17057.717", "17.057,717"],
    ["0.749996", "0,749996"],
    ["-0.30000000000000004", "-0,3"],
    ["0", "0"],
    ["36", "36"],
    ["1234567890123456789", "1.234.567.890.123.460.000"],
    ["0.000012345678901234567", "0,0000123456789012346"],
    ["9.9999999999999999", "10"],
    ["0.00", "0"],
    ["-0.000", "0"],
    ["007.50", "7,5"],
  ])("%s vira %s", (entrada, saida) => {
    expect(numeroExibicao(entrada)).toBe(saida);
  });
  it("null vira vazio e texto estranho volta como veio", () => {
    expect(numeroExibicao(null)).toBe("");
    expect(numeroExibicao("abc")).toBe("abc");
  });
});
