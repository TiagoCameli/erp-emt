import { beforeEach, describe, expect, it, vi } from "vitest";

import { linksDosCards } from "@/modules/gestao/links-cards";

/**
 * Os três cartões de pagar do Painel ("Pago no mês", "Vence em até 7 dias" e
 * "A pagar em aberto") contam movimentação desde a D1 (03/10/2026): a prestação
 * de empréstimo paga pela conta é caixa. O que este arquivo trava é a outra
 * ponta: o destino do clique soma o MESMO conjunto, sem filtro de natureza.
 *
 * ## O limite deste teste
 *
 * O repo não tem banco em teste (nem PGlite nem Postgres local): a prova no
 * banco de verdade é `supabase/provas/caixa_movimentacao.sql`, que compara
 * `fn_rel_gestao_financeiro_resumo` com as parcelas. Aqui o número do cartão é o
 * predicado da função (`vw_parcelas_caixa`, tipo a pagar, paga, pagamento no
 * mês, soma do líquido) escrito à mão sobre uma base de mentira, e o destino é o
 * código REAL de `somaDasParcelasPagas` (o "Pago no filtro" da aba de pagas),
 * rodando sobre a mesma base por um dublê do PostgREST que interpreta os filtros
 * que ele monta. Se alguém puser um corte de natureza na tela de Pagamentos, ou
 * no link, o total do destino deixa de bater e o teste quebra.
 */

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));

const { somaDasParcelasPagas } = await import(
  "@/modules/financeiro/pagamentos/queries"
);

const HOJE = "2026-10-03";

interface ParcelaFalsa {
  id: string;
  lancamento_id: string;
  status: string;
  valor: number;
  desconto: number;
  juros: number;
  outras_despesas: number;
  valor_liquido: number;
  data_pagamento: string | null;
  data_vencimento: string;
  lancamentos: {
    tipo: string;
    status: string;
    natureza: "operacional" | "movimentacao";
    fornecedor_id: string | null;
    lancamento_rateios: { centro_custo_id: string }[];
  };
  lancamento_formas: null;
}

function parcela(
  id: string,
  campos: Partial<Omit<ParcelaFalsa, "lancamentos">> & {
    lancamento?: Partial<ParcelaFalsa["lancamentos"]>;
  },
): ParcelaFalsa {
  const { lancamento, ...resto } = campos;
  return {
    id,
    lancamento_id: `l-${id}`,
    status: "pago",
    valor: 0,
    desconto: 0,
    juros: 0,
    outras_despesas: 0,
    valor_liquido: 0,
    data_pagamento: "2026-10-01",
    data_vencimento: "2026-10-01",
    lancamento_formas: null,
    ...resto,
    lancamentos: {
      tipo: "a_pagar",
      status: "aprovado",
      natureza: "operacional",
      fornecedor_id: null,
      lancamento_rateios: [],
      ...lancamento,
    },
  };
}

/**
 * A base: uma prestação de empréstimo e um pagamento operacional no mês, mais
 * as três parcelas que nenhum dos dois lados pode contar.
 */
const BASE: ParcelaFalsa[] = [
  parcela("prestacao", {
    valor: 47_133.32,
    juros: 120.5,
    valor_liquido: 47_253.82,
    lancamento: { natureza: "movimentacao" },
  }),
  parcela("operacional", {
    valor: 18_400,
    desconto: 400,
    valor_liquido: 18_000,
    data_pagamento: "2026-10-02",
  }),
  // Paga no mês anterior.
  parcela("setembro", { valor: 999, valor_liquido: 999, data_pagamento: "2026-09-30" }),
  // Recebimento, não pagamento.
  parcela("recebida", {
    valor: 5_000,
    valor_liquido: 5_000,
    lancamento: { tipo: "a_receber" },
  }),
  // Lançamento cancelado não conta, nem pago.
  parcela("cancelado", {
    valor: 777,
    valor_liquido: 777,
    lancamento: { status: "cancelado" },
  }),
];

/**
 * O número do cartão "Pago no mês": o predicado de
 * `fn_rel_gestao_financeiro_resumo` sobre `vw_parcelas_caixa`, sem natureza.
 */
function pagoNoMesDoCartao(base: readonly ParcelaFalsa[], hoje: string) {
  const mes = hoje.slice(0, 7);
  const contadas = base.filter(
    (p) =>
      p.status === "pago" &&
      p.lancamentos.status !== "cancelado" &&
      p.lancamentos.tipo === "a_pagar" &&
      p.data_pagamento?.slice(0, 7) === mes,
  );
  return {
    contagem: contadas.length,
    valor:
      contadas.reduce((soma, p) => soma + Math.round(p.valor_liquido * 100), 0) /
      100,
  };
}

/** Lê `a.b.c` de uma linha. */
function ler(linha: unknown, caminho: string): unknown {
  return caminho
    .split(".")
    .reduce<unknown>(
      (atual, parte) =>
        atual !== null && typeof atual === "object"
          ? (atual as Record<string, unknown>)[parte]
          : undefined,
      linha,
    );
}

