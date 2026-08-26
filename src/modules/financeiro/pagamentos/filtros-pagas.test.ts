import { describe, expect, it } from "vitest";

import {
  aplicarFiltrosPagas,
  type ConsultaFiltravel,
} from "@/modules/financeiro/pagamentos/filtros-pagas";

/**
 * O histórico de pagamentos é paginado NO SERVIDOR: todo filtro dele vira
 * chamada no builder do PostgREST. Um filtro montado na coluna errada, ou com
 * só um dos ids escolhidos, não levanta erro nenhum — devolve lista vazia (ou
 * curta), que na tela é indistinguível de "não há pagamento assim".
 *
 * Por isso o dublê registra CADA chamada: o que se afirma aqui é o filtro que
 * saiu, não o resultado que ele traria.
 */

interface Chamada {
  metodo: string;
  coluna: string;
  valor: unknown;
}

class ConsultaFalsa implements ConsultaFiltravel<ConsultaFalsa> {
  chamadas: Chamada[] = [];

  private registrar(metodo: string, coluna: string, valor: unknown) {
    this.chamadas.push({ metodo, coluna, valor });
    return this;
  }

  eq(coluna: string, valor: string) {
    return this.registrar("eq", coluna, valor);
  }
  in(coluna: string, valores: readonly string[]) {
    return this.registrar("in", coluna, [...valores]);
  }
  gte(coluna: string, valor: string | number) {
    return this.registrar("gte", coluna, valor);
  }
  lte(coluna: string, valor: string | number) {
    return this.registrar("lte", coluna, valor);
  }
  or(filtro: string, opcoes?: { referencedTable?: string }) {
    return this.registrar("or", opcoes?.referencedTable ?? "", filtro);
  }
  // O par de `eq` em embed NÃO-inner: sem o `not`, a linha do pai vem mesmo com
  // o embed vazio. Quem usa é o filtro de forma de pagamento.
  not(coluna: string, operador: string, valor: null) {
    return this.registrar("not", coluna, `${operador} ${valor}`);
  }
}

const FORN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FORN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONTA_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CONTA_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function montar(filtros: Parameters<typeof aplicarFiltrosPagas>[1]) {
  return aplicarFiltrosPagas(new ConsultaFalsa(), filtros, []).chamadas;
}

describe("aplicarFiltrosPagas", () => {
  it("manda os DOIS fornecedores num in, na coluna do lançamento", () => {
    const chamadas = montar({ fornecedorIds: [FORN_A, FORN_B] });

    expect(chamadas).toEqual([
      // A coluna é qualificada porque fornecedor mora no lançamento, e o join é
      // `!inner`: sem o prefixo, o PostgREST procuraria a coluna na parcela.
      {
        metodo: "in",
        coluna: "lancamentos.fornecedor_id",
        valor: [FORN_A, FORN_B],
      },
    ]);
  });

  it("manda as DUAS contas num in, na coluna da parcela", () => {
    const chamadas = montar({ contaBancariaIds: [CONTA_A, CONTA_B] });

    expect(chamadas).toEqual([
      { metodo: "in", coluna: "conta_bancaria_id", valor: [CONTA_A, CONTA_B] },
    ]);
  });

  it("um id só continua indo, e vai como in de um item", () => {
    // Não vira `eq`: o caminho é um só, senão o filtro de um item e o de dois
    // seguem por códigos diferentes e um deles apodrece sem ninguém ver.
    expect(montar({ fornecedorIds: [FORN_A] })).toEqual([
      { metodo: "in", coluna: "lancamentos.fornecedor_id", valor: [FORN_A] },
    ]);
  });

  it("LINHA DE CONTROLE: lista vazia não filtra nada", () => {
    /*
     * Esta é a que precisa dar DIFERENTE das outras. Um `in` com lista vazia
     * traria zero linhas — o histórico apareceria em branco com o filtro em
     * branco, e ninguém suspeitaria do filtro. Nenhuma chamada é o certo.
     */
    expect(montar({ fornecedorIds: [], contaBancariaIds: [] })).toEqual([]);
    expect(montar({})).toEqual([]);
  });

  it("os filtros convivem: conta, fornecedor e período no mesmo pedido", () => {
    const chamadas = montar({
      contaBancariaIds: [CONTA_A, CONTA_B],
      fornecedorIds: [FORN_A, FORN_B],
      pagamentoDe: "2026-08-01",
      pagamentoAte: "2026-08-31",
    });

    expect(chamadas).toEqual([
      { metodo: "in", coluna: "conta_bancaria_id", valor: [CONTA_A, CONTA_B] },
      { metodo: "gte", coluna: "data_pagamento", valor: "2026-08-01" },
      { metodo: "lte", coluna: "data_pagamento", valor: "2026-08-31" },
      {
        metodo: "in",
        coluna: "lancamentos.fornecedor_id",
        valor: [FORN_A, FORN_B],
      },
    ]);
  });

  it("a busca continua indo no or() do lançamento", () => {
    const chamadas = aplicarFiltrosPagas(
      new ConsultaFalsa(),
      { busca: "diesel" },
      [FORN_A],
    ).chamadas;

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].metodo).toBe("or");
    expect(chamadas[0].coluna).toBe("lancamentos");
    expect(chamadas[0].valor).toContain("numero.ilike.%diesel%");
    expect(chamadas[0].valor).toContain(`fornecedor_id.in.(${FORN_A})`);
  });
});

/**
 * Categoria e forma passaram a aceitar mais de uma escolha, como fornecedor e
 * conta já aceitavam. O que se afirma aqui é o FILTRO que sai: `in` na coluna
 * certa, com todos os ids -- um filtro que mandasse só o primeiro devolveria uma
 * lista curta, que na tela é indistinguível de "não há pagamento assim".
 */
describe("categoria e forma em multipla escolha", () => {
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("duas categorias viram um `in` com os dois ids", () => {
    const consulta = aplicarFiltrosPagas(
      new ConsultaFalsa(),
      { categoriaIds: [A, B] },
      [],
    );
    expect(consulta.chamadas).toContainEqual({
      metodo: "in",
      coluna: "lancamentos.categoria_id",
      valor: [A, B],
    });
  });

  it("duas formas filtram o EMBED e ainda exigem o `not is null`", () => {
    // O par é obrigatório: `in` sozinho num embed não-inner só esvazia o embed, e
    // a parcela continua vindo na lista.
    const consulta = aplicarFiltrosPagas(
      new ConsultaFalsa(),
      { formaPagamentoIds: [A, B] },
      [],
    );
    expect(consulta.chamadas).toContainEqual({
      metodo: "in",
      coluna: "lancamento_formas.forma_pagamento_id",
      valor: [A, B],
    });
    expect(consulta.chamadas).toContainEqual({
      metodo: "not",
      coluna: "lancamento_formas",
      // O dublê guarda o par operador+valor como texto ("is null").
      valor: "is null",
    });
  });

  it("CONTROLE: lista VAZIA não filtra nada", () => {
    // Sem isto, uma lista vazia viraria `in (...)` sem valor e a tela apareceria
    // zerada -- que é o oposto de "sem filtro".
    const consulta = aplicarFiltrosPagas(
      new ConsultaFalsa(),
      { categoriaIds: [], formaPagamentoIds: [] },
      [],
    );
    expect(
      consulta.chamadas.filter((c) => c.coluna.includes("categoria_id")),
    ).toEqual([]);
    expect(
      consulta.chamadas.filter((c) => c.coluna.includes("forma_pagamento_id")),
    ).toEqual([]);
  });
});
