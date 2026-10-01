// @vitest-environment node
import { describe, expect, it } from "vitest";

import { conferirSchema } from "./schemas";

describe("conferirSchema", () => {
  it("aceita os ids reais da carga (md5, sem bits de versão do RFC)", () => {
    const freteIds = ["cb220e17-9122-3627-b3e6-769d673b5a6c", "38673fc5-c55a-c7be-8687-e9b1d3589ef1", "36d377b7-0b9e-f28c-2f53-b722ec522b35"];
    expect(conferirSchema.safeParse({ regra: "R1", freteIds, conferida: true }).success).toBe(true);
  });

  it("recusa id que não é id, lista vazia e regra desconhecida", () => {
    expect(conferirSchema.safeParse({ regra: "R1", freteIds: ["1; drop table"], conferida: true }).success).toBe(false);
    expect(conferirSchema.safeParse({ regra: "R1", freteIds: [], conferida: true }).success).toBe(false);
    expect(conferirSchema.safeParse({ regra: "R9", freteIds: ["cb220e17-9122-3627-b3e6-769d673b5a6c"], conferida: true }).success).toBe(false);
  });
});
