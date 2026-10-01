import { describe, expect, it } from "vitest";

import { REGRAS_ARREDONDAMENTO, ROTULO_REGRA } from "./rotulos";

describe("regras de arredondamento", () => {
  it("inclui o truncado por item e todas têm rótulo", () => {
    expect(REGRAS_ARREDONDAMENTO).toContain("item_truncado");
    expect(ROTULO_REGRA.item_truncado).toBe("Truncado por item, em cada medição");
    for (const r of REGRAS_ARREDONDAMENTO) expect(ROTULO_REGRA[r]).toBeTruthy();
  });
});
