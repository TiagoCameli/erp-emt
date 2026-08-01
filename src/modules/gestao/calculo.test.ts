import { describe, expect, it } from "vitest";

import {
  agregarPorPrazo,
  classificarPrazo,
  diasAte,
  janelaPainel,
  participacao,
  rotuloMesCurto,
  serieMensal,
  somarMeses,
  variacaoPercentual,
} from "./calculo";

describe("somarMeses", () => {
  it("anda para frente e para trás virando o ano", () => {
    expect(somarMeses("2026-08-01", 1)).toBe("2026-09-01");
    expect(somarMeses("2026-12-01", 1)).toBe("2027-01-01");
    expect(somarMeses("2026-01-01", -1)).toBe("2025-12-01");
    expect(somarMeses("2026-08-01", -5)).toBe("2026-03-01");
    expect(somarMeses("2026-08-01", 0)).toBe("2026-08-01");
  });
});

describe("janelaPainel", () => {
  it("termina no mês corrente e abre o limite no mês seguinte", () => {
    const janela = janelaPainel("2026-08", 6);
    expect(janela.meses).toEqual([
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
    ]);
    expect(janela.inicio).toBe("2026-03-01");
    expect(janela.fim).toBe("2026-09-01");
  });

  it("nunca devolve janela vazia", () => {
    expect(janelaPainel("2026-08", 0).meses).toEqual(["2026-08-01"]);
  });
});

describe("rotuloMesCurto", () => {
  it("abrevia a competência", () => {
    expect(rotuloMesCurto("2026-01-01")).toBe("jan/26");
    expect(rotuloMesCurto("2026-12-01")).toBe("dez/26");
  });
});

describe("serieMensal", () => {
  const meses = ["2026-06-01", "2026-07-01", "2026-08-01"];

  it("preenche com zero o mês sem custo", () => {
    const serie = serieMensal(
      [{ mes: "2026-07-01", total: "3600.00", lancamentos: 1 }],
      meses,
    );
    expect(serie.map((p) => p.valor)).toEqual([0, 3600, 0]);
    expect(serie.map((p) => p.lancamentos)).toEqual([0, 1, 0]);
    expect(serie[2].rotulo).toBe("ago/26");
  });

  it("descarta linha fora da janela", () => {
    const serie = serieMensal(
      [
        { mes: "2026-09-01", total: 999, lancamentos: 1 },
        { mes: "2026-06-01", total: 100, lancamentos: 1 },
      ],
      meses,
    );
    expect(serie.map((p) => p.valor)).toEqual([100, 0, 0]);
  });

  it("soma em centavos, sem erro de float", () => {
    const serie = serieMensal(
      [
        { mes: "2026-06-01", total: "0.10", lancamentos: 1 },
        { mes: "2026-06-01", total: "0.20", lancamentos: 1 },
      ],
      meses,
    );
    expect(serie[0].valor).toBe(0.3);
    expect(serie[0].lancamentos).toBe(2);
  });
});

describe("variacaoPercentual", () => {
  it("compara com o mês anterior", () => {
    expect(variacaoPercentual(150, 100)).toBe(50);
    expect(variacaoPercentual(50, 100)).toBe(-50);
  });

  it("devolve null sem base de comparação", () => {
    expect(variacaoPercentual(100, 0)).toBeNull();
  });
});

describe("diasAte e classificarPrazo", () => {
  it("conta os dias nos dois sentidos", () => {
    expect(diasAte("2026-08-08", "2026-08-01")).toBe(7);
    expect(diasAte("2026-07-30", "2026-08-01")).toBe(-2);
    expect(diasAte("2026-08-01", "2026-08-01")).toBe(0);
  });

  it("põe a borda na faixa de baixo e o que vence hoje em até 7 dias", () => {
    expect(classificarPrazo(-1)).toBe("vencido");
    expect(classificarPrazo(0)).toBe("ate_7");
    expect(classificarPrazo(7)).toBe("ate_7");
    expect(classificarPrazo(8)).toBe("d_8_15");
    expect(classificarPrazo(15)).toBe("d_8_15");
    expect(classificarPrazo(16)).toBe("d_16_30");
    expect(classificarPrazo(30)).toBe("d_16_30");
    expect(classificarPrazo(31)).toBe("d_31_60");
    expect(classificarPrazo(60)).toBe("d_31_60");
    expect(classificarPrazo(61)).toBe("acima_60");
  });
});

describe("agregarPorPrazo", () => {
  it("devolve as seis faixas na ordem, com zero onde não há parcela", () => {
    const faixas = agregarPorPrazo(
      [{ valor: "1199.88", dataVencimento: "2026-08-14" }],
      "2026-08-01",
    );
    expect(faixas.map((f) => f.faixa)).toEqual([
      "vencido",
      "ate_7",
      "d_8_15",
      "d_16_30",
      "d_31_60",
      "acima_60",
    ]);
    expect(faixas[2].valor).toBe(1199.88);
    expect(faixas[0].valor).toBe(0);
  });

  it("soma parcelas da mesma faixa em centavos", () => {
    const faixas = agregarPorPrazo(
      [
        { valor: "1199.88", dataVencimento: "2026-08-14" },
        { valor: "0.12", dataVencimento: "2026-08-10" },
      ],
      "2026-08-01",
    );
    expect(faixas[2].valor).toBe(1200);
  });

  it("só mostra 'sem vencimento' quando existe parcela sem data", () => {
    const semData = agregarPorPrazo(
      [{ valor: 500, dataVencimento: null }],
      "2026-08-01",
    );
    expect(semData).toHaveLength(7);
    expect(semData[6]).toMatchObject({ faixa: "sem_data", valor: 500 });

    const comData = agregarPorPrazo(
      [{ valor: 500, dataVencimento: "2026-08-02" }],
      "2026-08-01",
    );
    expect(comData).toHaveLength(6);
  });
});

describe("participacao", () => {
  it("não divide por zero", () => {
    expect(participacao(10, 0)).toBe(0);
    expect(participacao(25, 100)).toBe(25);
  });
});