/**
 * Dublê do PostgREST: guarda cada filtro como predicado e aplica na base ao ser
 * aguardado. Só o que `somaDasParcelasPagas` usa sem centro, busca nem forma.
 */
class ConsultaFalsa {
  private predicados: ((linha: ParcelaFalsa) => boolean)[] = [];
  private faixa: [number, number] = [0, Number.MAX_SAFE_INTEGER];

  constructor(private readonly base: readonly ParcelaFalsa[]) {}

  private filtro(predicado: (linha: ParcelaFalsa) => boolean) {
    this.predicados.push(predicado);
    return this;
  }
  select() {
    return this;
  }
  eq(coluna: string, valor: string) {
    return this.filtro((l) => ler(l, coluna) === valor);
  }
  neq(coluna: string, valor: string) {
    return this.filtro((l) => ler(l, coluna) !== valor);
  }
  gte(coluna: string, valor: string | number) {
    return this.filtro((l) => {
      const v = ler(l, coluna);
      return v !== null && v !== undefined && (v as string | number) >= valor;
    });
  }
  lte(coluna: string, valor: string | number) {
    return this.filtro((l) => {
      const v = ler(l, coluna);
      return v !== null && v !== undefined && (v as string | number) <= valor;
    });
  }
  in(coluna: string, valores: readonly string[]) {
    return this.filtro((l) => valores.includes(ler(l, coluna) as string));
  }
  not() {
    throw new Error("filtro de embed inesperado: o link não leva forma nem centro");
  }
  or() {
    throw new Error("`or` inesperado: o link não leva busca");
  }
  order() {
    return this;
  }
  range(de: number, ate: number) {
    this.faixa = [de, ate];
    return this;
  }
  returns() {
    return this;
  }
  then<R>(resolver: (resposta: { data: ParcelaFalsa[]; error: null }) => R) {
    const linhas = this.base
      .filter((linha) => this.predicados.every((p) => p(linha)))
      .slice(this.faixa[0], this.faixa[1] + 1);
    return Promise.resolve({ data: linhas, error: null }).then(resolver);
  }
}

beforeEach(() => {
  from.mockReset();
  from.mockImplementation((tabela: string) => {
    if (tabela !== "lancamento_parcelas") {
      throw new Error(`consulta inesperada em ${tabela}`);
    }
    return new ConsultaFalsa(BASE);
  });
});

/**
 * O que a página de Pagamentos lê do link (`h_pago_de`/`h_pago_ate` viram
 * `pagamentoDe`/`pagamentoAte`), e nada mais: qualquer outro parâmetro no link
 * seria um corte que o cartão não fez.
 */
function filtrosDaAbaPagas(link: string) {
  const params = new URL(link, "https://erp.local").searchParams;
  return {
    pagamentoDe: params.get("h_pago_de") ?? undefined,
    pagamentoAte: params.get("h_pago_ate") ?? undefined,
  };
}

describe("cartões de pagar do Painel x destino do clique", () => {
  const links = linksDosCards({ hoje: HOJE, mesDoCusto: "2026-10" });

  it("os três links não levam filtro de natureza nem de categoria", () => {
    for (const link of [
      links.pagoNoMes,
      links.venceEmSeteDias,
      links.aPagarEmAberto,
    ]) {
      const params = new URL(link, "https://erp.local").searchParams;
      for (const chave of [
        "categoria",
        "h_categoria",
        "natureza",
        "sem_movimentacao",
        "sem_investimento",
      ]) {
        expect(params.has(chave), `${link} leva ${chave}`).toBe(false);
      }
      expect(link.startsWith("/financeiro/pagamentos")).toBe(true);
    }
    // O "Pago no mês" leva só a aba e o mês do pagamento.
    expect(
      [...new URL(links.pagoNoMes, "https://erp.local").searchParams.keys()].sort(),
    ).toEqual(["aba", "h_pago_ate", "h_pago_de"]);
  });

  it("'Pago no filtro' do destino bate com o 'Pago no mês', com a prestação dentro", async () => {
    const cartao = pagoNoMesDoCartao(BASE, HOJE);
    // As duas parcelas do mês, a de movimentação incluída.
    expect(cartao).toEqual({ contagem: 2, valor: 65_253.82 });

    const destino = await somaDasParcelasPagas(filtrosDaAbaPagas(links.pagoNoMes));

    expect(destino.parcelas).toBe(cartao.contagem);
    expect(destino.valorLiquido).toBe(cartao.valor);
  });

  it("sem a prestação, os dois lados caem juntos: o número não vem de outro lugar", async () => {
    const semPrestacao = BASE.filter((p) => p.id !== "prestacao");
    from.mockImplementation(() => new ConsultaFalsa(semPrestacao));

    const destino = await somaDasParcelasPagas(filtrosDaAbaPagas(links.pagoNoMes));

    expect(destino.valorLiquido).toBe(pagoNoMesDoCartao(semPrestacao, HOJE).valor);
    expect(destino.valorLiquido).toBe(18_000);
  });
});
