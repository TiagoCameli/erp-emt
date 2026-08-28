import { describe, expect, it } from "vitest";

import { categoriaSchema } from "@/modules/cadastros/categorias/schemas";

const GRUPO = "11111111-1111-4111-8111-111111111111";
const CUSTO = "22222222-2222-4222-8222-222222222222";

function entrada(troca: Record<string, unknown> = {}) {
  return {
    nome: "Cimento, agregados e concreto",
    grupoId: GRUPO,
    categoriaCustoId: CUSTO,
    ...troca,
  };
}

describe("categoriaSchema (subcategoria)", () => {
  it("aceita nome, grupo e categoria de custo", () => {
    const r = categoriaSchema.safeParse(entrada());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ativo).toBe(true);
  });

  // Categoria sem grupo não existe no modelo: o grupo é o primeiro nível.
  it("exige o grupo", () => {
    const r = categoriaSchema.safeParse({
      nome: "Elétrica",
      categoriaCustoId: CUSTO,
    });
    expect(r.success).toBe(false);
  });

  it("recusa grupo que não é uuid", () => {
    const r = categoriaSchema.safeParse(entrada({ grupoId: "material" }));
    expect(r.success).toBe(false);
  });

  it("exige nome com pelo menos 2 caracteres", () => {
    const r = categoriaSchema.safeParse(entrada({ nome: "E" }));
    expect(r.success).toBe(false);
  });

  /**
   * A categoria de custo chegou aqui em 28/08/2026, vinda do insumo, e ela NÃO é
   * obrigatória: vazio é a subcategoria recém-criada que ainda não foi
   * classificada no DRE. Exigir impediria de cadastrar a subcategoria antes de
   * decidir onde ela entra — e quem cobra é a aprovação da OC, que recusa a
   * ordem, com a tela avisando antes.
   */
  it("aceita subcategoria sem categoria de custo", () => {
    const r = categoriaSchema.safeParse(entrada({ categoriaCustoId: "" }));
    expect(r.success).toBe(true);
  });

  /** Campo que a tela desenha tem que existir no schema, ou o submit morre calado. */
  it("o campo da categoria de custo existe no schema", () => {
    const r = categoriaSchema.safeParse(entrada());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.categoriaCustoId).toBe(CUSTO);
  });
});
