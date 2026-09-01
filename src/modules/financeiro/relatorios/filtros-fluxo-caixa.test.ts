import { describe, expect, it } from "vitest";

import {
  dentroDaJanela,
  descreverFatia,
  descreverJanela,
  janelaDoFluxo,
  lerFiltrosFluxoCaixa,
  MESES_PARA_FRENTE,
  MESES_PARA_TRAS,
} from "@/modules/financeiro/relatorios/filtros-fluxo-caixa";

const CORRENTE = "2026-08";

/** A janela sem centro nenhum escolhido, que é o estado padrão da tela. */
const SEM_CENTRO = {
  centrosCusto: [],
  etapasCusto: [],
  centrosReceita: [],
  etapasReceita: [],
};

const OBRA = "11111111-1111-4111-8111-111111111111";
const OUTRA_OBRA = "22222222-2222-4222-8222-222222222222";
const EQUIPAMENTO = "33333333-3333-4333-8333-333333333333";

describe("lerFiltrosFluxoCaixa", () => {
  it("sem parâmetro, é a janela padrão", () => {
    expect(lerFiltrosFluxoCaixa({})).toEqual({
      modo: "janela",
      de: "",
      ate: "",
      ...SEM_CENTRO,
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
    expect(filtros).toEqual({
      modo: "janela",
      de: "",
      ate: "",
      ...SEM_CENTRO,
    });
  });

  it("lê o período próprio do fluxo", () => {
    expect(
      lerFiltrosFluxoCaixa({
        fluxo_modo: "periodo",
        fluxo_de: "2026-01",
        fluxo_ate: "2026-03",
      }),
    ).toEqual({
      modo: "periodo",
      de: "2026-01",
      ate: "2026-03",
      ...SEM_CENTRO,
    });
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
      janelaDoFluxo({ modo: "janela", de: "", ate: "", ...SEM_CENTRO }, CORRENTE),
    ).toEqual({ de: "2025-08", ate: "2027-08" });
  });

  it("a janela padrão atravessa a virada de ano sem inventar mês 13", () => {
    expect(janelaDoFluxo({ modo: "janela", de: "", ate: "", ...SEM_CENTRO }, "2026-01")).toEqual(
      { de: "2025-01", ate: "2027-01" },
    );
    expect(janelaDoFluxo({ modo: "janela", de: "", ate: "", ...SEM_CENTRO }, "2026-12")).toEqual(
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
    expect(janelaDoFluxo({ modo: "total", de: "2026-01", ate: "", ...SEM_CENTRO }, CORRENTE))
      .toEqual({});
  });

  it("período leva só a ponta preenchida", () => {
    expect(
      janelaDoFluxo({ modo: "periodo", de: "", ate: "2026-12", ...SEM_CENTRO }, CORRENTE),
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
      dentroDaJanela("2031-05", janelaDoFluxo({ modo: "janela", de: "", ate: "", ...SEM_CENTRO }, CORRENTE)),
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

describe("lerFiltrosFluxoCaixa: os centros dos dois lados", () => {
  it("lê os quatro parâmetros de centro, separados por vírgula", () => {
    const filtros = lerFiltrosFluxoCaixa({
      centro_custo: `${OBRA},${OUTRA_OBRA}`,
      etapa_custo: EQUIPAMENTO,
      centro_receita: OUTRA_OBRA,
      etapa_receita: "",
    });
    expect(filtros.centrosCusto).toEqual([OBRA, OUTRA_OBRA]);
    expect(filtros.etapasCusto).toEqual([EQUIPAMENTO]);
    expect(filtros.centrosReceita).toEqual([OUTRA_OBRA]);
    expect(filtros.etapasReceita).toEqual([]);
  });

  it("os dois lados são independentes: recortar o custo não recorta a receita", () => {
    // É o pedido, e é o que fn_rel_custo_receita já faz: comparar o custo da obra
    // mais o das máquinas dela contra a receita da obra precisa dos dois soltos.
    const filtros = lerFiltrosFluxoCaixa({ centro_custo: OBRA });
    expect(filtros.centrosCusto).toEqual([OBRA]);
    expect(filtros.centrosReceita).toEqual([]);
  });

  it("aceita a chave repetida, como um formulário mandaria", () => {
    const filtros = lerFiltrosFluxoCaixa({
      centro_custo: [OBRA, OUTRA_OBRA],
    });
    expect(filtros.centrosCusto).toEqual([OBRA, OUTRA_OBRA]);
  });

  it("descarta o que não é uuid em vez de deixar chegar à tela", () => {
    // Valor inválido que passasse apareceria MARCADO na barra, e a pessoa leria
    // que o relatório está filtrado quando ele não está.
    const filtros = lerFiltrosFluxoCaixa({
      centro_custo: `nao-e-uuid,${OBRA}`,
      centro_receita: "12345",
    });
    expect(filtros.centrosCusto).toEqual([OBRA]);
    expect(filtros.centrosReceita).toEqual([]);
  });

  it("deduplica preservando a ordem de escolha", () => {
    const filtros = lerFiltrosFluxoCaixa({
      centro_custo: `${OUTRA_OBRA},${OBRA},${OUTRA_OBRA}`,
    });
    expect(filtros.centrosCusto).toEqual([OUTRA_OBRA, OBRA]);
  });

  it("o centro é a MESMA dimensão do Custo x receita, então herda os parâmetros dele", () => {
    // Contraste deliberado com o teste da janela: tempo NÃO se herda (caixa x
    // competência são dimensões diferentes com a mesma cara), centro se herda —
    // "obra 009" quer dizer obra 009 nos dois relatórios. Trocar de aba na barra
    // de cima mantém a obra escolhida.
    const filtros = lerFiltrosFluxoCaixa({
      centro_custo: OBRA,
      etapa_custo: EQUIPAMENTO,
      modo: "periodo",
      de: "2026-01",
    });
    expect(filtros.centrosCusto).toEqual([OBRA]);
    expect(filtros.etapasCusto).toEqual([EQUIPAMENTO]);
    // ...e a janela de competência continua sendo ignorada.
    expect(filtros.modo).toBe("janela");
    expect(filtros.de).toBe("");
  });

  it("corta no teto do filtro `in`, que viaja na query string", () => {
    const muitos = Array.from(
      { length: 60 },
      (_, indice) =>
        `${String(indice).padStart(8, "0")}-1111-4111-8111-111111111111`,
    );
    expect(
      lerFiltrosFluxoCaixa({ centro_custo: muitos.join(",") }).centrosCusto,
    ).toHaveLength(50);
  });
});

describe("descreverFatia", () => {
  it("sem centro escolhido, não escreve nada", () => {
    expect(descreverFatia(0)).toBe("");
    expect(descreverFatia(-1)).toBe("");
  });

  it("diz que o número é fatia, no singular e no plural", () => {
    // O aviso existe porque os dois lados se escolhem separados: sem ele, o
    // cartão de saídas mostraria a fatia de uma obra e o de entradas o total da
    // empresa, com o saldo somando os dois.
    expect(descreverFatia(1)).toBe("Fatia de 1 centro escolhido");
    expect(descreverFatia(3)).toBe("Fatia de 3 centros escolhidos");
  });
});
