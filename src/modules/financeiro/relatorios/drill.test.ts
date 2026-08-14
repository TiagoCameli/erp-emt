import { describe, expect, it } from "vitest";

import {
  drillAging,
  drillCategoriaCompetencia,
  drillCentroCusto,
  drillContaBancaria,
  drillFluxoCaixa,
  drillGrupoInsumo,
  ROTA_LANCAMENTOS,
} from "@/modules/financeiro/relatorios/drill";

const CENTRO = "fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0";
const CATEGORIA = "11111111-1111-4111-8111-111111111111";
const FORNECEDOR = "22222222-2222-4222-8222-222222222222";
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
      centroCustoId: CENTRO,
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
        centroCustoId: CENTRO,
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
        centroCustoId: CENTRO,
        periodo: { de: "2026-02", ate: "2026-02" },
        filtros: {},
      }),
    );
    expect(naoBissexto.comp_ate).toBe("2026-02-28");

    const bissexto = params(
      drillCentroCusto({
        centroCustoId: CENTRO,
        periodo: { de: "2028-02", ate: "2028-02" },
        filtros: {},
      }),
    );
    expect(bissexto.comp_ate).toBe("2028-02-29");
  });

  it("período total não manda limite nenhum de data", () => {
    const p = params(
      drillCentroCusto({
        centroCustoId: CENTRO,
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
        centroCustoId: CENTRO,
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
        centroCustoId: CENTRO,
        periodo: { mes: "2026-07" },
        filtros: { categoriaId: CATEGORIA, fornecedorId: FORNECEDOR },
      }),
    );
    expect(p.categoria).toBe(CATEGORIA);
    expect(p.fornecedor).toBe(FORNECEDOR);
  });

  it("com incluirPrevisto, não trava o status", () => {
    // O relatório exclui cancelado SEMPRE, mas previsto só quando o usuário pediu.
    const p = params(
      drillCentroCusto({
        centroCustoId: CENTRO,
        periodo: { mes: "2026-07" },
        filtros: { incluirPrevisto: true },
      }),
    );
    expect(p.sem_cancelado).toBe("1");
    expect(p.status).toBeUndefined();
  });
});

describe("drillCategoriaCompetencia", () => {
  it("leva categoria, mês e o tipo da linha do DRE", () => {
    expect(
      params(
        drillCategoriaCompetencia({
          categoriaId: CATEGORIA,
          mes: "2026-07",
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
          mes: "2026-07",
          tipo: "a_pagar",
        }),
      ).tipo,
    ).toBe("a_pagar");
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
