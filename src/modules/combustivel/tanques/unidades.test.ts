import { describe, expect, it } from "vitest";

import { deLitros, ehUnidadeDeMassa, emLitros } from "@/modules/combustivel/tanques/unidades";

// Espelho de fn_tanque_em_litros: os mesmos números do ensaio no banco (14/10/2026).
describe("unidades do tanque de material", () => {
  it("volume converte sem densidade", () => {
    expect(emLitros(10, "L", null)).toBe(10);
    expect(emLitros(2, "m3", null)).toBe(2000);
    expect(emLitros(2, "m³", null)).toBe(2000);
  });
  it("massa divide pela densidade", () => {
    expect(emLitros(1020, "kg", 1.02)).toBeCloseTo(1000, 10);
    expect(emLitros(1, "t", 0.95)).toBeCloseTo(1052.6316, 4);
  });
  it("massa sem densidade e unidade fora da lista não convertem", () => {
    expect(emLitros(1, "kg", null)).toBeNull();
    expect(emLitros(1, "t", 0)).toBeNull();
    expect(emLitros(1, "un", 1)).toBeNull();
    expect(emLitros(1, null, 1)).toBeNull();
  });
  it("deLitros desfaz emLitros", () => {
    expect(deLitros(29126.2136, "t", 1.03)).toBeCloseTo(30, 4);
    expect(deLitros(30000, "m3", null)).toBe(30);
  });
  it("só kg e t são massa", () => {
    expect(ehUnidadeDeMassa("KG")).toBe(true);
    expect(ehUnidadeDeMassa("t")).toBe(true);
    expect(ehUnidadeDeMassa("L")).toBe(false);
    expect(ehUnidadeDeMassa("un")).toBe(false);
  });
});
