import { describe, expect, it } from "vitest";

import {
  aplicarCentroDaSubarvore,
  aplicarFiltrosPagas,
  filtrosPagasSchema,
  type ConsultaFiltravel,
  type FiltrosPagasValidados,
} from "@/modules/financeiro/pagamentos/filtros-pagas";
// `import type` é apagado na compilação, então o `server-only` do queries.ts não
// chega a rodar aqui -- é o mesmo caminho que o módulo sob teste já usa.
import type { FiltrosParcelasPagas } from "@/modules/financeiro/pagamentos/queries";

/**
 * `true` só quando os dois lados têm o MESMO conjunto de chaves. Faltando uma de
 * qualquer lado o tipo vira `never`, e atribuir `true` a `never` não compila.
 */
type MesmasChaves<A, B> = [keyof A] extends [keyof B]
  ? [keyof B] extends [keyof A]
    ? true
    : never
  : never;

const CHAVES_CONFEREM: MesmasChaves<
  FiltrosParcelasPagas,
  FiltrosPagasValidados
> = true;

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

/**
 * Os filtros que não tinham teste nenhum até 01/09/2026: centro de custo, etapa,
 * mês de referência, origem e período da compra.
 *
 * Todos partem de `lancamento_parcelas` e caem em coluna de `lancamentos`, que é
 * onde a troca de nome não dá erro nenhum: coluna errada devolve HTTP 400 e
 * coluna certa na TABELA errada devolve lista vazia -- que na tela é igualzinho a
 * "não há pagamento assim".
 */
describe("aplicarFiltrosPagas: as dimensões do lançamento", () => {
  it("mês de referência bate no primeiro dia, na coluna do lançamento", () => {
    // A coluna guarda o primeiro dia do mês; o campo da tela é yyyy-MM. Um `eq`
    // com "2026-08" não casaria com nada e a aba viria vazia.
    expect(montar({ mesCompetencia: "2026-08-01" })).toContainEqual({
      metodo: "eq",
      coluna: "lancamentos.mes_competencia",
      valor: "2026-08-01",
    });
  });

  it("origem é `eq` na coluna do lançamento", () => {
    expect(montar({ origem: "folha" })).toContainEqual({
      metodo: "eq",
      coluna: "lancamentos.origem",
      valor: "folha",
    });
  });

  it("período da compra é gte/lte em data_compra do lançamento", () => {
    const chamadas = montar({
      compraDe: "2026-07-01",
      compraAte: "2026-07-31",
    });
    expect(chamadas).toContainEqual({
      metodo: "gte",
      coluna: "lancamentos.data_compra",
      valor: "2026-07-01",
    });
    expect(chamadas).toContainEqual({
      metodo: "lte",
      coluna: "lancamentos.data_compra",
      valor: "2026-07-31",
    });
  });

  it("as três faixas de data são TRÊS colunas diferentes da parcela", () => {
    // Vencimento, autorização e pagamento são datas distintas da MESMA parcela.
    // Duas apontando para a mesma coluna dariam um recorte plausível e errado.
    const chamadas = montar({
      vencimentoDe: "2026-08-01",
      vencimentoAte: "2026-08-31",
      programadaDe: "2026-08-02",
      programadaAte: "2026-08-30",
      pagamentoDe: "2026-08-03",
      pagamentoAte: "2026-08-29",
    });
    expect(
      chamadas.filter((c) => c.metodo === "gte" || c.metodo === "lte"),
    ).toEqual([
      { metodo: "gte", coluna: "data_vencimento", valor: "2026-08-01" },
      { metodo: "lte", coluna: "data_vencimento", valor: "2026-08-31" },
      { metodo: "gte", coluna: "data_programada", valor: "2026-08-02" },
      { metodo: "lte", coluna: "data_programada", valor: "2026-08-30" },
      { metodo: "gte", coluna: "data_pagamento", valor: "2026-08-03" },
      { metodo: "lte", coluna: "data_pagamento", valor: "2026-08-29" },
    ]);
  });

  it("faixa de valor é gte/lte no valor da PARCELA", () => {
    const chamadas = montar({ valorDe: 100, valorAte: 5000 });
    expect(chamadas).toContainEqual({
      metodo: "gte",
      coluna: "valor",
      valor: 100,
    });
    expect(chamadas).toContainEqual({
      metodo: "lte",
      coluna: "valor",
      valor: 5000,
    });
  });

  it("LINHA DE CONTROLE: filtro em branco não manda nada ao banco", () => {
    // Sem isto, todo teste acima passaria numa função que filtrasse SEMPRE.
    expect(montar({})).toEqual([]);
  });
});

