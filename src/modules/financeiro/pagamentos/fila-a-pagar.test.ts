import { describe, expect, it } from "vitest";

import {
  facetarFilaAPagar,
  filtrarFilaAPagar,
  valoresFiltrosAPagarSchema,
  VALORES_FILTROS_A_PAGAR_VAZIOS,
  type ValoresFiltrosAPagar,
} from "@/modules/financeiro/pagamentos/fila-a-pagar";
import type { ParcelaAprovada } from "@/modules/financeiro/pagamentos/queries";

const CARRETA = "11111111-1111-4111-8111-111111111111";
const ETAPA_CARRETA = "22222222-2222-4222-8222-222222222222";
const ESCRITORIO = "33333333-3333-4333-8333-333333333333";

function parcela(sobrescrever: Partial<ParcelaAprovada> = {}): ParcelaAprovada {
  return {
    id: "p1",
    lancamentoId: "l1",
    lancamentoNumero: "LAN-2026-2195",
    numeroParcela: 1,
    descricao: "REFERENTE SEGURO DOS CAMINHÕES/CARRETAS",
    categoriaNome: "Manutenção de equipamentos",
    fornecedorNome: "BANCO BRADESCO S/A",
    fornecedorId: "f1",
    contaBancariaId: "c1",
    dataVencimento: "2026-04-02",
    dataProgramada: "2026-04-02",
    dataProgramadaOrigem: null,
    valor: 11_848.99,
    aprovadoEm: null,
    status: "aprovado",
    categoriaId: "cat1",
    centroCustoIds: [CARRETA],
    formaPagamentoId: "forma1",
    mesCompetencia: "2026-03-01",
    dataCompra: "2026-03-25",
    origem: "manual",
    ...sobrescrever,
  };
}

const VAZIO = VALORES_FILTROS_A_PAGAR_VAZIOS;

function com(valores: Partial<ValoresFiltrosAPagar>): ValoresFiltrosAPagar {
  return { ...VAZIO, ...valores };
}

describe("filtrarFilaAPagar", () => {
  it("sem filtro nenhum devolve a fila inteira", () => {
    const fila = [parcela({ id: "a" }), parcela({ id: "b" })];
    expect(filtrarFilaAPagar(fila, VAZIO, null)).toHaveLength(2);
  });

  it("a busca casa número, descrição e fornecedor, sem caixa", () => {
    const fila = [
      parcela({ id: "a", descricao: "SEGURO DAS CARRETAS" }),
      parcela({ id: "b", descricao: "COMBUSTÍVEL", lancamentoNumero: "LAN-9" }),
    ];
    expect(
      filtrarFilaAPagar(fila, com({ busca: "seguro" }), null).map((p) => p.id),
    ).toEqual(["a"]);
    expect(
      filtrarFilaAPagar(fila, com({ busca: "bradesco" }), null),
    ).toHaveLength(2);
  });

  it("lista vazia é 'todos', não 'nenhum'", () => {
    // A armadilha do filtro por conjunto: com `new Set([])` o `has` recusa tudo
    // e a fila aparece zerada com o filtro em branco.
    const fila = [parcela({ fornecedorId: "f1" })];
    expect(filtrarFilaAPagar(fila, com({ fornecedorIds: [] }), null)).toHaveLength(
      1,
    );
    expect(
      filtrarFilaAPagar(fila, com({ fornecedorIds: ["outro"] }), null),
    ).toHaveLength(0);
  });

  it("o centro casa pela subárvore e contra TODOS os centros do rateio", () => {
    // Custo dividido entre a carreta e o Escritório tem que aparecer filtrando
    // por qualquer um dos dois lados.
    const dividida = parcela({ centroCustoIds: [ETAPA_CARRETA, ESCRITORIO] });
    const subarvoreDaCarreta = new Set([CARRETA, ETAPA_CARRETA]);
    expect(
      filtrarFilaAPagar([dividida], com({ centroIds: [CARRETA] }), subarvoreDaCarreta),
    ).toHaveLength(1);
    expect(
      filtrarFilaAPagar([dividida], com({ centroIds: [ESCRITORIO] }), new Set([ESCRITORIO])),
    ).toHaveLength(1);
    expect(
      filtrarFilaAPagar([dividida], com({ centroIds: ["outro"] }), new Set(["outro"])),
    ).toHaveLength(0);
  });

  it("parcela sem a data fica FORA de qualquer período pedido", () => {
    const semVencimento = parcela({ dataVencimento: null });
    expect(
      filtrarFilaAPagar([semVencimento], com({ vencDe: "2026-01-01" }), null),
    ).toHaveLength(0);
    // Sem período pedido ela continua na lista: o filtro não foi ligado.
    expect(filtrarFilaAPagar([semVencimento], VAZIO, null)).toHaveLength(1);
  });

  it("o mês do campo é yyyy-MM e a coluna é o primeiro dia do mês", () => {
    const fila = [parcela({ mesCompetencia: "2026-03-01" })];
    expect(filtrarFilaAPagar(fila, com({ mes: "2026-03" }), null)).toHaveLength(1);
    expect(filtrarFilaAPagar(fila, com({ mes: "2026-04" }), null)).toHaveLength(0);
  });

  it("a faixa de valor é inclusiva nas duas pontas", () => {
    const fila = [parcela({ valor: 100 })];
    expect(
      filtrarFilaAPagar(fila, com({ valorDe: "100", valorAte: "100" }), null),
    ).toHaveLength(1);
    expect(filtrarFilaAPagar(fila, com({ valorDe: "100.01" }), null)).toHaveLength(
      0,
    );
  });

  it("situação sem status explícito conta como aprovada", () => {
    // O campo é opcional na interface (o drawer reusa o mesmo contrato), e uma
    // parcela sem ele não pode sumir do filtro "aprovado".
    const fila = [parcela({ status: undefined })];
    expect(
      filtrarFilaAPagar(fila, com({ situacoes: ["aprovado"] }), null),
    ).toHaveLength(1);
    expect(
      filtrarFilaAPagar(fila, com({ situacoes: ["pendente"] }), null),
    ).toHaveLength(0);
  });
});

