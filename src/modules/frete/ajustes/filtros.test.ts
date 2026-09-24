import { describe, expect, it } from "vitest";

import { lerFiltrosAjustes, limitesDoPeriodo, rotaDosAjustes } from "@/modules/frete/ajustes/filtros";

const ID = "11111111-1111-4111-8111-111111111111";

describe("filtros da lista de ajustes", () => {
  it("lê os válidos e ignora o resto", () => {
    expect(lerFiltrosAjustes({ transportadora: ID, status: "aprovado", sinal: "debito", de: "2026-09-01", ate: "2026-09-30" })).toEqual({
      transportadoraId: ID,
      status: "aprovado",
      sinal: "debito",
      de: "2026-09-01",
      ate: "2026-09-30",
    });
    expect(lerFiltrosAjustes({ transportadora: "x", status: "pago", sinal: "zero", de: "01/09/2026" })).toEqual({
      transportadoraId: undefined,
      status: undefined,
      sinal: undefined,
      de: undefined,
      ate: undefined,
    });
  });

  it("link dos pendentes da transportadora", () => {
    expect(rotaDosAjustes({ transportadoraId: ID, status: "pendente_aprovacao" })).toBe(
      `/frete/ajustes?transportadora=${ID}&status=pendente_aprovacao`,
    );
    expect(rotaDosAjustes({})).toBe("/frete/ajustes");
  });

  it("período em instante de Rio Branco (UTC-5), fim exclusivo no dia seguinte", () => {
    expect(limitesDoPeriodo({ de: "2026-09-01", ate: "2026-09-30" })).toEqual({
      desde: "2026-09-01T05:00:00.000Z",
      antes: "2026-10-01T05:00:00.000Z",
    });
  });
});
