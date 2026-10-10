import { describe, expect, it } from "vitest";

import { lerNumeroColado } from "@/modules/execucao/_shared/numero";

describe("lerNumeroColado", () => {
  it.each([
    ["", null],
    ["  ", null],
    ["12", "12"],
    ["12,5", "12.5"],
    ["1.234,5", "1234.5"],
    ["1.234.567,891", "1234567.891"],
    ["12.5", "12.5"],
    ["0,0001", "0.0001"],
    ["-3", "-3"],
  ])("%j vira %j", (texto, esperado) => {
    expect(lerNumeroColado(texto)).toEqual({ ok: true, valor: esperado });
  });

  it("1.234 sem vírgula é ambíguo (mil ou um e pouco) e vira erro", () => {
    expect(lerNumeroColado("1.234")).toEqual({ ok: false, erro: "Número ambíguo: 1.234. Use vírgula para decimal (1,234) ou tire o ponto (1234)" });
  });

  it("mais casas que o permitido vira erro, nunca arredonda escondido", () => {
    expect(lerNumeroColado("1,23456")).toEqual({ ok: false, erro: "No máximo 4 casas decimais: 1,23456" });
  });

  it("texto que não é número vira erro", () => {
    expect(lerNumeroColado("abc")).toEqual({ ok: false, erro: "Não é número: abc" });
  });
});
