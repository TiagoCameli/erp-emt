import { describe, expect, it } from "vitest";

import { categoriaSchema } from "@/modules/cadastros/categorias/schemas";

const GRUPO = "11111111-1111-4111-8111-111111111111";

describe("categoriaSchema (subcategoria)", () => {
  it("aceita nome e grupo", () => {
    const r = categoriaSchema.safeParse({
      nome: "Cimento, agregados e concreto",
      grupoId: GRUPO,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ativo).toBe(true);
  });

  // Categoria sem grupo não existe no modelo: o grupo é o primeiro nível.
  it("exige o grupo", () => {
    const r = categoriaSchema.safeParse({ nome: "Elétrica" });
    expect(r.success).toBe(false);
  });

  it("recusa grupo que não é uuid", () => {
    const r = categoriaSchema.safeParse({ nome: "Elétrica", grupoId: "material" });
    expect(r.success).toBe(false);
  });

  it("exige nome com pelo menos 2 caracteres", () => {
    const r = categoriaSchema.safeParse({ nome: "E", grupoId: GRUPO });
    expect(r.success).toBe(false);
  });
});
