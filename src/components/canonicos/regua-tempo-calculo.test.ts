import { describe, expect, it } from "vitest";

import {
  ancoraInicial,
  blocosDaJanela,
  blocosNoPeriodo,
  ehDataISO,
  granularidadeDoPeriodo,
  mostraRotulo,
  inicioDaJanela,
  intervaloEntre,
  janelaVizinha,
  resumoDoPeriodo,
  tituloDaJanela,
  type BlocoDaRegua,
} from "@/components/canonicos/regua-tempo-calculo";

/** Atalho: o bloco de índice `i` da janela. */
function bloco(
  inicioJanela: string,
  granularidade: Parameters<typeof blocosDaJanela>[1],
  i: number,
): BlocoDaRegua {
  return blocosDaJanela(inicioJanela, granularidade)[i]!;
}

describe("ehDataISO", () => {
  it("aceita data que existe", () => {
    expect(ehDataISO("2026-08-31")).toBe(true);
    expect(ehDataISO("2024-02-29")).toBe(true); // bissexto
  });

  it("recusa data que NÃO existe, mesmo bem escrita", () => {
    // `new Date(Date.UTC(2026, 1, 31))` devolve 03/03 calado. Sem a volta pela
    // formatação, 31/02 entraria na régua e sairia como março.
    expect(ehDataISO("2026-02-31")).toBe(false);
    expect(ehDataISO("2025-02-29")).toBe(false);
    expect(ehDataISO("2026-13-01")).toBe(false);
  });

  it("recusa formato errado", () => {
    expect(ehDataISO("2026-8-1")).toBe(false);
    expect(ehDataISO("31/08/2026")).toBe(false);
    expect(ehDataISO("")).toBe(false);
  });
});

describe("blocosDaJanela", () => {
  describe("meses", () => {
    const blocos = blocosDaJanela("2026-01-01", "mes");

    it("dá os 12 meses do ano, do dia 1 ao último", () => {
      expect(blocos).toHaveLength(12);
      expect(blocos[0]).toMatchObject({
        inicio: "2026-01-01",
        fim: "2026-01-31",
        rotulo: "JAN",
      });
      expect(blocos[11]).toMatchObject({
        inicio: "2026-12-01",
        fim: "2026-12-31",
        rotulo: "DEZ",
      });
    });

    it("fevereiro conhece o ano bissexto", () => {
      expect(blocosDaJanela("2024-01-01", "mes")[1]!.fim).toBe("2024-02-29");
      expect(blocosDaJanela("2026-01-01", "mes")[1]!.fim).toBe("2026-02-28");
    });

    it("os blocos são contíguos: o fim de um encosta no início do seguinte", () => {
      // Buraco entre blocos seria período que a régua não consegue selecionar.
      for (let i = 1; i < blocos.length; i += 1) {
        const anterior = new Date(
          Date.parse(`${blocos[i - 1]!.fim}T00:00:00Z`),
        );
        const seguinte = new Date(Date.parse(`${blocos[i]!.inicio}T00:00:00Z`));
        expect(seguinte.getTime() - anterior.getTime()).toBe(86400000);
      }
    });
  });

  describe("dias", () => {
    it("dá os dias do mês, e só eles", () => {
      const blocos = blocosDaJanela("2026-08-01", "dia");
      expect(blocos).toHaveLength(31);
      expect(blocos[0]).toMatchObject({
        inicio: "2026-08-01",
        fim: "2026-08-01",
        rotulo: "1",
      });
      expect(blocos[30]).toMatchObject({
        inicio: "2026-08-31",
        fim: "2026-08-31",
      });
    });

    it("fevereiro tem 28 ou 29", () => {
      expect(blocosDaJanela("2026-02-01", "dia")).toHaveLength(28);
      expect(blocosDaJanela("2024-02-01", "dia")).toHaveLength(29);
    });
  });

  describe("trimestres", () => {
    const blocos = blocosDaJanela("2026-01-01", "trimestre");

    it("dá 8 trimestres, cobrindo dois anos", () => {
      expect(blocos).toHaveLength(8);
      expect(blocos[0]).toMatchObject({
        inicio: "2026-01-01",
        fim: "2026-03-31",
        rotulo: "1º tri",
      });
      expect(blocos[3]).toMatchObject({
        inicio: "2026-10-01",
        fim: "2026-12-31",
      });
      expect(blocos[4]).toMatchObject({
        inicio: "2027-01-01",
        rotulo: "1º tri",
      });
      expect(blocos[7]!.fim).toBe("2027-12-31");
    });

    it("a descrição diz o ano, senão dois '1º tri' na mesma régua são iguais", () => {
      expect(blocos[0]!.descricao).toBe("1º trimestre de 2026");
      expect(blocos[4]!.descricao).toBe("1º trimestre de 2027");
    });
  });

  describe("semanas", () => {
    it("começa na segunda e cobre o mês inteiro, inclusive as bordas", () => {
      // 01/08/2026 é um sábado: a primeira semana do mês começa em 27/07.
      const blocos = blocosDaJanela("2026-08-01", "semana");
      expect(blocos[0]!.inicio).toBe("2026-07-27");
      expect(blocos[0]!.fim).toBe("2026-08-02");
      // A última semana tem que ALCANÇAR o dia 31.
      expect(blocos[blocos.length - 1]!.fim >= "2026-08-31").toBe(true);
    });

    it("toda semana tem 7 dias, sem cortar no dia 1", () => {
      // Cortar a semana no primeiro do mês criaria um bloco de dois dias que não
      // corresponde a pergunta nenhuma.
      for (const b of blocosDaJanela("2026-08-01", "semana")) {
        const dias =
          (Date.parse(`${b.fim}T00:00:00Z`) -
            Date.parse(`${b.inicio}T00:00:00Z`)) /
            86400000 +
          1;
        expect(dias).toBe(7);
      }
    });
  });

  describe("anos", () => {
    it("dá uma dúzia de anos", () => {
      const blocos = blocosDaJanela("2020-01-01", "ano");
      expect(blocos).toHaveLength(12);
      expect(blocos[0]).toMatchObject({
        inicio: "2020-01-01",
        fim: "2020-12-31",
        rotulo: "2020",
      });
      expect(blocos[11]!.rotulo).toBe("2031");
    });
  });
});

