import { describe, expect, it } from "vitest";

import {
  drillAging,
  drillCategoriaCompetencia,
  drillCentroCusto,
  drillCustoReceita,
  drillContaBancaria,
  drillFluxoCaixa,
  drillGrupoInsumo,
  ROTA_LANCAMENTOS,
} from "@/modules/financeiro/relatorios/drill";

const CENTRO = "fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0";
const OUTRO_CENTRO = "bfbd54dc-f303-4d5b-a505-f441d0f81142";
const CATEGORIA = "11111111-1111-4111-8111-111111111111";
const OUTRA_CATEGORIA = "55555555-5555-4555-8555-555555555555";
const FORNECEDOR = "22222222-2222-4222-8222-222222222222";
const FORMA = "33333333-3333-4333-8333-333333333333";
const CONTA = "44444444-4444-4444-4444-444444444444";

/**
 * Os parâmetros da URL, para asserir sem depender da ordem em que eles saem da
 * URLSearchParams.
 */
function params(url: string): Record<string, string> {
  const [rota, query] = url.split("?");
  expect(rota).toBe(ROTA_LANCAMENTOS);
  return Object.fromEntries(new URLSearchParams(query ?? ""));
}

/**
 * O drill é o contrato entre a célula do relatório e a lista que abre. O que ele
 * tem que garantir, e que estes testes travam, é que os filtros IMPLÍCITOS do
 * relatório viajem: o custo por centro soma `tipo = 'a_pagar'` e
 * `status <> 'cancelado'`, e sem esses dois na URL o total da lista não fecha com
 * a célula clicada. Hoje a base não tem cancelado nem a receber, então a falta
 * deles passaria despercebida — e é exatamente por isso que o teste existe.
 */