describe("valoresFiltrosAPagarSchema", () => {
  it("aceita o objeto que a página monta", () => {
    expect(valoresFiltrosAPagarSchema.safeParse(VAZIO).success).toBe(true);
  });

  it("RECUSA chave desconhecida em vez de descartá-la em silêncio", () => {
    // A trava contra o defeito que deixou a aba "Pagas" dez dias sem nove
    // filtros: `z.object` descartaria `inventado` e a planilha sairia sem ele,
    // com a barra da tela dizendo que estava filtrando.
    const resultado = valoresFiltrosAPagarSchema.safeParse({
      ...VAZIO,
      inventado: "x",
    });
    expect(resultado.success).toBe(false);
  });

  it("recusa origem fora da lista fechada do banco", () => {
    expect(
      valoresFiltrosAPagarSchema.safeParse(com({ origem: "inventada" })).success,
    ).toBe(false);
  });

  /**
   * A checagem de chaves: quebra o `tsc` no dia em que a interface ganhar um
   * filtro que o schema não conhece. Sem ela, o campo novo chega na action e é
   * recusado (ou pior, some) sem ninguém ver.
   */
  it("cobre TODAS as chaves da interface", () => {
    const doSchema = Object.keys(valoresFiltrosAPagarSchema.shape).sort();
    const daInterface = Object.keys(VAZIO).sort();
    expect(doSchema).toEqual(daInterface);
  });
});

describe("facetarFilaAPagar (filtros facetados)", () => {
  const fila = [
    parcela({ id: "a", fornecedorId: "f1", contaBancariaId: "c1", centroCustoIds: [CARRETA] }),
    parcela({ id: "b", fornecedorId: "f2", contaBancariaId: "c2", centroCustoIds: [ESCRITORIO] }),
    parcela({ id: "c", fornecedorId: "f2", contaBancariaId: "c1", status: "pendente" }),
  ];
  const opcoes = (...valores: string[]) => valores.map((valor) => ({ valor, rotulo: valor }));
  const valores = (lista: { valor: string }[]) => lista.map((opcao) => opcao.valor);

  it("as linhas são as mesmas de filtrarFilaAPagar", () => {
    const filtro = com({ fornecedorIds: ["f2"], situacoes: ["aprovado"] });
    expect(facetarFilaAPagar(fila, filtro, null).linhas).toEqual(
      filtrarFilaAPagar(fila, filtro, null),
    );
  });

  it("escolher o fornecedor restringe as contas e as situações; ele mesmo não", () => {
    const { opcoes: de } = facetarFilaAPagar(fila, com({ fornecedorIds: ["f1"] }), null);
    expect(valores(de("conta", opcoes("c1", "c2")))).toEqual(["c1"]);
    expect(valores(de("situacao", opcoes("aprovado", "pendente")))).toEqual(["aprovado"]);
    expect(valores(de("fornecedor", opcoes("f1", "f2")))).toEqual(["f1", "f2"]);
  });

  it("o escolhido nunca some, mesmo sem linha", () => {
    const { opcoes: de } = facetarFilaAPagar(
      fila,
      com({ fornecedorIds: ["f1"], contaIds: ["c2"] }),
      null,
    );
    expect(valores(de("conta", opcoes("c1", "c2")))).toEqual(["c1", "c2"]);
  });

  it("busca e valor restringem as opções sem serem restringidos", () => {
    const { opcoes: de } = facetarFilaAPagar(
      [parcela({ id: "x", fornecedorId: "f1", valor: 10 }), parcela({ id: "y", fornecedorId: "f2", valor: 500 })],
      com({ valorDe: "100" }),
      null,
    );
    expect(valores(de("fornecedor", opcoes("f1", "f2")))).toEqual(["f2"]);
  });

  it("o centro oferece a opção pela SUBÁRVORE dela", () => {
    const subarvoreDe = (id: string) =>
      id === CARRETA ? new Set([CARRETA, ETAPA_CARRETA]) : new Set([id]);
    const { opcoes: de } = facetarFilaAPagar(
      [parcela({ id: "e", fornecedorId: "f1", centroCustoIds: [ETAPA_CARRETA] })],
      com({ fornecedorIds: ["f1"] }),
      null,
      subarvoreDe,
    );
    expect(valores(de("centro", opcoes(CARRETA, ESCRITORIO)))).toEqual([CARRETA]);
  });
});
