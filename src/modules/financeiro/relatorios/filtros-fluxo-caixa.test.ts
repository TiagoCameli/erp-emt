import { describe, expect, it } from "vitest";

import {
  dentroDaJanela,
  descreverJanela,
  janelaDoFluxo,
  lerFiltrosFluxoCaixa,
  MESES_PARA_FRENTE,
  MESES_PARA_TRAS,
} from "@/modules/financeiro/relatorios/filtros-fluxo-caixa";

const CORRENTE = "2026-08";

describe("lerFiltrosFluxoCaixa", () => {
  it("sem parâmetro, é a janela padrão", () => {
    expect(lerFiltrosFluxoCaixa({})).toEqual({
      modo: "janela",
      de: "",
      ate: "",
    });
  });

  it("não confunde o período de COMPETÊNCIA com a janela de CAIXA", () => {
    // Os relatórios de competência escrevem `modo`, `de` e `ate`. Se o fluxo lesse
    // essas mesmas chaves, sair do DRE do trimestre e cair no fluxo filtraria o
    // mês do PAGAMENTO por uma janela que a pessoa escolheu para o mês de
    // referência — duas dimensões diferentes com a mesma cara.
    const filtros = lerFiltrosFluxoCaixa({
      modo: "periodo",
      de: "2026-01",
      ate: "2026-03",
    });
    expect(filtros).toEqual({ modo: "janela", de: "", ate: "" });
  });

  it("lê o período próprio do fluxo", () => {
    expect(
      lerFiltrosFluxoCaixa({
        fluxo_modo: "periodo",
        fluxo_de: "2026-01",
        fluxo_ate: "2026-03",
      }),
    ).toEqual({ modo: "periodo", de: "2026-01", ate: "2026-03" });
  });

  it("janela invertida troca de lado", () => {
    const filtros = lerFiltrosFluxoCaixa({
      fluxo_modo: "periodo",
      fluxo_de: "2026-03",
      fluxo_ate: "2026-01",
    });
    expect([filtros.de, filtros.ate]).toEqual(["2026-01", "2026-03"]);
  });
});

describe("janelaDoFluxo", () => {
  it("o padrão é um ano para cada lado do mês corrente", () => {
    expect(
      janelaDoFluxo({ modo: "janela", de: "", ate: "" }, CORRENTE),
    ).toEqual({ de: "2025-08", ate: "2027-08" });
  });

  it("a janela padrão atravessa a virada de ano sem inventar mês 13", () => {
    expect(janelaDoFluxo({ modo: "janela", de: "", ate: "" }, "2026-01")).toEqual(
      { de: "2025-01", ate: "2027-01" },
    );
    expect(janelaDoFluxo({ modo: "janela", de: "", ate: "" }, "2026-12")).toEqual(
      { de: "2025-12", ate: "2027-12" },
    );
  });

  it("os dois lados da janela padrão são os declarados", () => {
    // Linha de controle: se alguém mudar as constantes, o teste acima acompanha
    // sozinho e este continua provando que elas são o que dizem ser.
    expect(MESES_PARA_TRAS).toBe(12);
    expect(MESES_PARA_FRENTE).toBe(12);
  });

  it("tudo não tem ponta nenhuma", () => {
    expect(janelaDoFluxo({ modo: "total", de: "2026-01", ate: "" }, CORRENTE))
      .toEqual({});
  });

  it("período leva só a ponta preenchida", () => {
    expect(
      janelaDoFluxo({ modo: "periodo", de: "", ate: "2026-12" }, CORRENTE),
    ).toEqual({ ate: "2026-12" });
  });
});

describe("dentroDaJanela", () => {
  it("inclui as duas pontas", () => {
    const janela = { de: "2026-01", ate: "2026-03" };
    expect(dentroDaJanela("2026-01", janela)).toBe(true);
    expect(dentroDaJanela("2026-03", janela)).toBe(true);
    expect(dentroDaJanela("2025-12", janela)).toBe(false);
    expect(dentroDaJanela("2026-04", janela)).toBe(false);
  });

  it("a prestação de 2031 fica de fora da janela padrão", () => {
    // É o defeito medido: 78 meses no gráfico, indo até 05/2031, porque os
    // financiamentos têm 57 parcelas.
    expect(
      dentroDaJanela("2031-05", janelaDoFluxo({ modo: "janela", de: "", ate: "" }, CORRENTE)),
    ).toBe(false);
  });

  it("sem janela, tudo entra", () => {
    expect(dentroDaJanela("2031-05", {})).toBe(true);
  });
});

describe("descreverJanela", () => {
  it("diz o recorte em pt-BR", () => {
    expect(descreverJanela({ de: "2025-08", ate: "2027-08" })).toBe(
      "De 08/2025 a 08/2027",
    );
    expect(descreverJanela({ ate: "2026-12" })).toBe("Até 12/2026");
    expect(descreverJanela({})).toBe("Todos os meses com movimento");
  });
});
