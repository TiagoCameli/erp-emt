import { describe, expect, it } from "vitest";

import {
  descreverPeriodo,
  escritaDaJanela,
  janelaDoPeriodo,
  lerPeriodoDaUrl,
  periodoDoModo,
  periodoFechado,
  pontasDaRpc,
} from "@/modules/financeiro/relatorios/filtros-periodo";

const CORRENTE = "2026-08";

/**
 * O período de competência é lido por três relatórios (DRE, custo por grupo e,
 * com um modo a mais, o custo por centro de custo) e vira as duas pontas que a
 * RPC recebe. O que estes testes travam é a parte que some do olho: o `fim` é
 * EXCLUSIVO, e errar isso por um dia deixa o último mês inteiro de fora sem a
 * tela parar de mostrar número.
 */
describe("lerPeriodoDaUrl", () => {
  it("sem parâmetro nenhum, é o mês corrente", () => {
    expect(lerPeriodoDaUrl({}, CORRENTE)).toEqual({
      modo: "mes",
      mes: CORRENTE,
      de: "",
      ate: "",
    });
  });

  it("modo que não existe aqui cai no padrão, em vez de quebrar", () => {
    // `vida` é modo do custo por centro de custo. Trocar de relatório na barra de
    // cima arrasta os parâmetros, e o que não se aplica tem que virar o padrão.
    expect(lerPeriodoDaUrl({ modo: "vida" }, CORRENTE).modo).toBe("mes");
  });

  it("mês inválido não chega na tela marcado", () => {
    expect(lerPeriodoDaUrl({ mes: "2026-13" }, CORRENTE).mes).toBe(CORRENTE);
  });

  it("janela invertida troca de lado em vez de vir vazia", () => {
    const filtros = lerPeriodoDaUrl(
      { modo: "periodo", de: "2026-08", ate: "2026-01" },
      CORRENTE,
    );
    expect(filtros.de).toBe("2026-01");
    expect(filtros.ate).toBe("2026-08");
  });
});

describe("periodoDoModo", () => {
  it("um mês só", () => {
    expect(
      periodoDoModo({ modo: "mes", mes: "2026-07", de: "2026-01", ate: "" }),
    ).toEqual({ mes: "2026-07" });
  });

  it("período leva só as pontas preenchidas", () => {
    expect(
      periodoDoModo({ modo: "periodo", mes: "2026-07", de: "2026-01", ate: "" }),
    ).toEqual({ de: "2026-01" });
  });

  it("tudo não leva ponta nenhuma", () => {
    expect(
      periodoDoModo({
        modo: "total",
        mes: "2026-07",
        de: "2026-01",
        ate: "2026-03",
      }),
    ).toEqual({});
  });
});

describe("pontasDaRpc", () => {
  it("o fim é EXCLUSIVO: o mês fecha no dia 1 do mês seguinte", () => {
    expect(pontasDaRpc({ mes: "2026-07" })).toEqual({
      inicio: "2026-07-01",
      fim: "2026-08-01",
    });
  });

  it("a virada de ano vira dezembro em janeiro do ano seguinte", () => {
    expect(pontasDaRpc({ de: "2025-12", ate: "2025-12" })).toEqual({
      inicio: "2025-12-01",
      fim: "2026-01-01",
    });
  });

  it("período aberto devolve ponta indefinida, não uma data inventada", () => {
    expect(pontasDaRpc({ de: "2026-01" })).toEqual({
      inicio: "2026-01-01",
      fim: undefined,
    });
  });
});

describe("periodoFechado", () => {
  const MESES = ["2025-01", "2025-02", "2026-08"];

  it("tudo vira do primeiro ao último mês que existe", () => {
    expect(periodoFechado({}, MESES)).toEqual({ de: "2025-01", ate: "2026-08" });
  });

  it("uma ponta aberta é fechada no extremo daquele lado", () => {
    expect(periodoFechado({ de: "2026-01" }, MESES)).toEqual({
      de: "2026-01",
      ate: "2026-08",
    });
    expect(periodoFechado({ ate: "2025-02" }, MESES)).toEqual({
      de: "2025-01",
      ate: "2025-02",
    });
  });

  it("mês continua mês: não vira janela", () => {
    expect(periodoFechado({ mes: "2026-07" }, MESES)).toEqual({ mes: "2026-07" });
  });

  it("sem mês nenhum na base, não há período", () => {
    // O DRE precisa das duas datas (a `fn_rel_dre` não tem guarda de nulo), e
    // inventar uma faria a tela consultar uma janela que não quer dizer nada.
    expect(periodoFechado({}, [])).toBeNull();
  });
});

