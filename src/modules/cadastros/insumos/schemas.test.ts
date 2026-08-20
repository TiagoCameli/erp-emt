import { describe, expect, it } from "vitest";

import { insumoSchema } from "@/modules/cadastros/insumos/schemas";

const ID_CATEGORIA = "11111111-1111-4111-8111-111111111111";
const ID_CATEGORIA_CUSTO = "22222222-2222-4222-8222-222222222222";
const ID_UNIDADE = "33333333-3333-4333-8333-333333333333";

function entrada(troca: Record<string, unknown> = {}) {
  return {
    codigo: "",
    nome: "MUNHÃO",
    categoriaId: ID_CATEGORIA,
    categoriaCustoId: ID_CATEGORIA_CUSTO,
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
      expect(resultado.data.categoriaCustoId).toBe(ID_CATEGORIA_CUSTO);
    }
  });

  /**
   * A trava que motivou o campo: `fn_aprovar_ordem_compra` recusa a ordem
   * inteira quando um item aponta para insumo sem categoria de custo. Salvar o
   * insumo sem ela é criar uma compra que ninguém consegue aprovar.
   */
  it("recusa insumo sem categoria de custo", () => {
    const resultado = insumoSchema.safeParse(entrada({ categoriaCustoId: "" }));

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.message).toBe(
        "Selecione uma categoria de custo",
      );
    }
  });

  it("recusa categoria de custo que não é um id", () => {
    const resultado = insumoSchema.safeParse(
      entrada({ categoriaCustoId: "manutencao" }),
    );

    expect(resultado.success).toBe(false);
  });

  /**
   * Categoria de INSUMO e categoria de CUSTO são campos distintos: a primeira é
   * a subcategoria do grupo ("Peças e componentes"), a segunda é a do DRE
   * ("Manutenção de equipamentos"). Preencher uma não dispensa a outra — foi
   * justamente a confusão entre as duas que deixou o buraco passar.
   */
  it("exige as duas categorias, não uma ou outra", () => {
    expect(insumoSchema.safeParse(entrada({ categoriaId: "" })).success).toBe(
      false,
    );
    expect(
      insumoSchema.safeParse(entrada({ categoriaCustoId: "" })).success,
    ).toBe(false);
  });
});
