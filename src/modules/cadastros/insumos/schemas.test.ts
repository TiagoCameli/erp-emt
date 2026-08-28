import { describe, expect, it } from "vitest";

import { insumoSchema } from "@/modules/cadastros/insumos/schemas";

const ID_CATEGORIA = "11111111-1111-4111-8111-111111111111";
const ID_UNIDADE = "33333333-3333-4333-8333-333333333333";

function entrada(troca: Record<string, unknown> = {}) {
  return {
    codigo: "",
    nome: "MUNHÃO",
    categoriaId: ID_CATEGORIA,
    unidadeId: ID_UNIDADE,
    descricao: "",
    ativo: true,
    ...troca,
  };
}

describe("insumoSchema", () => {
  it("aceita o insumo completo", () => {
    const resultado = insumoSchema.safeParse(entrada());

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.categoriaId).toBe(ID_CATEGORIA);
    }
  });

  /**
   * A categoria de CUSTO saiu do insumo em 28/08/2026: ela é da subcategoria.
   * O schema não pode voltar a exigi-la, senão salvar um insumo morre calado num
   * campo que a tela não desenha. Quem classifica o DRE é a subcategoria, e a
   * subcategoria continua obrigatória aqui.
   */
  it("não exige categoria de custo, e continua exigindo a subcategoria", () => {
    expect(insumoSchema.safeParse(entrada()).success).toBe(true);
    const resultado = insumoSchema.safeParse(entrada({ categoriaId: "" }));

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.message).toBe(
        "Selecione uma categoria",
      );
    }
  });

  it("recusa subcategoria que não é um id", () => {
    const resultado = insumoSchema.safeParse(
      entrada({ categoriaId: "pecas-e-componentes" }),
    );

    expect(resultado.success).toBe(false);
  });

  /**
   * A categoria de CUSTO deixou de ser campo do insumo em 28/08/2026, e o schema
   * IGNORA o que vier com esse nome. Se ele voltasse a exigi-la, salvar um insumo
   * morreria calado num campo que a tela não desenha — foi assim que a criação de
   * OC morreu por um dia em 20/08.
   */
  it("ignora categoriaCustoId que sobre de tela antiga", () => {
    expect(
      insumoSchema.safeParse(entrada({ categoriaCustoId: "" })).success,
    ).toBe(true);
    expect(
      insumoSchema.safeParse(entrada({ categoriaCustoId: "manutencao" }))
        .success,
    ).toBe(true);
  });
});