describe("drillCentroCusto", () => {
  it("carrega centro, mês, tipo a_pagar e sem_cancelado", () => {
    const url = drillCentroCusto({
      centroCustoIds: [CENTRO],
      periodo: { mes: "2026-07" },
      filtros: {},
    });
    expect(params(url)).toEqual({
      centro: CENTRO,
      mes: "2026-07",
      tipo: "a_pagar",
      sem_cancelado: "1",
    });
  });

  it("traduz o período de/até em faixa de mês de referência", () => {
    const p = params(
      drillCentroCusto({
        centroCustoIds: [CENTRO],
        periodo: { de: "2025-01", ate: "2026-07" },
        filtros: {},
      }),
    );
    expect(p.comp_de).toBe("2025-01-01");
    // Último dia do mês de cima: a faixa é fechada dos dois lados (`lte` no
    // banco), então terminar no dia 1 deixaria de fora o próprio mês pedido se
    // algum dia existir competência fora do dia 1.
    expect(p.comp_ate).toBe("2026-07-31");
    expect(p.mes).toBeUndefined();
  });

  it("acerta o último dia em fevereiro e em ano bissexto", () => {
    const naoBissexto = params(
      drillCentroCusto({
        centroCustoIds: [CENTRO],
        periodo: { de: "2026-02", ate: "2026-02" },
        filtros: {},
      }),
    );
    expect(naoBissexto.comp_ate).toBe("2026-02-28");

    const bissexto = params(
      drillCentroCusto({
        centroCustoIds: [CENTRO],
        periodo: { de: "2028-02", ate: "2028-02" },
        filtros: {},
      }),
    );
    expect(bissexto.comp_ate).toBe("2028-02-29");
  });

  it("período total não manda limite nenhum de data", () => {
    const p = params(
      drillCentroCusto({
        centroCustoIds: [CENTRO],
        periodo: {},
        filtros: {},
      }),
    );
    expect(p.mes).toBeUndefined();
    expect(p.comp_de).toBeUndefined();
    expect(p.comp_ate).toBeUndefined();
    // Mas os implícitos continuam: sem eles o total não fecharia nem no total.
    expect(p.tipo).toBe("a_pagar");
    expect(p.sem_cancelado).toBe("1");
  });

  it("uma ponta só do período também vale", () => {
    const p = params(
      drillCentroCusto({
        centroCustoIds: [CENTRO],
        periodo: { de: "2025-01" },
        filtros: {},
      }),
    );
    expect(p.comp_de).toBe("2025-01-01");
    expect(p.comp_ate).toBeUndefined();
  });

  it("leva os filtros do relatório junto", () => {
    const p = params(
      drillCentroCusto({
        centroCustoIds: [CENTRO],
        periodo: { mes: "2026-07" },
        filtros: { categoriaIds: [CATEGORIA], fornecedorIds: [FORNECEDOR] },
      }),
    );
    expect(p.categoria).toBe(CATEGORIA);
    expect(p.fornecedor).toBe(FORNECEDOR);
  });

  it("por padrão não exclui previsto, que é o relatório de hoje", () => {
    // O relatório exclui cancelado SEMPRE e previsto NUNCA, até alguém pedir.
    // Inverter isso mudaria um número de dinheiro sem ninguém pedir, e com 0
    // previsto na base a mudança não apareceria na tela hoje.
    const p = params(
      drillCentroCusto({
        centroCustoIds: [CENTRO],
        periodo: { mes: "2026-07" },
        filtros: {},
      }),
    );
    expect(p.sem_cancelado).toBe("1");
    expect(p.sem_previsto).toBeUndefined();
    expect(p.status).toBeUndefined();
  });

  it("com excluirPrevisto, a lista também exclui previsto", () => {
    const p = params(
      drillCentroCusto({
        centroCustoIds: [CENTRO],
        periodo: { mes: "2026-07" },
        filtros: { excluirPrevisto: true },
      }),
    );
    expect(p.sem_previsto).toBe("1");
    expect(p.sem_cancelado).toBe("1");
  });

  it("vários centros viajam na mesma chave, separados por vírgula", () => {
    // É o clique num mês do gráfico de vida, que tem várias obras desenhadas: a
    // lista tem que abrir as mesmas obras que estavam no ponto.
    const p = params(
      drillCentroCusto({
        centroCustoIds: [CENTRO, OUTRO_CENTRO],
        periodo: { mes: "2026-07" },
        filtros: {},
      }),
    );
    expect(p.centro).toBe(`${CENTRO},${OUTRO_CENTRO}`);
  });

  it("leva os filtros de lista inteiros, e não só o primeiro", () => {
    // Este é o defeito que o drill existe para não ter: com só o primeiro
    // fornecedor na URL, a lista abriria um conjunto MAIOR que a célula clicada,
    // sem nada na tela dizendo isso.
    const p = params(
      drillCentroCusto({
        centroCustoIds: [CENTRO],
        periodo: { mes: "2026-07" },
        filtros: {
          categoriaIds: [CATEGORIA, OUTRA_CATEGORIA],
          fornecedorIds: [FORNECEDOR],
          formaIds: [FORMA],
          status: ["aprovado", "pago"],
        },
      }),
    );
    expect(p.categoria).toBe(`${CATEGORIA},${OUTRA_CATEGORIA}`);
    expect(p.fornecedor).toBe(FORNECEDOR);
    expect(p.forma).toBe(FORMA);
    // `status_in`, e não `status`: na lista de lançamentos o `status` significa a
    // situação do dinheiro ("A pagar" inclui aprovado com saldo em aberto), e o
    // relatório soma pelo status literal da coluna.
    expect(p.status_in).toBe("aprovado,pago");
    expect(p.status).toBeUndefined();
  });

  it("sem forma informada viaja como parâmetro próprio", () => {
    // São 880 lançamentos a pagar sem forma (R$ 13,4 mi): se a marcação não
    // viajasse, a lista traria linha que a célula não contou.
    const p = params(
      drillCentroCusto({
        centroCustoIds: [CENTRO],
        periodo: { mes: "2026-07" },
        filtros: { formaIds: [FORMA], semForma: true },
      }),
    );
    expect(p.forma).toBe(FORMA);
    expect(p.sem_forma).toBe("1");
  });

  it("lista vazia não vira parâmetro nenhum", () => {
    const p = params(
      drillCentroCusto({
        centroCustoIds: [CENTRO],
        periodo: { mes: "2026-07" },
        filtros: {
          categoriaIds: [],
          fornecedorIds: [],
          formaIds: [],
          status: [],
        },
      }),
    );
    expect(p.categoria).toBeUndefined();
    expect(p.fornecedor).toBeUndefined();
    expect(p.forma).toBeUndefined();
    expect(p.status_in).toBeUndefined();
    expect(p.sem_forma).toBeUndefined();
  });
});

