import { describe, expect, it } from "vitest";

import {
  nomesDoRateio,
  rotuloCentroCusto,
} from "@/modules/financeiro/_shared/centro-de-custo";

describe("rotuloCentroCusto", () => {
  it("um centro: mostra o nome", () => {
    expect(rotuloCentroCusto([{ centroNome: "BR-364 Lote 9" }])).toBe(
      "BR-364 Lote 9",
    );
  });

  /**
   * A regra que existe para a coluna não mentir. Nomear o primeiro de três faria
   * a linha parecer ser toda daquela obra, e o valor ao lado é dinheiro —
   * exatamente o erro que a coluna deveria evitar.
   */
  it("vários centros: conta em vez de nomear o primeiro", () => {
    const r = rotuloCentroCusto([
      { centroNome: "BR-364 Lote 9" },
      { centroNome: "BR-364 Lote 10" },
      { centroNome: "Escritório Central" },
    ]);
    expect(r).toBe("3 centros de custo");
    expect(r).not.toContain("Lote 9");
  });

  it("sem rateio: null, para a tela mostrar travessão", () => {
    expect(rotuloCentroCusto([])).toBeNull();
    expect(rotuloCentroCusto(null)).toBeNull();
    expect(rotuloCentroCusto(undefined)).toBeNull();
  });

  it("rateio com nome vazio não conta como centro", () => {
    // Vem de join que não resolveu: contar isso faria "2 centros de custo"
    // aparecer num lançamento que tem um só.
    expect(
      rotuloCentroCusto([{ centroNome: "Obra A" }, { centroNome: null }]),
    ).toBe("Obra A");
    expect(
      rotuloCentroCusto([{ centroNome: "Obra A" }, { centroNome: "" }]),
    ).toBe("Obra A");
  });
});

describe("nomesDoRateio", () => {
  it("não repete o nome quando há um só", () => {
    // A célula já mostra o nome; o title seria eco.
    expect(nomesDoRateio([{ centroNome: "Obra A" }])).toBeUndefined();
  });

  it("lista os nomes de dois a cinco centros", () => {
    expect(
      nomesDoRateio([{ centroNome: "Obra A" }, { centroNome: "Obra B" }]),
    ).toBe("Obra A · Obra B");
  });

  it("acima de cinco, conta em vez de listar", () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({
      centroNome: `Obra ${i}`,
    }));
    expect(nomesDoRateio(seis)).toBe("6 centros de custo");
  });
});
