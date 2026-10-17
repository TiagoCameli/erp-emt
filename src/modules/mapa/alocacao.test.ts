import { describe, expect, it } from "vitest";

import {
  itemParaRpc,
  maquinaRepetida,
  montarLote,
} from "@/modules/mapa/alocacao";
import { alocarSchema } from "@/modules/mapa/schemas";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const M1 = "33333333-3333-4333-8333-333333333333";
const C1 = "44444444-4444-4444-8444-444444444444";

describe("itemParaRpc", () => {
  it("campo ausente não vai, null vai como null", () => {
    expect(itemParaRpc({ colaboradorId: P1, equipamentoId: null })).toEqual({
      colaborador_id: P1,
      equipamento_id: null,
    });
    const saida = itemParaRpc({ colaboradorId: P1, centroCustoId: C1 });
    expect(saida).toEqual({ colaborador_id: P1, centro_custo_id: C1 });
    expect("equipamento_id" in saida).toBe(false);
  });

  it("o null sobrevive ao JSON (é ele que limpa no banco)", () => {
    const json = JSON.parse(
      JSON.stringify(itemParaRpc({ colaboradorId: P1, localidadeId: null })),
    );
    expect(json).toEqual({ colaborador_id: P1, localidade_id: null });
  });
});

describe("montarLote", () => {
  it("junta as edições da mesma pessoa; a última vence no mesmo campo", () => {
    expect(
      montarLote([
        { colaboradorId: P1, equipamentoId: M1 },
        { colaboradorId: P2, centroCustoId: C1 },
        { colaboradorId: P1, centroCustoId: C1 },
        { colaboradorId: P1, equipamentoId: null },
      ]),
    ).toEqual([
      { colaboradorId: P1, equipamentoId: null, centroCustoId: C1 },
      { colaboradorId: P2, centroCustoId: C1 },
    ]);
  });

  it("edição sem campo some, e undefined não apaga o que veio antes", () => {
    expect(
      montarLote([
        { colaboradorId: P1, equipamentoId: M1 },
        { colaboradorId: P1, equipamentoId: undefined },
        { colaboradorId: P2 },
      ]),
    ).toEqual([{ colaboradorId: P1, equipamentoId: M1 }]);
  });
});

describe("maquinaRepetida", () => {
  it("acha a máquina posta em duas pessoas e ignora null", () => {
    expect(
      maquinaRepetida([
        { colaboradorId: P1, equipamentoId: null },
        { colaboradorId: P2, equipamentoId: null },
      ]),
    ).toBeNull();
    expect(
      maquinaRepetida([
        { colaboradorId: P1, equipamentoId: M1 },
        { colaboradorId: P2, equipamentoId: M1 },
      ]),
    ).toBe(M1);
  });
});

describe("alocarSchema", () => {
  it("recusa lote vazio e campo desconhecido", () => {
    expect(alocarSchema.safeParse({ itens: [] }).success).toBe(false);
    expect(
      alocarSchema.safeParse({ itens: [{ colaboradorId: P1, frenteId: M1 }] })
        .success,
    ).toBe(false);
  });

  it("aceita null explícito para limpar", () => {
    const r = alocarSchema.safeParse({
      itens: [{ colaboradorId: P1, equipamentoId: null, centroCustoId: null }],
    });
    expect(r.success).toBe(true);
  });
});