describe("descreverPeriodo", () => {
  it("diz o mês, a janela e o tudo em pt-BR", () => {
    expect(descreverPeriodo({ mes: "2026-07" })).toBe(
      "Mês de referência 07/2026",
    );
    expect(descreverPeriodo({ de: "2026-01", ate: "2026-03" })).toBe(
      "De 01/2026 a 03/2026",
    );
    expect(descreverPeriodo({}, "total")).toBe(
      "Todo o período, sem limite de data",
    );
  });
});

/**
 * A régua de mês de referência é UM controle para o que a URL guarda em três
 * parâmetros. Estas duas funções são a ponte, e a regra que não pode se perder é
 * a do X: régua limpa significa SEM LIMITE, que nesta URL é `modo=total`. Se ela
 * escrevesse "nada", o X devolveria a pessoa ao mês corrente (o padrão da
 * leitura) em vez de abrir o relatório inteiro.
 */
describe("janelaDoPeriodo", () => {
  it("um mês vira janela com as duas pontas no mesmo mês", () => {
    expect(
      janelaDoPeriodo({ modo: "mes", mes: "2026-07", de: "", ate: "" }),
    ).toEqual({ de: "2026-07", ate: "2026-07" });
  });

  it("período vira a janela dele, inclusive com ponta aberta", () => {
    expect(
      janelaDoPeriodo({
        modo: "periodo",
        mes: "2026-08",
        de: "2026-01",
        ate: "2026-03",
      }),
    ).toEqual({ de: "2026-01", ate: "2026-03" });
    expect(
      janelaDoPeriodo({ modo: "periodo", mes: "2026-08", de: "2026-01", ate: "" }),
    ).toEqual({ de: "2026-01", ate: "" });
  });

  it("tudo e vida do centro abrem a régua vazia", () => {
    // Em `vida` a janela é de cada centro, a partir do primeiro lançamento dele:
    // uma régua marcada ali seria um filtro que não filtra.
    expect(
      janelaDoPeriodo({ modo: "total", mes: "2026-08", de: "2026-01", ate: "" }),
    ).toEqual({ de: "", ate: "" });
    expect(
      janelaDoPeriodo({ modo: "vida", mes: "2026-08", de: "", ate: "" }),
    ).toEqual({ de: "", ate: "" });
  });
});

describe("escritaDaJanela", () => {
  it("régua limpa é SEM LIMITE, e sem limite é `modo=total`", () => {
    expect(escritaDaJanela("", "")).toEqual({
      modo: "total",
      de: null,
      ate: null,
      mes: null,
    });
  });

  it("janela escolhida vira modo período com as duas pontas", () => {
    expect(escritaDaJanela("2026-01", "2026-03")).toEqual({
      modo: "periodo",
      de: "2026-01",
      ate: "2026-03",
      mes: null,
    });
  });

  it("um mês só também é janela, e chega à RPC como o modo mês chegava", () => {
    const escrita = escritaDaJanela("2026-07", "2026-07");
    expect(escrita.modo).toBe("periodo");

    const comoAntes = pontasDaRpc(periodoDoModo(lerPeriodoDaUrl({ mes: "2026-07" }, CORRENTE)));
    const agora = pontasDaRpc(
      periodoDoModo(
        lerPeriodoDaUrl(
          { modo: "periodo", de: "2026-07", ate: "2026-07" },
          CORRENTE,
        ),
      ),
    );
    expect(agora).toEqual(comoAntes);
  });

  it("apaga o `mes` do formato antigo em toda escrita", () => {
    // Dois parâmetros para a mesma pergunta na URL é o caminho para eles
    // discordarem: `mes` só vale no modo `mes`, e ficaria pendurado e invisível.
    expect(escritaDaJanela("2026-01", "").mes).toBeNull();
    expect(escritaDaJanela("", "").mes).toBeNull();
  });

  it("ponta aberta viaja como ausência, não como string vazia", () => {
    expect(escritaDaJanela("2026-01", "")).toEqual({
      modo: "periodo",
      de: "2026-01",
      ate: null,
      mes: null,
    });
  });
});
