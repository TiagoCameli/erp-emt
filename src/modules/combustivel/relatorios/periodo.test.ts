import { describe, expect, it } from "vitest";

import {
  diaEmRioBranco,
  diaValido,
  diasDoMes,
  fimExclusivoDoDia,
  inicioDoDia,
  mesAnterior,
  mesEmRioBranco,
  mesValido,
  periodoDaUrl,
  somarDias,
  ultimosDias,
} from "@/modules/combustivel/relatorios/periodo";

describe("período em dias de Rio Branco", () => {
  it("valida dia e mês de verdade", () => {
    expect(diaValido("2026-09-23")).toBe("2026-09-23");
    expect(diaValido("2026-02-31")).toBeNull();
    expect(diaValido("23/09/2026")).toBeNull();
    expect(mesValido("2026-09")).toBe("2026-09");
    expect(mesValido("2026-13")).toBeNull();
  });

  it("limites do dia com o fuso fixo de -05:00", () => {
    expect(inicioDoDia("2026-09-23")).toBe("2026-09-23T00:00:00-05:00");
    expect(fimExclusivoDoDia("2026-12-31")).toBe("2027-01-01T00:00:00-05:00");
    expect(diaEmRioBranco("2026-09-24T04:59:00.000Z")).toBe("2026-09-23");
    expect(mesEmRioBranco("2026-10-01T04:00:00.000Z")).toBe("2026-09");
  });

  it("aritmética de calendário", () => {
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(ultimosDias("2026-09-23", 90)).toEqual({ de: "2026-06-26", ate: "2026-09-23" });
    expect(diasDoMes("2028-02")).toEqual({ de: "2028-02-01", ate: "2028-02-29" });
    expect(mesAnterior("2026-09-23")).toBe("2026-08");
    expect(mesAnterior("2026-01-31")).toBe("2025-12");
    expect(mesAnterior("2026-03-31")).toBe("2026-02");
  });

  it("URL: ponta inválida cai no padrão e período invertido troca de lado", () => {
    const padrao = { de: "2026-09-01", ate: "2026-09-23" };
    expect(periodoDaUrl(undefined, undefined, padrao)).toEqual(padrao);
    expect(periodoDaUrl("lixo", "2026-09-10", padrao)).toEqual({ de: "2026-09-01", ate: "2026-09-10" });
    expect(periodoDaUrl("2026-09-20", "2026-09-05", padrao)).toEqual({ de: "2026-09-05", ate: "2026-09-20" });
    expect(periodoDaUrl(["2026-08-01", "x"], undefined, padrao)).toEqual({ de: "2026-08-01", ate: "2026-09-23" });
  });
});