describe("inicioDaJanela e janelaVizinha", () => {
  it("em meses, a janela é o ano da data", () => {
    expect(inicioDaJanela("2026-08-17", "mes")).toBe("2026-01-01");
    expect(janelaVizinha("2026-01-01", "mes", 1)).toBe("2027-01-01");
    expect(janelaVizinha("2026-01-01", "mes", -1)).toBe("2025-01-01");
  });

  it("em dias e semanas, a janela é o mês da data", () => {
    expect(inicioDaJanela("2026-08-17", "dia")).toBe("2026-08-01");
    expect(inicioDaJanela("2026-08-17", "semana")).toBe("2026-08-01");
    expect(janelaVizinha("2026-12-01", "dia", 1)).toBe("2027-01-01");
    expect(janelaVizinha("2026-01-01", "dia", -1)).toBe("2025-12-01");
  });

  it("em anos, a dúzia é fixa, não centrada na data", () => {
    // Sem âncora fixa, entrar por 2026 e por 2027 mostraria faixas diferentes, e
    // o ◀ ▶ nunca voltaria para o mesmo lugar.
    expect(inicioDaJanela("2026-08-17", "ano")).toBe(
      inicioDaJanela("2027-01-01", "ano"),
    );
    expect(inicioDaJanela("2026-08-17", "ano")).toBe("2016-01-01");
    expect(janelaVizinha("2016-01-01", "ano", 1)).toBe("2028-01-01");
  });

  it("em trimestres, a janela é um par de anos ancorado em ano par", () => {
    expect(inicioDaJanela("2026-08-17", "trimestre")).toBe("2026-01-01");
    expect(inicioDaJanela("2027-08-17", "trimestre")).toBe("2026-01-01");
    expect(janelaVizinha("2026-01-01", "trimestre", 1)).toBe("2028-01-01");
  });

  it("CONTROLE: ir e voltar devolve a mesma janela", () => {
    for (const g of ["ano", "trimestre", "mes", "semana", "dia"] as const) {
      const inicio = inicioDaJanela("2026-08-17", g);
      expect(janelaVizinha(janelaVizinha(inicio, g, 1), g, -1)).toBe(inicio);
    }
  });
});

describe("tituloDaJanela", () => {
  it("diz o que a régua está mostrando", () => {
    expect(tituloDaJanela("2026-01-01", "mes")).toBe("2026");
    expect(tituloDaJanela("2026-08-01", "dia")).toBe("agosto de 2026");
    expect(tituloDaJanela("2026-08-01", "semana")).toBe("agosto de 2026");
    expect(tituloDaJanela("2026-01-01", "trimestre")).toBe("2026 e 2027");
    expect(tituloDaJanela("2016-01-01", "ano")).toBe("2016 a 2027");
  });
});

