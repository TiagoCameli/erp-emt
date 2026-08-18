import { describe, expect, it } from "vitest";

import { insumoSchema } from "@/modules/cadastros/insumos/schemas";

const UM_ID = "11111111-1111-1111-1111-111111111111";
const OUTRO_ID = "22222222-2222-2222-2222-222222222222";
const TERCEIRO_ID = "33333333-3333-3333-3333-333333333333";

function insumoValido(sobrescreve: Record<string, unknown> = {}) {
  return {
    nome: "Diesel S10",
    categoriaId: UM_ID,
    unidadeId: OUTRO_ID,
    categoriaFinanceiraId: TERCEIRO_ID,
    ...sobrescreve,
  };
}

const mensagensDe = (resultado: ReturnType<typeof insumoSchema.safeParse>) =>
  resultado.success ? [] : resultado.error.issues.map((problema) => problema.message);

describe("insumoSchema", () => {
  it("aceita insumo completo", () => {
    expect(insumoSchema.safeParse(insumoValido()).success).toBe(true);
  });

  /**
   * A categoria de custo é o que faz o custo da compra ter lugar no DRE: ela desce
   * para o rateio do lançamento quando a OC do insumo é aprovada. Sem ela, a
   * aprovação é recusada no banco — então barrar aqui é mais honesto que deixar
   * cadastrar e falhar depois.
   */
  it("exige a categoria de custo", () => {
    const resultado = insumoSchema.safeParse(insumoValido({ categoriaFinanceiraId: "" }));
    expect(resultado.success).toBe(false);
    expect(mensagensDe(resultado)).toContain("Selecione a categoria do custo");
  });

  it("exige a categoria de custo quando o campo nem vem", () => {
    const { categoriaFinanceiraId: _ignorado, ...semCampo } = insumoValido();
    expect(insumoSchema.safeParse(semCampo).success).toBe(false);
  });

  it("continua exigindo a categoria do insumo e a unidade", () => {
    expect(mensagensDe(insumoSchema.safeParse(insumoValido({ categoriaId: "" })))).toContain(
      "Selecione uma categoria",
    );
    expect(mensagensDe(insumoSchema.safeParse(insumoValido({ unidadeId: "" })))).toContain(
      "Selecione uma unidade de medida",
    );
  });

  it("recusa nome só de números", () => {
    expect(mensagensDe(insumoSchema.safeParse(insumoValido({ nome: "123" })))).toContain(
      "Nome do insumo não pode ser só números",
    );
  });
});
