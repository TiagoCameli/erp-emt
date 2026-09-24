import { describe, expect, it } from "vitest";

import { COR_SEM_COMBUSTIVEL, corDoCombustivel, formatarCapacidade } from "./visual";

describe("corDoCombustivel", () => {
  it("casa o nome do catálogo da origem e o do catálogo de Compras", () => {
    expect(corDoCombustivel("Diesel S10")).toBe("#3B82F6");
    expect(corDoCombustivel("OLEO DIESEL B S10")).toBe("#3B82F6");
    expect(corDoCombustivel("Diesel S500")).toBe("#F59E0B");
    expect(corDoCombustivel("OLEO DIESEL B S500")).toBe("#F59E0B");
    expect(corDoCombustivel("Arla")).toBe("#14B8A6");
    expect(corDoCombustivel("ARLA 32 - LITRO")).toBe("#14B8A6");
    expect(corDoCombustivel("Gasolina comum")).toBe("#EF4444");
  });

  it("vazio ou fora do catálogo fica cinza", () => {
    expect(corDoCombustivel(null)).toBe(COR_SEM_COMBUSTIVEL);
    expect(corDoCombustivel("")).toBe(COR_SEM_COMBUSTIVEL);
    expect(corDoCombustivel("Óleo hidráulico 68")).toBe(COR_SEM_COMBUSTIVEL);
  });

  it("S10 não pega S100 nem S500 pega S5000", () => {
    expect(corDoCombustivel("Diesel S100")).toBe(COR_SEM_COMBUSTIVEL);
    expect(corDoCombustivel("Diesel S5000")).toBe(COR_SEM_COMBUSTIVEL);
  });
});

describe("formatarCapacidade", () => {
  it("até 2 casas, sem forçar zeros", () => {
    expect(formatarCapacidade(15000)).toBe("15.000");
    expect(formatarCapacidade(2500.5)).toBe("2.500,5");
  });
});
