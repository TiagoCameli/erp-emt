import { describe, expect, it } from "vitest";

import {
  NATUREZAS_CATEGORIA_FINANCEIRA,
  ROTULO_NATUREZA_CATEGORIA_FINANCEIRA,
  categoriaFinanceiraSchema,
} from "@/modules/cadastros/categorias-financeiras/schemas";

describe("naturezas do cadastro de categoria", () => {
  it("conhece as seis naturezas do banco", () => {
    expect(NATUREZAS_CATEGORIA_FINANCEIRA).toEqual([
      "operacional",
      "financeira",
      "movimentacao",
      "investimento",
      "distribuicao",
      "mutuo",
    ]);
  });

  it("editar uma categoria de investimento não quebra a validação", () => {
    const r = categoriaFinanceiraSchema.safeParse({
      nome: "Aquisição de Equipamento",
      tipo: "despesa",
      natureza: "investimento",
    });
    expect(r.success).toBe(true);
  });

  it("toda natureza tem rótulo", () => {
    for (const n of NATUREZAS_CATEGORIA_FINANCEIRA) {
      expect(ROTULO_NATUREZA_CATEGORIA_FINANCEIRA[n]).toBeTruthy();
    }
  });
});
