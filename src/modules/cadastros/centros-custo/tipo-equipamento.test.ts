import { describe, expect, it } from "vitest";

import {
  ROTULO_TIPO_CENTRO,
  TIPOS_CENTRO,
} from "@/modules/cadastros/centros-custo/schemas";

/**
 * "Equipamento Sem Alocação" (16/10/2026) é raiz de tipo 'equipamento' no banco
 * (centros_custo_tipo_check). Sem o tipo aqui, a árvore mostra o selo vazio e o
 * formulário do cadastro recusa o centro ao salvar.
 */
describe("tipo de centro 'equipamento'", () => {
  it("está no catálogo e tem rótulo", () => {
    expect(TIPOS_CENTRO).toContain("equipamento");
    expect(ROTULO_TIPO_CENTRO.equipamento).toBe("Equipamento");
  });
});
