import { describe, expect, it } from "vitest";

import {
  aplicarNaturezaNoRateio,
  filtroDeNatureza,
  naturezasAceitas,
  type ConsultaComNatureza,
} from "@/modules/financeiro/lancamentos/natureza-no-embed";
import { lerFiltrosLancamentos } from "@/modules/financeiro/lancamentos/filtros";

/**
 * Dublê do builder do PostgREST: anota cada chamada, que é o que vira a URL.
 * Mesma técnica de `recorte-no-embed.test.ts`.
 */
class ConsultaFalsa implements ConsultaComNatureza<ConsultaFalsa> {
  chamadas: string[] = [];

  private anotar(...partes: (string | null | undefined)[]): ConsultaFalsa {
    this.chamadas.push(partes.filter((p) => p != null).join(" "));
    return this;
  }

  is(coluna: string, valor: null) {
    return this.anotar("is", coluna, String(valor));
  }
  not(coluna: string, operador: string, valor: string | null) {
    return this.anotar("not", coluna, operador, String(valor));
  }
  or(filtro: string) {
    return this.anotar("or", filtro);
  }
  filter(coluna: string, operador: string, valor: string) {
    return this.anotar("filter", coluna, operador, valor);
  }
}

const OPERACIONAL = "11111111-1111-4111-8111-111111111111";
const EMPRESTIMO = "22222222-2222-4222-8222-222222222222";
const EQUIPAMENTO = "33333333-3333-4333-8333-333333333333";
const TARIFA = "44444444-4444-4444-8444-444444444444";

const CADASTRO = [
  { id: OPERACIONAL, natureza: "operacional" },
  { id: EMPRESTIMO, natureza: "movimentacao" },
  { id: EQUIPAMENTO, natureza: "investimento" },
  { id: TARIFA, natureza: "financeira" },
];

describe("naturezasAceitas", () => {
  it("sem nenhum dos três parâmetros, não filtra", () => {
    expect(naturezasAceitas({})).toBeNull();
    expect(naturezasAceitas({ naturezas: [] })).toBeNull();
  });

  it("o corte de resultado tira movimentação e investimento", () => {
    expect(
      naturezasAceitas({ semMovimentacao: true, semInvestimento: true }),
    ).toEqual(["operacional", "financeira"]);
  });

  it("sem_movimentacao também tira distribuição a sócio e mútuo (fora do resultado)", () => {
    expect(
      naturezasAceitas({ naturezas: ["distribuicao", "mutuo", "operacional"], semMovimentacao: true }),
    ).toEqual(["operacional"]);
  });

  it("com Incluir investimentos, só a movimentação sai", () => {
    expect(naturezasAceitas({ semMovimentacao: true })).toEqual([
      "operacional",
      "financeira",
      "investimento",
    ]);
  });

  it("os três se combinam, e o pedido contraditório dá lista vazia", () => {
    expect(
      naturezasAceitas({ naturezas: ["movimentacao"], semMovimentacao: true }),
    ).toEqual([]);
    expect(
      naturezasAceitas({ naturezas: ["operacional", "investimento"], semInvestimento: true }),
    ).toEqual(["operacional"]);
  });
});

describe("filtroDeNatureza", () => {
  it("lista as categorias RECUSADAS, que são poucas", () => {
    const filtro = filtroDeNatureza(["operacional", "financeira"], CADASTRO);
    expect(filtro.recusadas).toEqual([EMPRESTIMO, EQUIPAMENTO]);
    expect(filtro.semCategoriaAceita).toBe(true);
  });

  it("categoria sem natureza conta como operacional, igual ao banco", () => {
    const filtro = filtroDeNatureza(["investimento"], [
      { id: OPERACIONAL, natureza: null },
      { id: EQUIPAMENTO, natureza: "investimento" },
    ]);
    expect(filtro.recusadas).toEqual([OPERACIONAL]);
    // Sem categoria = operacional, que não foi aceita aqui.
    expect(filtro.semCategoriaAceita).toBe(false);
  });
});