/**
 * O filtro de centro de custo e de etapa.
 *
 * É o que o Tiago mais usa e era o único sem teste: o par de chamadas morava
 * dentro do `queries.ts`, que é `server-only` e não entra em teste.
 *
 * O que se afirma aqui é o PEDIDO que sai, não o resultado: se o PostgREST honra
 * um filtro de embed de segundo nível é coisa que só se prova rodando
 * autenticado contra o projeto.
 */
describe("aplicarCentroDaSubarvore", () => {
  const RAIZ = "aaaa1111-1111-4111-8111-111111111111";
  const ETAPA_UM = "bbbb2222-2222-4222-8222-222222222222";
  const ETAPA_DOIS = "cccc3333-3333-4333-8333-333333333333";

  it("filtra o rateio do lançamento, DOIS níveis abaixo da parcela", () => {
    // A consulta parte de `lancamento_parcelas`: o centro está em
    // parcela > lancamentos > lancamento_rateios. Um nível a menos
    // ("lancamento_rateios.centro_custo_id") não existe a partir da parcela e
    // volta 400.
    const chamadas = aplicarCentroDaSubarvore(new ConsultaFalsa(), [
      RAIZ,
      ETAPA_UM,
      ETAPA_DOIS,
    ]).chamadas;

    expect(chamadas).toEqual([
      {
        metodo: "in",
        coluna: "lancamentos.lancamento_rateios.centro_custo_id",
        valor: [RAIZ, ETAPA_UM, ETAPA_DOIS],
      },
      {
        metodo: "not",
        coluna: "lancamentos.lancamento_rateios",
        valor: "is null",
      },
    ]);
  });

  it("escolher UMA etapa manda só a etapa, nunca a raiz", () => {
    // A escada substitui a raiz pela etapa (ver `centrosEfetivos`). Se a raiz
    // vazasse para cá, o recorte de um caminhão traria as outras carretas todas
    // -- e o total continuaria plausível, que é o que faz isso passar batido.
    const chamadas = aplicarCentroDaSubarvore(new ConsultaFalsa(), [
      ETAPA_UM,
    ]).chamadas;
    const filtro = chamadas.find((c) => c.metodo === "in");
    expect(filtro?.valor).toEqual([ETAPA_UM]);
    expect(filtro?.valor).not.toContain(RAIZ);
  });

  it("o `not is null` vai SEMPRE junto com o `in`", () => {
    // Sozinho, o `in` num embed não-inner só esvazia o embed: a parcela continua
    // na lista, agora com a coluna de centro em branco. Foi assim que a tabela
    // apareceu cheia de centro que ninguém filtrou.
    const chamadas = aplicarCentroDaSubarvore(new ConsultaFalsa(), [
      RAIZ,
    ]).chamadas;
    expect(chamadas.filter((c) => c.metodo === "not")).toHaveLength(1);
  });
});

/**
 * A validação que a action `buscarParcelasPagas` roda antes de ir ao banco.
 *
 * Este bloco existe por causa de um defeito de dez dias: o schema ficou na era
 * do seletor de escolha única (`fornecedorId`, `contaBancariaId`) e não
 * acompanhou centro de custo, etapa, categoria, forma, mês, origem e período da
 * compra. Como `z.object` DESCARTA chave desconhecida em silêncio, virar a
 * página da aba "Pagas" devolvia a lista SEM esses nove filtros, enquanto o
 * card "Pago no filtro" e a barra continuavam mostrando o recorte -- número
 * filtrado em cima de tabela não filtrada, o jeito mais silencioso possível de
 * mentir sobre dinheiro que saiu.
 *
 * Por isso o que se afirma aqui é que TODO campo atravessa a validação com o
 * valor intacto, um por um: um `toEqual` do objeto inteiro passaria a apagar
 * campo novo no dia em que alguém acrescentasse um só no fixture.
 */
