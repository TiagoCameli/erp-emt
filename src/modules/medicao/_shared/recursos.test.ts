import { describe, expect, it } from "vitest";

import { MODULOS, recursosDoModulo } from "@/config/recursos";

describe("catálogo da Medição de Contratos", () => {
  it("o módulo existe entre Manutenção e Administração", () => {
    const ids = MODULOS.map((m) => m.id);
    expect(ids.indexOf("medicao")).toBe(ids.indexOf("manutencao") + 1);
    expect(ids.indexOf("administracao")).toBe(ids.indexOf("medicao") + 1);
  });

  it("as abas do módulo seguem a ordem do menu, com as ações do backfill", () => {
    expect(recursosDoModulo("medicao").map((r) => [r.id, [...r.acoes]])).toEqual([
      ["medicao.painel", ["ver"]],
      ["medicao.contratos", ["ver", "criar", "editar", "excluir"]],
      ["medicao.planilha", ["ver", "criar", "excluir", "aprovar", "desaprovar"]],
      ["medicao.lancamentos", ["ver", "criar", "editar", "excluir"]],
      ["medicao.medicoes", ["ver", "criar"]],
      ["medicao.boletim", ["ver"]],
    ]);
  });
});
