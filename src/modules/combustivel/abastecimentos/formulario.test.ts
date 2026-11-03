import { describe, expect, it } from "vitest";

import { combustivelPorTanque } from "@/modules/combustivel/abastecimentos/formulario";

describe("combustivelPorTanque", () => {
  it("usa a entrada mais nova e, sem entrada, a transferência recebida mais nova", () => {
    const porTanque = combustivelPorTanque(
      [
        { tanqueId: "patio", insumoId: "s10" },
        { tanqueId: "patio", insumoId: "s500" },
      ],
      [
        // Meloza Colorado 2 só recebeu por transferência (30/10/2026).
        { tanqueId: "meloza", insumoId: "s10" },
        { tanqueId: "meloza", insumoId: "s500" },
        { tanqueId: "patio", insumoId: "gasolina" },
      ],
    );
    expect(porTanque).toEqual({ patio: "s10", meloza: "s10" });
  });

  it("tanque sem entrada nem transferência não aparece", () => {
    expect(combustivelPorTanque([], [])).toEqual({});
  });
});