describe("drillCategoriaCompetencia", () => {
  it("leva categoria, mês e o tipo da linha do DRE", () => {
    expect(
      params(
        drillCategoriaCompetencia({
          categoriaId: CATEGORIA,
          periodo: { mes: "2026-07" },
          tipo: "a_receber",
        }),
      ),
    ).toEqual({
      categoria: CATEGORIA,
      mes: "2026-07",
      tipo: "a_receber",
      sem_cancelado: "1",
    });
  });

  it("a linha de despesa vai como a_pagar", () => {
    expect(
      params(
        drillCategoriaCompetencia({
          categoriaId: CATEGORIA,
          periodo: { mes: "2026-07" },
          tipo: "a_pagar",
        }),
      ).tipo,
    ).toBe("a_pagar");
  });

  it("o DRE do trimestre abre a lista do trimestre inteiro", () => {
    // Enquanto o DRE era de um mês só, o drill levava `mes` e pronto. Com o
    // período destravado, um link preso no mês abriria um terço do que a linha
    // somou — e a lista não teria como acusar, porque ela abre certinha.
    expect(
      params(
        drillCategoriaCompetencia({
          categoriaId: CATEGORIA,
          periodo: { de: "2026-01", ate: "2026-03" },
          tipo: "a_pagar",
        }),
      ),
    ).toEqual({
      categoria: CATEGORIA,
      comp_de: "2026-01-01",
      comp_ate: "2026-03-31",
      tipo: "a_pagar",
      sem_cancelado: "1",
    });
  });

  it("o DRE de tudo não manda limite de data nenhum", () => {
    expect(
      params(
        drillCategoriaCompetencia({
          categoriaId: CATEGORIA,
          periodo: {},
          tipo: "a_receber",
        }),
      ),
    ).toEqual({
      categoria: CATEGORIA,
      tipo: "a_receber",
      sem_cancelado: "1",
    });
  });
});

describe("drillGrupoInsumo", () => {
  it("grupo nulo (lançamento avulso) leva só o período", () => {
    expect(
      params(drillGrupoInsumo({ grupoId: null, periodo: { mes: "2026-07" } })),
    ).toEqual({
      mes: "2026-07",
      tipo: "a_pagar",
      sem_cancelado: "1",
    });
  });

  it("leva o centro e a categoria que o relatório está somando", () => {
    // Sem eles, clicar em "Sem insumo" num relatório recortado por obra abria a
    // lista com o custo de TODOS os centros: a célula somava R$ 3,3 mi e a lista
    // mostrava R$ 6,9 mi, sem erro nenhum na tela.
    expect(
      params(
        drillGrupoInsumo({
          grupoId: null,
          periodo: { mes: "2026-07" },
          recorte: { centroCustoId: CENTRO, categoriaId: CATEGORIA },
        }),
      ),
    ).toEqual({
      mes: "2026-07",
      centro: CENTRO,
      categoria: CATEGORIA,
      tipo: "a_pagar",
      sem_cancelado: "1",
    });
  });

  it("sem recorte, não inventa filtro de centro nem de categoria", () => {
    // Linha de controle do teste acima: o par de chaves só aparece quando a tela
    // está mesmo filtrada, senão `centro=` vazio recortaria a lista para nada.
    const chaves = Object.keys(
      params(
        drillGrupoInsumo({
          grupoId: null,
          periodo: {},
          recorte: {},
        }),
      ),
    );
    expect(chaves).not.toContain("centro");
    expect(chaves).not.toContain("categoria");
  });

  it("recusa grupo com insumo, porque o total não fecharia", () => {
    // O grupo com insumo soma `oc_itens.quantidade * preco_unitario`, não o valor
    // do lançamento. Não acontece hoje (0 ordens de compra no banco) e falha alto
    // no dia em que a primeira OC entrar, em vez de abrir uma lista que soma
    // diferente da célula e ninguém percebe.
    expect(() =>
      drillGrupoInsumo({
        grupoId: "33333333-3333-4333-8333-333333333333",
        periodo: { mes: "2026-07" },
      }),
    ).toThrow(/item de OC/i);
  });
});

