import { describe, expect, it } from "vitest";

import {
  dividirValor,
  erroDoRateio,
  formatarPercentual,
  somaPercentual,
} from "./rateio";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";

describe("dividirValor", () => {
  it("uma obra leva tudo", () => {
    expect(dividirValor(975, [{ centroCustoId: A, percentual: 100 }])).toEqual([
      975,
    ]);
  });

  it("caso real do Edivaldo: 7/11 e 4/11 de 3.850", () => {
    expect(
      dividirValor(3850, [
        { centroCustoId: A, percentual: 63.6364 },
        { centroCustoId: B, percentual: 36.3636 },
      ]),
    ).toEqual([2450, 1400]);
  });

  it("terços: o centavo que sobra vai para a linha de maior percentual", () => {
    // Mesma conta da prova do banco (U2): 33,34 + 33,33 + 33,33.
    expect(
      dividirValor(100, [
        { centroCustoId: B, percentual: 33.3333 },
        { centroCustoId: A, percentual: 33.3334 },
        { centroCustoId: C, percentual: 33.3333 },
      ]),
    ).toEqual([33.33, 33.34, 33.33]);
  });

  it("empate de percentual: o centavo vai para o menor id, como no banco", () => {
    const valores = dividirValor(0.01, [
      { centroCustoId: B, percentual: 50 },
      { centroCustoId: A, percentual: 50 },
    ]);
    // 0,005 arredonda para 0,01 nas duas; a soma passa 1 centavo e o ajuste
    // sai do menor id.
    expect(valores).toEqual([0.01, 0]);
    expect(valores.reduce((s, v) => s + v, 0)).toBe(0.01);
  });

  it("70/30 de 300", () => {
    expect(
      dividirValor(300, [
        { centroCustoId: A, percentual: 70 },
        { centroCustoId: B, percentual: 30 },
      ]),
    ).toEqual([210, 90]);
  });
});

describe("erroDoRateio", () => {
  it("rateio certo", () => {
    expect(
      erroDoRateio([
        { centroCustoId: A, percentual: 33.3334 },
        { centroCustoId: B, percentual: 33.3333 },
        { centroCustoId: C, percentual: 33.3333 },
      ]),
    ).toBeNull();
  });

  it("sem obra", () => {
    expect(erroDoRateio([])).toBe("Escolha a obra da diária");
    expect(erroDoRateio([{ centroCustoId: "", percentual: 100 }])).toBe(
      "Escolha a obra de cada linha",
    );
  });

  it("soma diferente de 100 diz quanto está somando", () => {
    expect(
      erroDoRateio([
        { centroCustoId: A, percentual: 60 },
        { centroCustoId: B, percentual: 30 },
      ]),
    ).toBe("O rateio tem que somar 100% (está somando 90%)");
  });

  it("obra repetida", () => {
    expect(
      erroDoRateio([
        { centroCustoId: A, percentual: 50 },
        { centroCustoId: A, percentual: 50 },
      ]),
    ).toBe("A mesma obra aparece em duas linhas");
  });

  it("zero, acima de 100 e 5 casas", () => {
    for (const percentual of [0, 100.0001, 50.00001]) {
      expect(erroDoRateio([{ centroCustoId: A, percentual }])).toBe(
        "Percentual maior que zero, até 100 e com até 4 casas",
      );
    }
  });
});

it("somaPercentual não sofre com ponto flutuante", () => {
  expect(
    somaPercentual([
      { percentual: 33.3334 },
      { percentual: 33.3333 },
      { percentual: 33.3333 },
    ]),
  ).toBe(100);
  expect(somaPercentual([{ percentual: 0.1 }, { percentual: 0.2 }])).toBe(0.3);
});

it("formatarPercentual", () => {
  expect(formatarPercentual(63.6364)).toBe("63,6364%");
  expect(formatarPercentual(100)).toBe("100%");
  expect(formatarPercentual(33.5)).toBe("33,5%");
});
