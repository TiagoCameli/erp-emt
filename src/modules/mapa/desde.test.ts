import { describe, expect, it } from "vitest";

import { textoDesde } from "@/modules/mapa/desde";

describe("desde quando a máquina está no estado", () => {
  it("conta dias de calendário de Rio Branco, não 24 horas corridas", () => {
    // US-001: marcada parada 15/10 às 17h21 de Rio Branco (21h21 UTC); a view dizia "há 0 dias".
    expect(textoDesde("2026-10-15T21:21:25.772548+00:00", "2026-10-16")).toBe(
      "desde ontem",
    );
    expect(textoDesde("2026-10-16T13:00:00+00:00", "2026-10-16")).toBe(
      "desde hoje",
    );
  });

  it("à noite em Rio Branco ainda é o mesmo dia, mesmo já sendo amanhã em UTC", () => {
    // 16/10 às 21h de Rio Branco = 17/10 02h UTC
    expect(textoDesde("2026-10-17T02:00:00+00:00", "2026-10-16")).toBe(
      "desde hoje",
    );
  });

  it("mais de um dia mostra a data e a conta", () => {
    expect(textoDesde("2026-10-12T15:00:00+00:00", "2026-10-16")).toBe(
      "desde 12/10/2026 · há 4 dias",
    );
    expect(textoDesde(null, "2026-10-16")).toBeNull();
    expect(textoDesde("lixo", "2026-10-16")).toBeNull();
  });
});