describe("drillFluxoCaixa", () => {
  it("realizado vira recorte de fluxo pago", () => {
    expect(
      params(drillFluxoCaixa({ mes: "2026-07", tipo: "a_pagar", realizado: true })),
    ).toEqual({
      recorte: "fluxo:2026-07:realizado",
      tipo: "a_pagar",
    });
  });

  it("previsto vira recorte de fluxo previsto", () => {
    expect(
      params(
        drillFluxoCaixa({ mes: "2026-07", tipo: "a_receber", realizado: false }),
      ),
    ).toEqual({
      recorte: "fluxo:2026-07:previsto",
      tipo: "a_receber",
    });
  });

  it("não manda mes de competência num drill de caixa", () => {
    // Regime de CAIXA: `mes` é competência, e mandá-lo aqui daria outra lista sem
    // erro nenhum. O recorte carrega o mês do caixa, que é coisa diferente.
    const p = params(
      drillFluxoCaixa({ mes: "2026-07", tipo: "a_pagar", realizado: true }),
    );
    expect(p.mes).toBeUndefined();
    expect(p.venc_de).toBeUndefined();
    expect(p.venc_ate).toBeUndefined();
  });

  it("os centros do relatório viajam no clique", () => {
    // Sem isto, clicar na fatia de UMA obra abriria a lista com o dinheiro de
    // todas: a barra soma `liquido × fatia do rateio`, e a lista sem `centro=`
    // soma a parcela inteira de todo mundo.
    expect(
      params(
        drillFluxoCaixa({
          mes: "2026-07",
          tipo: "a_pagar",
          realizado: true,
          centroIds: [CENTRO, OUTRO_CENTRO],
        }),
      ),
    ).toEqual({
      recorte: "fluxo:2026-07:realizado",
      tipo: "a_pagar",
      centro: `${CENTRO},${OUTRO_CENTRO}`,
    });
  });

  it("lado sem filtro não ganha `centro=` vazio", () => {
    // Lista vazia tem de virar ausência do parâmetro, e não `centro=`: a tela de
    // Lançamentos leria a chave presente e a barra dela mostraria um filtro que
    // ninguém escolheu.
    const p = params(
      drillFluxoCaixa({
        mes: "2026-07",
        tipo: "a_receber",
        realizado: false,
        centroIds: [],
      }),
    );
    expect(p.centro).toBeUndefined();
  });
});

describe("drillAging", () => {
  it("leva a faixa pela classificação do banco, não por datas", () => {
    const p = params(drillAging({ faixa: "v_8_15", tipo: "a_pagar" }));
    expect(p.recorte).toBe("aging:v_8_15:a_pagar");
    // Reconstruir a faixa como janela de datas erra na borda e descarta parcela
    // sem vencimento, que o aging conta como "a vencer".
    expect(p.venc_de).toBeUndefined();
    expect(p.venc_ate).toBeUndefined();
    expect(p.atraso).toBeUndefined();
  });

  it("a vencer também vai pelo recorte", () => {
    expect(params(drillAging({ faixa: "a_vencer", tipo: "a_receber" })).recorte).toBe(
      "aging:a_vencer:a_receber",
    );
  });
});

describe("drillContaBancaria", () => {
  it("leva conta e o recorte de parcela paga", () => {
    expect(params(drillContaBancaria({ contaId: CONTA, tipo: "a_pagar" }))).toEqual({
      conta: CONTA,
      recorte: "conta_paga",
      tipo: "a_pagar",
    });
  });
});

/**
 * Custo x receita: o clique nas duas tabelas.
 *
 * O que estes testes travam é a diferença entre elas: o `tipo` vem da tabela
 * clicada, e os meses viajam como LISTA. Com uma faixa, "jan, mar e jul" abriria
 * fevereiro junto e a lista traria linha que a célula não somou.
 */
describe("drillCustoReceita", () => {
  it("da tabela de custo, leva tipo a_pagar e a lista de meses", () => {
    const p = params(
      drillCustoReceita({
        centroCustoId: CENTRO,
        meses: ["2026-01", "2026-03", "2026-07"],
        tipo: "a_pagar",
      }),
    );
    expect(p.tipo).toBe("a_pagar");
    expect(p.centro).toBe(CENTRO);
    expect(p.comp_in).toBe("2026-01-01,2026-03-01,2026-07-01");
    // Faixa NAO viaja: ela traria fevereiro, que a celula nao somou.
    expect(p.comp_de).toBeUndefined();
    expect(p.comp_ate).toBeUndefined();
    expect(p.sem_cancelado).toBe("1");
  });

  it("da tabela de receita, leva tipo a_receber", () => {
    const p = params(
      drillCustoReceita({
        centroCustoId: CENTRO,
        meses: ["2026-07"],
        tipo: "a_receber",
      }),
    );
    expect(p.tipo).toBe("a_receber");
    expect(p.comp_in).toBe("2026-07-01");
  });

  it("sem mes nenhum, nao manda a chave dos meses", () => {
    const p = params(
      drillCustoReceita({ centroCustoId: CENTRO, meses: [], tipo: "a_pagar" }),
    );
    expect(p.comp_in).toBeUndefined();
    expect(p.centro).toBe(CENTRO);
  });
});
