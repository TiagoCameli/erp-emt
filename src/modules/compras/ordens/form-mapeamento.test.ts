import { describe, expect, it } from "vitest";

import {
  achatarGruposEmItens,
  agruparItensPorCentroCusto,
  type ItemPlano,
} from "@/modules/compras/ordens/form-mapeamento";

const INS_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INS_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const INS_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CC_1 = "11111111-1111-4111-8111-111111111111";
const CC_2 = "22222222-2222-4222-8222-222222222222";

describe("agruparItensPorCentroCusto", () => {
  it("agrupa vários insumos no mesmo centro de custo", () => {
    const grupos = agruparItensPorCentroCusto([
      { insumoId: INS_A, quantidade: 10, precoUnitario: 32, centroCustoId: CC_1 },
      { insumoId: INS_B, quantidade: 5, precoUnitario: 80, centroCustoId: CC_1 },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].centroCustoId).toBe(CC_1);
    expect(grupos[0].insumos.map((i) => i.insumoId)).toEqual([INS_A, INS_B]);
  });

  it("cria um grupo por centro de custo, na ordem de aparição", () => {
    const grupos = agruparItensPorCentroCusto([
      { insumoId: INS_A, quantidade: 1, precoUnitario: 1, centroCustoId: CC_2 },
      { insumoId: INS_B, quantidade: 1, precoUnitario: 1, centroCustoId: CC_1 },
    ]);
    expect(grupos.map((g) => g.centroCustoId)).toEqual([CC_2, CC_1]);
  });

  it("converte quantidade/preço para string com vírgula", () => {
    const grupos = agruparItensPorCentroCusto([
      {
        insumoId: INS_A,
        quantidade: 1.5,
        precoUnitario: 1234.5,
        centroCustoId: CC_1,
      },
    ]);
    expect(grupos[0].insumos[0].quantidade).toBe("1,5");
    expect(grupos[0].insumos[0].precoUnitario).toBe("1234,5");
  });

  it("lista vazia vira nenhum grupo", () => {
    expect(agruparItensPorCentroCusto([])).toEqual([]);
  });
});

describe("achatarGruposEmItens", () => {
  it("achata herdando o centro de custo e coerindo os números", () => {
    const itens = achatarGruposEmItens([
      {
        centroCustoId: CC_1,
        insumos: [
          { insumoId: INS_A, quantidade: "10", precoUnitario: "32,50" },
          { insumoId: INS_B, quantidade: "5", precoUnitario: "80" },
        ],
      },
      {
        centroCustoId: CC_2,
        insumos: [
          { insumoId: INS_C, quantidade: "2,5", precoUnitario: "1.234,00" },
        ],
      },
    ]);
    expect(itens).toEqual([
      { insumoId: INS_A, quantidade: 10, precoUnitario: 32.5, centroCustoId: CC_1 },
      { insumoId: INS_B, quantidade: 5, precoUnitario: 80, centroCustoId: CC_1 },
      { insumoId: INS_C, quantidade: 2.5, precoUnitario: 1234, centroCustoId: CC_2 },
    ]);
  });
});

describe("round-trip achatar(agrupar(itens))", () => {
  it("preserva cada tupla insumo/centro/quantidade/preço", () => {
    const itens: ItemPlano[] = [
      { insumoId: INS_A, quantidade: 10, precoUnitario: 32.5, centroCustoId: CC_1 },
      { insumoId: INS_B, quantidade: 5, precoUnitario: 80, centroCustoId: CC_1 },
      { insumoId: INS_C, quantidade: 2, precoUnitario: 3.5, centroCustoId: CC_2 },
    ];
    expect(achatarGruposEmItens(agruparItensPorCentroCusto(itens))).toEqual(itens);
  });
});
