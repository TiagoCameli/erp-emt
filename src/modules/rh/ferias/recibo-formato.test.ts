import { describe, expect, it } from "vitest";

import { vencimentoPadraoRecibo } from "@/modules/rh/ferias/recibo-formato";

describe("vencimentoPadraoRecibo", () => {
  it("vence dois dias antes do gozo", () => {
    expect(vencimentoPadraoRecibo("2026-03-12")).toBe("2026-03-10");
  });

  it("volta de mês", () => {
    expect(vencimentoPadraoRecibo("2026-03-01")).toBe("2026-02-27");
  });

  it("volta de ano", () => {
    expect(vencimentoPadraoRecibo("2027-01-02")).toBe("2026-12-31");
  });
});
