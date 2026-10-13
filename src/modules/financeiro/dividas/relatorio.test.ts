import { describe, expect, it } from "vitest";

import { filtrarContratosPorStatus } from "@/modules/financeiro/dividas/relatorio";

describe("filtrarContratosPorStatus", () => {
  const contratos = [
    { numero: "a", status: "ativo" },
    { numero: "q", status: "quitado" },
    { numero: "r", status: "renegociado" },
  ];
  const numeros = (lista: { numero: string }[]) => lista.map((c) => c.numero);

  it("ativos traz o ativo e o renegociado (ainda há o que pagar)", () => {
    expect(numeros(filtrarContratosPorStatus(contratos, "ativos"))).toEqual(["a", "r"]);
  });

  it("quitados traz só o quitado; todos traz a lista inteira", () => {
    expect(numeros(filtrarContratosPorStatus(contratos, "quitados"))).toEqual(["q"]);
    expect(numeros(filtrarContratosPorStatus(contratos, "todos"))).toEqual(["a", "q", "r"]);
  });
});