describe("aplicarNaturezaNoRateio", () => {
  it("monta os dois ramos: rateio com categoria aceita, ou herdada do lançamento", () => {
    const consulta = aplicarNaturezaNoRateio(
      new ConsultaFalsa(),
      filtroDeNatureza(["operacional", "financeira"], CADASTRO),
    );
    expect(consulta.chamadas).toEqual([
      "not natureza_rateios.categoria_id is null",
      `not natureza_rateios.categoria_id in (${EMPRESTIMO},${EQUIPAMENTO})`,
      "is natureza_rateios_herdados.categoria_id null",
      // O lançamento SEM categoria entra no ramo 2 (é operacional), por isso o
      // `is.null` explícito: `not.in` sozinho o descartaria.
      `or natureza_rateios.not.is.null,and(natureza_rateios_herdados.not.is.null,or(categoria_id.is.null,categoria_id.not.in.(${EMPRESTIMO},${EQUIPAMENTO})))`,
    ]);
  });

  it("sem operacional aceita, o lançamento sem categoria não herda", () => {
    const consulta = aplicarNaturezaNoRateio(
      new ConsultaFalsa(),
      filtroDeNatureza(["investimento"], CADASTRO),
    );
    expect(consulta.chamadas.at(-1)).toBe(
      `or natureza_rateios.not.is.null,and(natureza_rateios_herdados.not.is.null,categoria_id.in.(${EQUIPAMENTO}))`,
    );
  });

  it("uma natureza só manda as ACEITAS, para a URL não passar de 8 KB", () => {
    // O drill do DRE pede `natureza=investimento`: as recusadas seriam quase o
    // cadastro inteiro, duas vezes na URL.
    const cadastroGrande = [
      ...CADASTRO,
      ...Array.from({ length: 150 }, (_, i) => ({
        id: `55555555-5555-4555-8555-${String(i).padStart(12, "0")}`,
        natureza: "operacional",
      })),
    ];
    const consulta = aplicarNaturezaNoRateio(
      new ConsultaFalsa(),
      filtroDeNatureza(["investimento"], cadastroGrande),
    );
    expect(consulta.chamadas).toContain(
      `filter natureza_rateios.categoria_id in (${EQUIPAMENTO})`,
    );
    expect(consulta.chamadas.join(" ").length).toBeLessThan(500);
  });

  it("nada recusado e operacional aceita: o ramo 2 é só existir rateio herdado", () => {
    const consulta = aplicarNaturezaNoRateio(new ConsultaFalsa(), {
      recusadas: [],
      aceitas: [OPERACIONAL],
      semCategoriaAceita: true,
    });
    expect(
      consulta.chamadas.some((chamada) => chamada.includes("categoria_id in")),
    ).toBe(false);
    expect(consulta.chamadas.at(-1)).toBe(
      "or natureza_rateios.not.is.null,natureza_rateios_herdados.not.is.null",
    );
  });
});

describe("a URL da lista lê os três parâmetros", () => {
  it("sem_movimentacao e sem_investimento ligam só no literal 1", () => {
    const { filtros, valores } = lerFiltrosLancamentos({
      sem_movimentacao: "1",
      sem_investimento: "sim",
    });
    expect(filtros.semMovimentacao).toBe(true);
    expect(filtros.semInvestimento).toBeUndefined();
    expect(valores.semMovimentacao).toBe("1");
    expect(valores.semInvestimento).toBe("");
  });

  it("natureza é lista validada contra o catálogo", () => {
    const { filtros } = lerFiltrosLancamentos({
      natureza: "investimento,inventada,operacional",
    });
    // Na ordem do catálogo, sem o valor que não existe.
    expect(filtros.naturezas).toEqual(["operacional", "investimento"]);
  });

  it("sem os parâmetros, a lista não corta natureza nenhuma", () => {
    const { filtros } = lerFiltrosLancamentos({});
    expect(
      naturezasAceitas({
        naturezas: filtros.naturezas,
        semMovimentacao: filtros.semMovimentacao,
        semInvestimento: filtros.semInvestimento,
      }),
    ).toBeNull();
  });
});