describe("intervaloEntre", () => {
  const jan = bloco("2026-01-01", "mes", 0);
  const ago = bloco("2026-01-01", "mes", 7);

  it("da esquerda para a direita", () => {
    expect(intervaloEntre(jan, ago)).toEqual({
      de: "2026-01-01",
      ate: "2026-08-31",
    });
  });

  it("da direita para a esquerda dá o MESMO período", () => {
    // Arrastar de trás para frente é tão natural quanto o contrário; sem
    // normalizar, o período sairia invertido e a lista voltaria vazia.
    expect(intervaloEntre(ago, jan)).toEqual({
      de: "2026-01-01",
      ate: "2026-08-31",
    });
  });

  it("um bloco só vira o período dele inteiro", () => {
    expect(intervaloEntre(ago, ago)).toEqual({
      de: "2026-08-01",
      ate: "2026-08-31",
    });
  });
});

describe("blocosNoPeriodo", () => {
  const meses = blocosDaJanela("2026-01-01", "mes");

  it("pinta os meses do período", () => {
    const pintados = blocosNoPeriodo(meses, "2026-01-01", "2026-08-31");
    expect(pintados.filter(Boolean)).toHaveLength(8);
    expect(pintados[7]).toBe(true);
    expect(pintados[8]).toBe(false);
  });

  it("pinta o mês que o período apenas ENCOSTA", () => {
    // 05/08 a 20/08 tem que pintar AGO na régua de meses: é isso que a pessoa
    // está olhando. Exigir o mês inteiro deixaria a régua apagada em todo filtro
    // de dias.
    const pintados = blocosNoPeriodo(meses, "2026-08-05", "2026-08-20");
    expect(pintados[7]).toBe(true);
    expect(pintados.filter(Boolean)).toHaveLength(1);
  });

  it("sem período, nada pintado", () => {
    expect(blocosNoPeriodo(meses, "", "").some(Boolean)).toBe(false);
  });

  it("ponta aberta pinta tudo do lado aberto", () => {
    expect(
      blocosNoPeriodo(meses, "2026-06-01", "").filter(Boolean),
    ).toHaveLength(7);
    expect(
      blocosNoPeriodo(meses, "", "2026-03-31").filter(Boolean),
    ).toHaveLength(3);
  });

  it("período de outro ano não pinta nada nesta janela", () => {
    expect(
      blocosNoPeriodo(meses, "2025-01-01", "2025-12-31").some(Boolean),
    ).toBe(false);
  });
});

describe("resumoDoPeriodo", () => {
  it("meses inteiros do mesmo ano viram 'jan - ago de 2026'", () => {
    expect(resumoDoPeriodo("2026-01-01", "2026-08-31")).toBe(
      "jan - ago de 2026",
    );
  });

  it("um mês inteiro tem nome próprio", () => {
    expect(resumoDoPeriodo("2026-08-01", "2026-08-31")).toBe("ago de 2026");
  });

  it("o ano inteiro vira só o ano", () => {
    expect(resumoDoPeriodo("2026-01-01", "2026-12-31")).toBe("2026");
  });

  it("atravessando o ano, diz os dois", () => {
    expect(resumoDoPeriodo("2025-11-01", "2026-02-28")).toBe(
      "nov de 2025 - fev de 2026",
    );
  });

  it("quando NÃO fecha em mês, cai nas datas", () => {
    // Dizer "ago de 2026" para 05/08 a 20/08 seria mentir sobre o corte.
    expect(resumoDoPeriodo("2026-08-05", "2026-08-20")).toBe(
      "05/08/2026 - 20/08/2026",
    );
  });

  it("um dia só aparece uma vez", () => {
    expect(resumoDoPeriodo("2026-08-17", "2026-08-17")).toBe("17/08/2026");
  });

  it("ponta aberta é dita como tal", () => {
    expect(resumoDoPeriodo("2026-08-01", "")).toBe("a partir de 01/08/2026");
    expect(resumoDoPeriodo("", "2026-08-31")).toBe("até 31/08/2026");
  });

  it("sem período, resumo vazio", () => {
    expect(resumoDoPeriodo("", "")).toBe("");
  });

  it("CONTROLE: 01/08 a 30/08 NÃO é 'ago', porque falta o dia 31", () => {
    // Se este caso passasse a dizer "ago de 2026", o resumo estaria arredondando
    // o corte para cima e escondendo um dia de lançamento.
    expect(resumoDoPeriodo("2026-08-01", "2026-08-30")).toBe(
      "01/08/2026 - 30/08/2026",
    );
  });
});

