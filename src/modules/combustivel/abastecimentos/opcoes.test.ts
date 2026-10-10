import { describe, expect, it } from "vitest";

import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { obrasParaAlocacao } from "@/modules/combustivel/abastecimentos/opcoes";

const centro = (id: string, tipo: string | null, paiId: string | null = null) =>
  ({ id, nome: id, tipo, paiId }) as unknown as CentroCustoOpcao;

describe("obrasParaAlocacao", () => {
  it("oferece obra e os centros que eram obra até 10/10/2026 (sócio, empresa ligada, imobilizado)", () => {
    const ids = obrasParaAlocacao([
      centro("obra", "obra"),
      centro("amazonia", "empresa_ligada"),
      centro("casa-james", "socio"),
      centro("aquisicao", "imobilizado"),
      centro("escritorio", "escritorio"),
      centro("manutencao", "manutencao"),
      centro("etapa", null, "obra"),
    ]).map((c) => c.id);
    expect(ids).toEqual(["obra", "amazonia", "casa-james", "aquisicao"]);
  });
});
