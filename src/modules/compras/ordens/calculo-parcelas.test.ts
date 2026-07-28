import { describe, expect, it } from "vitest";

import {
  diferencaParaTotal,
  indicesVencimentoAntesDaEmissao,
  redistribuirProporcional,
  somarParcelas,
  temDataVazia,
  temValorInvalido,
  type ParcelaForm,
} from "./calculo-parcelas";

function parcela(dataVencimento: string, valor: string): ParcelaForm {
  return { dataVencimento, valor };
}

describe("somarParcelas", () => {
  it("soma em centavos, sem erro de ponto flutuante", () => {
    expect(somarParcelas([parcela("2026-08-01", "0,10"), parcela("2026-09-01", "0,20")])).toBe(0.3);
    expect(
      somarParcelas([
        parcela("2026-08-01", "33,33"),
        parcela("2026-09-01", "33,33"),
        parcela("2026-10-01", "33,34"),
      ]),
    ).toBe(100);
  });

  it("lista vazia soma zero e texto inválido conta zero", () => {
    expect(somarParcelas([])).toBe(0);
    expect(somarParcelas([parcela("2026-08-01", ""), parcela("2026-09-01", "abc")])).toBe(0);
  });
});

describe("diferencaParaTotal", () => {
  it("mostra o que falta e o que sobra", () => {
    const tres = [
      parcela("2026-08-01", "500,00"),
      parcela("2026-09-01", "500,00"),
    ];
    expect(diferencaParaTotal(tres, 1012)).toBe(12);
    expect(diferencaParaTotal(tres, 988)).toBe(-12);
    expect(diferencaParaTotal(tres, 1000)).toBe(0);
  });

  it("não inventa centavo em valor quebrado", () => {
    const parcelas = [parcela("2026-08-01", "33,33"), parcela("2026-09-01", "33,33")];
    expect(diferencaParaTotal(parcelas, 100)).toBe(33.34);
  });
});

describe("redistribuirProporcional", () => {
  it("mantém a proporção e joga a sobra na última", () => {
    const parcelas = [
      parcela("2026-08-01", "33,33"),
      parcela("2026-09-01", "33,33"),
      parcela("2026-10-01", "33,34"),
    ];
    const novas = redistribuirProporcional(parcelas, 200);
    expect(novas.map((p) => p.valor)).toEqual(["66,66", "66,66", "66,68"]);
    expect(somarParcelas(novas)).toBe(200);
  });

  it("preserva proporção desigual", () => {
    const parcelas = [
      parcela("2026-08-01", "800,00"),
      parcela("2026-09-01", "200,00"),
    ];
    const novas = redistribuirProporcional(parcelas, 500);
    expect(novas.map((p) => p.valor)).toEqual(["400,00", "100,00"]);
    expect(somarParcelas(novas)).toBe(500);
  });

  it("divide igual quando ainda não há valor digitado", () => {
    const parcelas = [
      parcela("2026-08-01", ""),
      parcela("2026-09-01", ""),
      parcela("2026-10-01", ""),
    ];
    const novas = redistribuirProporcional(parcelas, 100);
    expect(novas.map((p) => p.valor)).toEqual(["33,33", "33,33", "33,34"]);
    expect(somarParcelas(novas)).toBe(100);
  });

  it("mantém as datas intactas", () => {
    const parcelas = [parcela("2026-08-15", "10,00"), parcela("2026-09-15", "10,00")];
    expect(redistribuirProporcional(parcelas, 50).map((p) => p.dataVencimento)).toEqual([
      "2026-08-15",
      "2026-09-15",
    ]);
  });

  it("sempre fecha com o total, em vários valores quebrados", () => {
    const parcelas = [
      parcela("2026-08-01", "10,00"),
      parcela("2026-09-01", "10,00"),
      parcela("2026-10-01", "10,00"),
    ];
    for (const total of [0.01, 1, 33.33, 100.01, 1136.33, 8843.7, 99999.99]) {
      expect(somarParcelas(redistribuirProporcional(parcelas, total))).toBe(total);
    }
  });

  it("lista vazia e total zerado não explodem", () => {
    expect(redistribuirProporcional([], 100)).toEqual([]);
    expect(
      redistribuirProporcional([parcela("2026-08-01", "10,00")], 0).map((p) => p.valor),
    ).toEqual(["0,00"]);
  });
});

describe("validações da tela", () => {
  it("acha data vazia", () => {
    expect(temDataVazia([parcela("2026-08-01", "1,00")])).toBe(false);
    expect(temDataVazia([parcela("", "1,00")])).toBe(true);
    expect(temDataVazia([parcela("   ", "1,00")])).toBe(true);
  });

  it("acha valor não positivo", () => {
    expect(temValorInvalido([parcela("2026-08-01", "1,00")])).toBe(false);
    expect(temValorInvalido([parcela("2026-08-01", "0")])).toBe(true);
    expect(temValorInvalido([parcela("2026-08-01", "")])).toBe(true);
  });

  it("acha vencimento antes da emissão pelo índice", () => {
    const parcelas = [
      parcela("2026-07-01", "1,00"),
      parcela("2026-08-01", "1,00"),
      parcela("2026-06-30", "1,00"),
    ];
    expect(indicesVencimentoAntesDaEmissao(parcelas, "2026-07-20")).toEqual([0, 2]);
    expect(indicesVencimentoAntesDaEmissao(parcelas, "2026-01-01")).toEqual([]);
    expect(indicesVencimentoAntesDaEmissao(parcelas, "")).toEqual([]);
  });

  it("mesmo dia da emissão é válido", () => {
    expect(
      indicesVencimentoAntesDaEmissao([parcela("2026-07-20", "1,00")], "2026-07-20"),
    ).toEqual([]);
  });
});
