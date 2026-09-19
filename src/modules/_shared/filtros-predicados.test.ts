import { describe, expect, it } from "vitest";

import { dentroDaJanelaDeMeses } from "@/modules/_shared/filtros-predicados";

/**
 * O predicado da régua de mês de referência nas telas que filtram em memória.
 *
 * O que ele troca: `mesmoMesReferencia`, de um mês só, que era o par do
 * `input type="month"`. A régua devolve uma JANELA, e a diferença que importa
 * está nas pontas abertas — "de julho em diante" não pode virar "julho".
 */
describe("dentroDaJanelaDeMeses", () => {
  const competencia = "2026-07-01";

  it("sem janela nenhuma, passa tudo, inclusive o que não tem competência", () => {
    // Filtro que ninguém aplicou não pode esconder linha.
    expect(dentroDaJanelaDeMeses(competencia, "", "")).toBe(true);
    expect(dentroDaJanelaDeMeses(null, "", "")).toBe(true);
  });

  it("dentro das duas pontas", () => {
    expect(dentroDaJanelaDeMeses(competencia, "2026-05", "2026-08")).toBe(true);
    expect(dentroDaJanelaDeMeses(competencia, "2026-07", "2026-07")).toBe(true);
  });

  it("fora das pontas", () => {
    expect(dentroDaJanelaDeMeses(competencia, "2026-08", "2026-12")).toBe(
      false,
    );
    expect(dentroDaJanelaDeMeses(competencia, "2026-01", "2026-06")).toBe(
      false,
    );
  });

  it("ponta aberta vale sem limite daquele lado", () => {
    expect(dentroDaJanelaDeMeses(competencia, "2026-05", "")).toBe(true);
    expect(dentroDaJanelaDeMeses(competencia, "", "2026-08")).toBe(true);
    expect(dentroDaJanelaDeMeses(competencia, "2026-09", "")).toBe(false);
    expect(dentroDaJanelaDeMeses(competencia, "", "2026-06")).toBe(false);
  });

  it("sem competência, a linha fica de fora de qualquer janela", () => {
    // Mesma regra do filtro de um mês: com filtro de tempo aplicado, quem não
    // tem mês não pertence a mês nenhum.
    expect(dentroDaJanelaDeMeses(null, "2026-05", "2026-08")).toBe(false);
  });

  it("compara o MÊS, e não o dia que o banco guarda", () => {
    // A coluna é `date` no dia 1, mas uma carga antiga pode ter outro dia: o que
    // decide é o mês.
    expect(dentroDaJanelaDeMeses("2026-07-31", "2026-07", "2026-07")).toBe(true);
  });

  it("atravessa o ano sem inverter a comparação", () => {
    expect(dentroDaJanelaDeMeses("2026-01-01", "2025-11", "2026-02")).toBe(
      true,
    );
    expect(dentroDaJanelaDeMeses("2025-10-01", "2025-11", "2026-02")).toBe(
      false,
    );
  });
});
