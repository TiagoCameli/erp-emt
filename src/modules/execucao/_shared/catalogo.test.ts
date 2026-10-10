import { describe, expect, it } from "vitest";

import { MODULOS, RECURSOS } from "@/config/recursos";

describe("catálogo da Execução", () => {
  it("o módulo vem depois da Medição", () => {
    const ids = MODULOS.map((m) => m.id);
    expect(ids.indexOf("execucao")).toBe(ids.indexOf("medicao") + 1);
  });

  it("a Fase 1a registra só as três abas com tela", () => {
    const abas = RECURSOS.filter((r) => r.modulo === "execucao").map((r) => [r.id, r.rota, [...r.acoes]]);
    expect(abas).toEqual([
      ["execucao.obras", "/execucao/obras", ["ver"]],
      ["execucao.cronogramas", "/execucao/cronogramas", ["ver", "criar", "editar", "excluir"]],
      ["execucao.modelos", "/execucao/modelos", ["ver", "criar", "editar", "excluir"]],
    ]);
  });
});
