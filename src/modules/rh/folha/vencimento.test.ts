import { describe, expect, it } from "vitest";

import { vencimentoFolha } from "@/modules/rh/folha/vencimento";

describe("vencimentoFolha", () => {
  it("vence no dia configurado do mês seguinte à competência", () => {
    expect(vencimentoFolha("2026-08-01", 5)).toBe("2026-09-05");
  });

  it("cai no último dia quando o dia não existe no mês seguinte", () => {
    // Competência de janeiro paga em fevereiro: dia 31 não existe.
    expect(vencimentoFolha("2026-01-01", 31)).toBe("2026-02-28");
  });

  it("respeita fevereiro de ano bissexto", () => {
    expect(vencimentoFolha("2028-01-01", 31)).toBe("2028-02-29");
  });

  it("vira o ano na competência de dezembro", () => {
    expect(vencimentoFolha("2026-12-01", 5)).toBe("2027-01-05");
  });

  it("aceita dia 1", () => {
    expect(vencimentoFolha("2026-08-01", 1)).toBe("2026-09-01");
  });

  it("devolve null sem dia configurado, para o Financeiro preencher", () => {
    expect(vencimentoFolha("2026-08-01", null)).toBeNull();
  });
});
