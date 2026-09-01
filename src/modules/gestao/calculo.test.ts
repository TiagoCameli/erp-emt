import { describe, expect, it } from "vitest";

import {
  agregarPorPrazo,
  janelaPainel,
  participacao,
  resultadoDoPeriodo,
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

describe("agregarPorPrazo", () => {
  // A faixa chega classificada do banco (fn_rel_aging.faixa_prazo): o que se
  // testa aqui é a montagem da lista, não mais o cálculo de dias.
  it("devolve as seis faixas na ordem, com zero onde não há parcela", () => {
    const faixas = agregarPorPrazo([{ faixa: "d_8_15", valor: "1199.88" }]);
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

  it("soma linhas da mesma faixa em centavos", () => {
    const faixas = agregarPorPrazo([
      { faixa: "d_8_15", valor: "1199.88" },
      { faixa: "d_8_15", valor: "0.12" },
    ]);
    expect(faixas[2].valor).toBe(1200);
  });

  it("só mostra 'sem vencimento' quando existe parcela sem data", () => {
    const semData = agregarPorPrazo([{ faixa: "sem_data", valor: 500 }]);
    expect(semData).toHaveLength(7);
    expect(semData[6]).toMatchObject({ faixa: "sem_data", valor: 500 });

    const comData = agregarPorPrazo([{ faixa: "ate_7", valor: 500 }]);
    expect(comData).toHaveLength(6);
  });

  it("falha alto se o banco mandar faixa que o TypeScript não conhece", () => {
    // Descartar ou somar na faixa errada seria dinheiro sumindo calado, que é
    // o defeito que a agregação no banco veio consertar.
    expect(() => agregarPorPrazo([{ faixa: "d_61_90", valor: 500 }])).toThrow(
      /Faixa de prazo desconhecida/,
    );
  });
});

describe("participacao", () => {
  it("não divide por zero", () => {
    expect(participacao(10, 0)).toBe(0);
    expect(participacao(25, 100)).toBe(25);
  });
});

/**
 * O resultado do período junta duas séries que vêm de funções diferentes do
 * banco. Errar a junção é mostrar margem inventada na primeira tela depois do
 * login.
 */
describe("resultadoDoPeriodo", () => {
  const MESES = ["2026-06-01", "2026-07-01", "2026-08-01"];

  function mapa(entradas: [string, number][]): Map<string, number> {
    return new Map(entradas);
  }

  it("fecha receita, despesa e resultado do período", () => {
    const r = resultadoDoPeriodo(
      MESES,
      mapa([
        ["2026-06-01", 1000],
        ["2026-07-01", 2000],
        ["2026-08-01", 500],
      ]),
      mapa([
        ["2026-06-01", 400],
        ["2026-07-01", 2500],
        ["2026-08-01", 100],
      ]),
    );

    expect(r.receita).toBe(3500);
    expect(r.despesa).toBe(3000);
    expect(r.resultado).toBe(500);
    expect(r.meses.map((m) => m.resultado)).toEqual([600, -500, 400]);
  });

  /**
   * A janela manda no eixo. Um gráfico que pula de junho para agosto faz o
   * buraco parecer dado, e a tabela ao lado ficaria com uma coluna a menos que o
   * período escolhido na barra de filtros.
   */
  it("mês sem lançamento entra zerado, em vez de sumir", () => {
    const r = resultadoDoPeriodo(MESES, mapa([["2026-07-01", 900]]), mapa([]));

    expect(r.meses).toHaveLength(3);
    expect(r.meses[0]).toMatchObject({ mes: "2026-06-01", receita: 0, despesa: 0 });
  });

  it("mês sem NADA lançado não conta como mês negativo", () => {
    // Contá-lo faria o rodapé dizer "dois meses negativos" numa janela em que
    // dois meses nem começaram.
    const r = resultadoDoPeriodo(
      MESES,
      mapa([["2026-06-01", 100]]),
      mapa([["2026-06-01", 300]]),
    );

    expect(r.positivos).toBe(0);
    expect(r.negativos).toBe(1);
    expect(r.pior?.mes).toBe("2026-06-01");
  });

  it("sem receita, a margem é nula em vez de dividir por zero", () => {
    const r = resultadoDoPeriodo(MESES, mapa([]), mapa([["2026-06-01", 700]]));

    expect(r.margem).toBeNull();
    expect(r.resultado).toBe(-700);
  });

  it("margem é o resultado sobre a receita, em percentual", () => {
    const r = resultadoDoPeriodo(
      MESES,
      mapa([["2026-06-01", 1000]]),
      mapa([["2026-06-01", 750]]),
    );

    expect(r.margem).toBeCloseTo(25, 10);
  });

  it("período inteiro vazio não tem pior mês", () => {
    const r = resultadoDoPeriodo(MESES, mapa([]), mapa([]));

    expect(r.pior).toBeNull();
    expect(r.positivos).toBe(0);
    expect(r.negativos).toBe(0);
    expect(r.margem).toBeNull();
  });

  it("empate no pior mês fica com o primeiro, para a frase não trocar sozinha", () => {
    const r = resultadoDoPeriodo(
      MESES,
      mapa([
        ["2026-06-01", 0],
        ["2026-07-01", 0],
      ]),
      mapa([
        ["2026-06-01", 500],
        ["2026-07-01", 500],
      ]),
    );

    expect(r.pior?.mes).toBe("2026-06-01");
  });
});
