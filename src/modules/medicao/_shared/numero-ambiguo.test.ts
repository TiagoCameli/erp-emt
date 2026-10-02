import { describe, expect, it } from "vitest";

import { ehNumeroAmbiguo } from "@/modules/medicao/_shared/numero-ambiguo";

/** Um ponto só, exatamente 3 dígitos depois, sem vírgula: "1.234" pode ser 1234 ou 1,234. */
describe("ehNumeroAmbiguo", () => {
  it.each(["1.234", "12.500", " 0.250 "])("%s é ambíguo", (t) => {
    expect(ehNumeroAmbiguo(t)).toBe(true);
  });

  it.each(["1.234,5", "1,234", "1.23", "1.2345", "1.234.567", "1234", "ab.234", ""])("%s não é ambíguo", (t) => {
    expect(ehNumeroAmbiguo(t)).toBe(false);
  });
});
