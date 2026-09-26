import { describe, expect, it } from "vitest";

import { decimalPtBr } from "./formato";

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