describe("ancoraInicial", () => {
  it("abre no período escolhido, não em hoje", () => {
    // Quem tem março filtrado precisa ver março ao abrir a régua.
    expect(ancoraInicial("2026-03-01", "2026-03-31", "2026-08-29")).toBe(
      "2026-03-01",
    );
  });

  it("com só a ponta final, abre nela", () => {
    expect(ancoraInicial("", "2026-03-31", "2026-08-29")).toBe("2026-03-31");
  });

  it("sem período, abre em hoje", () => {
    expect(ancoraInicial("", "", "2026-08-29")).toBe("2026-08-29");
  });

  it("data inválida na URL não leva a régua para 1970", () => {
    expect(ancoraInicial("banana", "", "2026-08-29")).toBe("2026-08-29");
  });
});

describe("granularidadeDoPeriodo", () => {
  describe("a borda manda, não a duração", () => {
    it("um mês inteiro é MÊS, mesmo tendo 31 dias", () => {
      // Julgar pelo tamanho fazia "agosto de 2026" reabrir na régua de dias, com
      // os 31 blocos pintados e nenhum mês à vista para trocar.
      expect(granularidadeDoPeriodo("2026-08-01", "2026-08-31")).toBe("mes");
      expect(granularidadeDoPeriodo("2026-02-01", "2026-02-28")).toBe("mes");
    });

    it("o ano inteiro é ANO", () => {
      expect(granularidadeDoPeriodo("2026-01-01", "2026-12-31")).toBe("ano");
    });

    it("jan a mar é TRIMESTRE; jan a abr é mês", () => {
      expect(granularidadeDoPeriodo("2026-01-01", "2026-03-31")).toBe(
        "trimestre",
      );
      expect(granularidadeDoPeriodo("2026-07-01", "2026-09-30")).toBe(
        "trimestre",
      );
      // Abril não fecha trimestre: quatro meses são meses.
      expect(granularidadeDoPeriodo("2026-01-01", "2026-04-30")).toBe("mes");
    });

    it("segunda a domingo é SEMANA, mesmo atravessando o mês", () => {
      // 27/07/2026 é segunda, 02/08 é domingo.
      expect(granularidadeDoPeriodo("2026-07-27", "2026-08-02")).toBe("semana");
    });

    it("CONTROLE: 01/08 a 30/08 NÃO fecha o mês, então cai na duração", () => {
      // Se este virasse "mes", a régua estaria arredondando um corte que o
      // usuário fez de propósito.
      expect(granularidadeDoPeriodo("2026-08-01", "2026-08-30")).toBe("dia");
    });
  });

  describe("sem borda redonda, decide pela duração", () => {
    it("um punhado de dias abre em dias", () => {
      expect(granularidadeDoPeriodo("2026-08-05", "2026-08-08")).toBe("dia");
    });

    it("dois meses quebrados abrem em semanas", () => {
      expect(granularidadeDoPeriodo("2026-08-05", "2026-09-20")).toBe("semana");
    });

    it("mais de um ano quebrado abre em trimestres", () => {
      expect(granularidadeDoPeriodo("2025-03-15", "2026-08-20")).toBe(
        "trimestre",
      );
    });

    it("vários anos abrem em anos", () => {
      expect(granularidadeDoPeriodo("2020-03-15", "2026-08-20")).toBe("ano");
    });
  });

  it("sem as duas pontas, não sugere nada", () => {
    expect(granularidadeDoPeriodo("2026-08-01", "")).toBeNull();
    expect(granularidadeDoPeriodo("", "")).toBeNull();
  });
});

describe("mostraRotulo", () => {
  it("com poucos blocos, todos escrevem o nome", () => {
    // Doze meses num popover de 530px dão 44px por bloco: "jan" cabe folgado.
    for (let i = 0; i < 12; i++) {
      expect(mostraRotulo(i, 12)).toBe(true);
    }
  });

  it("com 31 dias, escreve de cinco em cinco", () => {
    // 17px por bloco, e "10" sairia como "1..": a régua virava uma fileira de
    // reticências que não dizia dia nenhum.
    const escritos = Array.from({ length: 31 }, (_, i) => i)
      .filter((i) => mostraRotulo(i, 31))
      .map((i) => i + 1);
    expect(escritos).toEqual([1, 6, 11, 16, 21, 26, 31]);
  });

  it("o primeiro bloco SEMPRE escreve", () => {
    // Régua que começa sem número não diz onde começa.
    for (const total of [1, 12, 28, 29, 30, 31, 52]) {
      expect(mostraRotulo(0, total)).toBe(true);
    }
  });

  it("a virada é em 16 blocos", () => {
    expect(mostraRotulo(1, 16)).toBe(true);
    expect(mostraRotulo(1, 17)).toBe(false);
  });
});
