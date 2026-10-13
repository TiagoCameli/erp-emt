import { describe, expect, it } from "vitest";

import { ERRO_SEM_PERMISSAO_BANCO, traduzirErroEstoque } from "@/modules/estoque/erros";

describe("traduzirErroEstoque", () => {
  it("trava do banco (P0001) vai como veio", () => {
    expect(traduzirErroEstoque({ code: "P0001", message: "A OC OC-2026-0068 só tem 1 deste item para dar entrada" }, "x")).toBe(
      "A OC OC-2026-0068 só tem 1 deste item para dar entrada",
    );
  });
  it("RLS vira a frase de permissão", () => {
    expect(traduzirErroEstoque({ code: "42501", message: "permission denied" }, "x")).toBe(ERRO_SEM_PERMISSAO_BANCO);
  });
  it("o resto vira o fallback", () => {
    expect(traduzirErroEstoque({ code: "23505", message: "duplicate key" }, "Tente de novo")).toBe("Tente de novo");
    expect(traduzirErroEstoque(null, "Tente de novo")).toBe("Tente de novo");
  });
});
