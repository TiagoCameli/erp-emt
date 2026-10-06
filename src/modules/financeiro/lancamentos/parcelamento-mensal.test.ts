import { describe, expect, it } from "vitest";

import {
  MAX_PARCELAS_MENSAIS,
  gerarParcelasMensais,
  quantidadeValida,
  somarMesesNoDia,
} from "@/modules/financeiro/lancamentos/parcelamento-mensal";

/** Soma em centavos, para o teste não mentir com ponto flutuante. */
function somaEmCentavos(valores: number[]): number {
  return valores.reduce((total, valor) => total + Math.round(valor * 100), 0);
}

describe("somarMesesNoDia", () => {
  it("mantém o dia nos meses que o têm", () => {
    expect(somarMesesNoDia("2026-12-25", 0)).toBe("2026-12-25");
    expect(somarMesesNoDia("2026-12-25", 1)).toBe("2027-01-25");
    expect(somarMesesNoDia("2026-12-25", 14)).toBe("2028-02-25");
  });

  it("encosta no fim do mês curto e volta ao dia original depois", () => {
    expect(somarMesesNoDia("2027-01-31", 1)).toBe("2027-02-28");
    expect(somarMesesNoDia("2027-01-31", 2)).toBe("2027-03-31");
    expect(somarMesesNoDia("2027-01-31", 13)).toBe("2028-02-29");
  });
});

describe("gerarParcelasMensais", () => {
  it("o consórcio do print: 92.208 em 80 meses a partir de 25/12/2026", () => {
    const parcelas = gerarParcelasMensais(92208, 80, "2026-12-25");

    expect(parcelas).toHaveLength(80);
    expect(parcelas[0]).toEqual({ valor: 1152.6, dataVencimento: "2026-12-25" });
    expect(parcelas[79]?.dataVencimento).toBe("2033-07-25");
    expect(somaEmCentavos(parcelas.map((p) => p.valor))).toBe(9220800);
  });

  it("a sobra de centavos vai na última parcela", () => {
    const parcelas = gerarParcelasMensais(100, 3, "2026-10-06");

    expect(parcelas.map((p) => p.valor)).toEqual([33.33, 33.33, 33.34]);
  });

  it("recusa quantidade que não é parcelamento ou passa do teto", () => {
    expect(gerarParcelasMensais(1000, 1, "2026-10-06")).toEqual([]);
    expect(gerarParcelasMensais(1000, 2.5, "2026-10-06")).toEqual([]);
    expect(
      gerarParcelasMensais(100000, MAX_PARCELAS_MENSAIS + 1, "2026-10-06"),
    ).toEqual([]);
  });

  it("recusa parcela de zero centavo e data inválida", () => {
    expect(quantidadeValida(0.05, 6)).toBe(false);
    expect(gerarParcelasMensais(0, 3, "2026-10-06")).toEqual([]);
    expect(gerarParcelasMensais(300, 3, "")).toEqual([]);
  });
});
