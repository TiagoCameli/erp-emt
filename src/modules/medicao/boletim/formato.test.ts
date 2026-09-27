import { describe, expect, it } from "vitest";

import { opcaoMedicao, percentualExibicao, periodoMedicao } from "@/modules/medicao/boletim/formato";

describe("percentualExibicao", () => {
  it("mostra 2 casas no formato brasileiro", () => {
    expect(percentualExibicao("0.49593561981791578605")).toMatch(/^49,59\s?%$/);
    expect(percentualExibicao("1.00000000000000000000")).toMatch(/^100,00\s?%$/);
    expect(percentualExibicao("0")).toMatch(/^0,00\s?%$/);
  });

  it("nulo (previsto zero ou sem regra) fica vazio", () => {
    expect(percentualExibicao(null)).toBe("");
  });
});

describe("periodoMedicao", () => {
  it("mesmo ano: o ano só no fim", () => {
    expect(periodoMedicao("2026-08-01", "2026-08-31")).toBe("01/08 a 31/08/2026");
  });

  it("virada de ano: o ano nos dois lados", () => {
    expect(periodoMedicao("2025-12-15", "2026-01-14")).toBe("15/12/2025 a 14/01/2026");
  });
});

describe("opcaoMedicao", () => {
  it("número ordinal e período", () => {
    expect(opcaoMedicao({ numero: 10, periodo_inicio: "2026-08-01", periodo_fim: "2026-08-31" })).toBe(
      "10ª (01/08 a 31/08/2026)",
    );
  });
});