describe("filtrosPagasSchema", () => {
  const FORNECEDOR = "11111111-1111-4111-8111-111111111111";
  const CONTA = "22222222-2222-4222-8222-222222222222";
  const CATEGORIA = "33333333-3333-4333-8333-333333333333";
  const FORMA = "44444444-4444-4444-8444-444444444444";
  const CENTRO = "55555555-5555-4555-8555-555555555555";
  const ETAPA = "66666666-6666-4666-8666-666666666666";

  /**
   * Um filtro com TODOS os campos preenchidos.
   *
   * `Required<FiltrosParcelasPagas>` é a trava: no dia em que a interface ganhar
   * um filtro novo, este fixture para de compilar e o `tsc` cobra o campo aqui
   * antes de a tela poder perdê-lo em silêncio.
   */
  const TODOS: Required<FiltrosParcelasPagas> = {
    busca: "amazonia",
    fornecedorIds: [FORNECEDOR],
    contaBancariaIds: [CONTA],
    valorDe: 100,
    valorAte: 5000,
    vencimentoDe: "2026-08-01",
    vencimentoAte: "2026-08-31",
    programadaDe: "2026-08-02",
    programadaAte: "2026-08-30",
    pagamentoDe: "2026-08-03",
    pagamentoAte: "2026-08-29",
    categoriaIds: [CATEGORIA],
    formaPagamentoIds: [FORMA],
    // Raiz e etapa viajam na MESMA lista (a dos centros efetivos), que é como a
    // aba guarda a escada de centro de custo na URL.
    centroCustoIds: [CENTRO, ETAPA],
    mesCompetencia: "2026-08-01",
    origem: "oc",
    compraDe: "2026-07-01",
    compraAte: "2026-07-31",
  };

  it("deixa passar TODOS os filtros da aba, campo por campo", () => {
    const validado = filtrosPagasSchema.safeParse(TODOS);
    expect(validado.success).toBe(true);
    if (!validado.success) return;

    for (const [campo, valor] of Object.entries(TODOS)) {
      expect(
        validado.data[campo as keyof typeof validado.data],
        `o filtro "${campo}" foi descartado na validação da action`,
      ).toEqual(valor);
    }
  });

  it("os campos validados são EXATAMENTE os da interface do filtro", () => {
    // A checagem que importa é a de tipo, na declaração de CHAVES_CONFEREM: se a
    // interface e o schema discordarem em uma chave, `MesmasChaves` vira `never`
    // e o `tsc` recusa o `= true`. O expect existe para o eslint ver a
    // constante usada -- e para o motivo aparecer no relatório do teste.
    expect(CHAVES_CONFEREM).toBe(true);
    expect(Object.keys(filtrosPagasSchema.shape).sort()).toEqual(
      Object.keys(TODOS).sort(),
    );
  });

  it("RECUSA chave desconhecida em vez de descartá-la em silêncio", () => {
    // `z.object` devolveria `success: true` com o campo apagado, e a action
    // seguiria para o banco sem ele. `strictObject` faz a action falhar alto: um
    // toast de erro é ruim, uma lista não filtrada apresentada como filtrada é
    // pior.
    const validado = filtrosPagasSchema.safeParse({
      ...TODOS,
      centroDeCusto: [CENTRO],
    });
    expect(validado.success).toBe(false);
  });

  it("recusa id que não é uuid e valor negativo", () => {
    expect(
      filtrosPagasSchema.safeParse({ centroCustoIds: ["' or 1=1 --"] }).success,
    ).toBe(false);
    expect(filtrosPagasSchema.safeParse({ valorDe: -1 }).success).toBe(false);
    expect(filtrosPagasSchema.safeParse({ origem: "qualquer" }).success).toBe(
      false,
    );
  });

  it("filtro em branco continua sendo filtro em branco", () => {
    const validado = filtrosPagasSchema.safeParse({});
    expect(validado.success).toBe(true);
    if (validado.success) expect(validado.data).toEqual({});
  });
});
