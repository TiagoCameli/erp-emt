import { describe, expect, it } from "vitest";

import { foraDaJanela, textoDaDiferenca } from "@/modules/financeiro/pagamentos/janela";

describe("foraDaJanela", () => {
  it("data igual à autorizada não é fora", () => {
    expect(foraDaJanela("2026-08-18", "2026-08-18")).toBe(false);
  });
  it("antes e depois são fora", () => {
    expect(foraDaJanela("2026-08-17", "2026-08-18")).toBe(true);
    expect(foraDaJanela("2026-08-19", "2026-08-18")).toBe(true);
  });
  it("sem data autorizada não é fora: o banco recusa esse caso por outro motivo", () => {
    expect(foraDaJanela("2026-08-17", null)).toBe(false);
  });
});

describe("textoDaDiferenca", () => {
  it("diz adiantado e o número de dias", () => {
    expect(textoDaDiferenca("2026-08-17", "2026-08-18")).toBe("adiantado em 1 dia");
    expect(textoDaDiferenca("2026-08-15", "2026-08-18")).toBe("adiantado em 3 dias");
  });
  it("diz atrasado e o número de dias", () => {
    expect(textoDaDiferenca("2026-08-19", "2026-08-18")).toBe("atrasado em 1 dia");
    expect(textoDaDiferenca("2026-09-18", "2026-08-18")).toBe("atrasado em 31 dias");
  });
  it("atravessa mês e ano sem errar a contagem", () => {
    expect(textoDaDiferenca("2027-01-01", "2026-12-31")).toBe("atrasado em 1 dia");
  });
});
