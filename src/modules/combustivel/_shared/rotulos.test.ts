import { describe, expect, it } from "vitest";

import {
  agoraDataHoraLocal,
  dataHoraLocalParaIso,
  formatarDataHoraRioBranco,
  formatarLitros,
  isoParaDataHoraLocal,
} from "@/modules/combustivel/_shared/rotulos";

describe("data e hora em Rio Branco", () => {
  it("o campo vira instante com o fuso de Rio Branco", () => {
    expect(dataHoraLocalParaIso("2026-09-23T14:30")).toBe("2026-09-23T14:30:00-05:00");
  });

  it("ida e volta dão o mesmo texto, inclusive perto da meia-noite (o erro de fuso muda o dia)", () => {
    for (const campo of ["2026-09-23T00:05", "2026-09-23T23:55", "2026-12-31T23:59"]) {
      const iso = dataHoraLocalParaIso(campo)!;
      expect(isoParaDataHoraLocal(new Date(iso).toISOString())).toBe(campo);
    }
  });

  it("recusa data que não existe e texto torto", () => {
    expect(dataHoraLocalParaIso("2026-02-31T10:00")).toBeNull();
    expect(dataHoraLocalParaIso("23/09/2026 10:00")).toBeNull();
    expect(dataHoraLocalParaIso("")).toBeNull();
  });

  it("agora em Rio Branco: 03:00 UTC ainda é o dia anterior", () => {
    expect(agoraDataHoraLocal(new Date("2026-09-24T03:00:00Z"))).toBe("2026-09-23T22:00");
  });

  it("formata para a tela", () => {
    expect(formatarDataHoraRioBranco("2026-09-24T03:00:00Z")).toBe("23/09/2026 22:00");
    expect(formatarDataHoraRioBranco(null)).toBe("");
  });
});

describe("formatarLitros", () => {
  it("sempre 2 casas: 155,6 L não vira 156", () => {
    expect(formatarLitros(155.6)).toBe("155,60 L");
    expect(formatarLitros("1500")).toBe("1.500,00 L");
  });
});
