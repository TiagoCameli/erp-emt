import { describe, expect, it } from "vitest";

import { rotuloInsumo } from "./rotulo";

describe("rotuloInsumo", () => {
  it("põe a unidade ao lado do nome", () => {
    expect(rotuloInsumo("BRITA 0", "t")).toBe("BRITA 0 - t");
    expect(rotuloInsumo("BRITA 0", "m3")).toBe("BRITA 0 - m3");
  });

  it("sem unidade, fica só o nome", () => {
    expect(rotuloInsumo("BRITA 0", null)).toBe("BRITA 0");
    expect(rotuloInsumo("BRITA 0", undefined)).toBe("BRITA 0");
    expect(rotuloInsumo("BRITA 0", "  ")).toBe("BRITA 0");
  });
});
