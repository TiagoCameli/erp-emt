import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { PagamentosCliente,
  FILTROS_A_PAGAR_VAZIOS,
} from "@/modules/financeiro/pagamentos/components/pagamentos-cliente";
import type { ParcelaAprovada } from "@/modules/financeiro/pagamentos/queries";

/**
 * A fila "A pagar" passou a mostrar parcela NÃO aprovada junto com a aprovada.
 * A regra que este arquivo prende: quem não está aprovada não ganha botão de
 * pagar, não entra no lote, mas continua contada nos cards.
 *
 * É teste de tela (e não só de `resumo.ts`) porque o defeito que ele evita é
 * visual: um botão "Pagar" numa linha pendente que o banco recusaria, e uma
 * contagem de lote maior do que o que vai ser pago de fato.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/financeiro/pagamentos",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

vi.mock("@/modules/financeiro/pagamentos/actions", () => ({
  buscarParcelasPagas: vi.fn(async () => ({ itens: [], total: 0 })),
  estornarPagamento: vi.fn(async () => ({ ok: true })),
  pagarParcela: vi.fn(async () => ({ ok: true })),
  detalheDaParcela: vi.fn(async () => ({ erro: "não usado neste teste" })),
}));

const APROVADA = "11111111-1111-4111-8111-111111111111";
const PENDENTE = "22222222-2222-4222-8222-222222222222";
const EM_REVISAO = "33333333-3333-4333-8333-333333333333";

function parcela(troca: Partial<ParcelaAprovada> = {}): ParcelaAprovada {
  return {
    id: APROVADA,
    lancamentoId: "44444444-4444-4444-8444-444444444444",
    lancamentoNumero: "LAN-2026-0015",
    numeroParcela: 1,
    descricao: "Diesel S10",
    categoriaNome: "Combustível",
    fornecedorNome: "Areacre",
    fornecedorId: null,
    contaBancariaId: null,
    dataVencimento: "2026-08-25",
    dataProgramada: "2026-08-25",
    dataProgramadaOrigem: null,
    valor: 1000,
    aprovadoEm: null,
    status: "aprovado",
    ...troca,
  };
}

const FILA: ParcelaAprovada[] = [
  parcela({ id: APROVADA, status: "aprovado", valor: 1000 }),
  parcela({
    id: PENDENTE,
    status: "pendente",
    valor: 300,
    lancamentoNumero: "LAN-2026-0016",
    numeroParcela: 2,
  }),
  parcela({
    id: EM_REVISAO,
    status: "em_revisao",
    valor: 200,
    lancamentoNumero: "LAN-2026-0017",
    numeroParcela: 3,
  }),
];

const FORN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FORN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FORN_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CONTA_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CONTA_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CONTA_C = "ffffffff-ffff-4fff-8fff-ffffffffffff";

/** Mesma fila, com um fornecedor DIFERENTE em cada parcela. */
const FILA_POR_FORNECEDOR: ParcelaAprovada[] = [
  { ...FILA[0], fornecedorId: FORN_A, fornecedorNome: "Areacre" },
  { ...FILA[1], fornecedorId: FORN_B, fornecedorNome: "Vibra" },
  { ...FILA[2], fornecedorId: FORN_C, fornecedorNome: "Fox Pneus" },
];

/** Mesma fila, com uma conta bancária DIFERENTE em cada parcela. */
const FILA_POR_CONTA: ParcelaAprovada[] = [
  { ...FILA[0], contaBancariaId: CONTA_A },
  { ...FILA[1], contaBancariaId: CONTA_B },
  { ...FILA[2], contaBancariaId: CONTA_C },
];

const VALORES = FILTROS_A_PAGAR_VAZIOS;

function montar(
  podePagar = true,
  extras: Partial<React.ComponentProps<typeof PagamentosCliente>> = {},
) {
  return render(
    <PagamentosCliente
      aprovadas={FILA}
      pagas={[]}
      totalPagas={0}
      somaPagas={0}
      contas={[
        { id: "conta-1", nome: "Obra 364", banco: "bb", saldoAtual: 50000 },
      ]}
      fornecedores={[]}
      categorias={[]}
      centrosCusto={[]}
      formasPagamento={[]}
      podePagar={podePagar}
      podeEstornar={false}
      hoje="2026-08-19"
      valoresAPagar={VALORES}
      valoresPagas={{ ...VALORES, pagoDe: "", pagoAte: "" }}
      filtrosPagas={{}}
      {...extras}
    />,
  );
}

function marcar(id: string) {
  fireEvent.click(screen.getByRole("checkbox", { name: `Selecionar ${id}` }));
}

afterEach(() => {
  cleanup();
  limparEstadosTabelaParaTeste();
});

describe("Fila a pagar com parcelas não aprovadas", () => {
  it("mostra a situação real de cada linha", () => {
    montar();
    expect(screen.getByText("Aprovado")).toBeInTheDocument();
    expect(screen.getByText("Pendente")).toBeInTheDocument();
    expect(screen.getByText("Em revisão")).toBeInTheDocument();
  });

  it("só a parcela aprovada ganha botão de pagar", () => {
    montar();
    // Três linhas, um botão: o banco recusaria as outras duas, então oferecer
    // o botão nelas seria prometer uma ação que a `fn_pagar_parcela` nega.
    expect(screen.getAllByRole("button", { name: "Pagar" })).toHaveLength(1);
  });

  it("sem permissão de pagar, nenhuma linha tem botão", () => {
    montar(false);
    expect(
      screen.queryByRole("button", { name: "Pagar" }),
    ).not.toBeInTheDocument();
  });

  it("o lote conta só as aprovadas, e diz isso no botão", () => {
    montar();
    marcar(APROVADA);
    marcar(PENDENTE);

    // Duas marcadas, uma pagável: o rótulo tem que denunciar a diferença, senão
    // o operador manda pagar duas e vê uma acontecer sem entender por quê.
    expect(
      screen.getByRole("button", { name: "Pagar 1 aprovadas" }),
    ).toBeInTheDocument();
  });

  it("marcando só aprovadas, o botão não fala em aprovadas", () => {
    montar();
    marcar(APROVADA);
    expect(screen.getByRole("button", { name: "Pagar 1" })).toBeInTheDocument();
  });

  it("com nenhuma aprovada marcada, o botão de pagar em lote fica travado", () => {
    montar();
    marcar(PENDENTE);
    marcar(EM_REVISAO);
    expect(screen.getByRole("button", { name: "Pagar 0 aprovadas" })).toBeDisabled();
  });

  /**
   * O valor do card e o da linha da tabela são o mesmo texto na tela (R$
   * 1.000,00 é o card "Pronto para pagar" e também a parcela aprovada), então a
   * busca é ancorada no CARD pelo título dele. Procurar o texto solto acharia
   * dois elementos e o teste passaria a testar a tabela.
   */
  function valorDoCard(titulo: string): string {
    const rotulo = screen.getByText(titulo);
    return rotulo.closest("article, div[class*=rounded]")?.textContent ?? "";
  }

  it("os cards resumem o filtro inteiro antes de qualquer seleção", () => {
    montar();
    // Total 1.500,00 = 1.000 + 300 + 200; pronto para pagar = 1.000 (a única
    // aprovada); aguardando aprovação = 500 (pendente + em revisão).
    expect(valorDoCard("Total a pagar")).toContain("1.500,00");
    expect(valorDoCard("Pronto para pagar")).toContain("1.000,00");
    expect(valorDoCard("Aguardando aprovação")).toContain("500,00");
    expect(valorDoCard("Vencido")).toContain("0,00");
    // Controle do próprio helper: se o `closest` pegasse um container grande
    // demais, todo card conteria todo valor e as quatro linhas acima passariam
    // sem provar nada.
    expect(valorDoCard("Pronto para pagar")).not.toContain("1.500,00");
    expect(valorDoCard("Vencido")).not.toContain("1.000,00");
  });

  /**
   * É este filtro que faz o cartão "Vence em até 7 dias" do Painel (que conta
   * SÓ aprovadas) cair numa lista cujo total é o número do cartão. Sem ele, o
   * destino somaria também as pendentes e mostraria mais dinheiro.
   */
  it("o filtro de situação recorta a fila", () => {
    montar(true, { valoresAPagar: { ...VALORES, situacoes: ["aprovado"] } });

    // "Aprovado" aparece duas vezes de propósito: no selo da linha e no próprio
    // filtro, que mostra a situação escolhida.
    expect(screen.getAllByText("Aprovado").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Pendente")).not.toBeInTheDocument();
    expect(screen.queryByText("Em revisão")).not.toBeInTheDocument();
    // Uma linha só na tabela, e o card acompanha: R$ 1.000,00, não os
    // R$ 1.500,00 da fila inteira.
    expect(screen.getAllByRole("button", { name: "Pagar" })).toHaveLength(1);
    expect(valorDoCard("Total a pagar")).toContain("1.000,00");
    expect(valorDoCard("Total a pagar")).not.toContain("1.500,00");
  });

  /*
   * Os três testes abaixo prendem a MÚLTIPLA escolha, que é o que o Tiago pediu
   * na fila: "tem que selecionar mais de um fornecedor, situação ou conta".
   *
   * Cada um deles tem uma LINHA DE CONTROLE: o total do card precisa ser
   * diferente do total de UMA escolha e diferente do total da fila inteira.
   * Sem isso, um filtro que ignorasse a segunda escolha (o defeito antigo) ou um
   * que ignorasse o filtro todo passariam nos dois casos.
   */

  it("duas situações trazem as duas, e só elas", () => {
    montar(true, {
      valoresAPagar: { ...VALORES, situacoes: ["aprovado", "pendente"] },
    });

    expect(screen.getAllByText("Aprovado").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Pendente").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Em revisão")).not.toBeInTheDocument();
    // 1.000 + 300. Nem 1.000 (só aprovado) nem 1.500 (a fila toda).
    expect(valorDoCard("Total a pagar")).toContain("1.300,00");
    expect(valorDoCard("Total a pagar")).not.toContain("1.000,00");
    expect(valorDoCard("Total a pagar")).not.toContain("1.500,00");
  });

  it("dois fornecedores trazem os dois, e só eles", () => {
    montar(true, {
      aprovadas: FILA_POR_FORNECEDOR,
      valoresAPagar: { ...VALORES, fornecedorIds: [FORN_A, FORN_B] },
    });

    expect(screen.getByText("Areacre")).toBeInTheDocument();
    expect(screen.getByText("Vibra")).toBeInTheDocument();
    expect(screen.queryByText("Fox Pneus")).not.toBeInTheDocument();
    // 1.000 + 300, com os R$ 200 do terceiro fornecedor de fora.
    expect(valorDoCard("Total a pagar")).toContain("1.300,00");
    expect(valorDoCard("Total a pagar")).not.toContain("1.500,00");
  });

  it("duas contas bancárias trazem as duas, e só elas", () => {
    montar(true, {
      aprovadas: FILA_POR_CONTA,
      valoresAPagar: { ...VALORES, contaIds: [CONTA_A, CONTA_B] },
    });

    expect(screen.getAllByRole("row")).toHaveLength(3); // cabeçalho + 2 linhas
    expect(valorDoCard("Total a pagar")).toContain("1.300,00");
    expect(valorDoCard("Total a pagar")).not.toContain("1.500,00");
  });

  it("lista vazia é TODOS, e não nenhum", () => {
    // A armadilha do `Set`: com lista vazia, `has` recusaria toda parcela e a
    // fila apareceria em branco — filtro nenhum aplicado parecendo "sem
    // resultado". O total tem que ser o da fila inteira.
    montar(true, {
      valoresAPagar: {
        ...VALORES,
        situacoes: [],
        fornecedorIds: [],
        contaIds: [],
      },
    });

    expect(screen.getAllByText("Aprovado").length).toBeGreaterThanOrEqual(1);
    expect(valorDoCard("Total a pagar")).toContain("1.500,00");
  });

  it("abre direto na aba Pagas quando o Painel manda", () => {
    montar(true, { abaInicial: "pagas" });
    expect(screen.getByRole("tab", { name: "Pagas" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("na aba Pagas os cards falam do histórico, não da fila", () => {
    montar(true, { abaInicial: "pagas", somaPagas: 1835626.54, totalPagas: 177 });
    // O número do cartão "Pago no mês" do Painel, confirmado no destino.
    expect(screen.getByText("Pago no filtro")).toBeInTheDocument();
    expect(valorDoCard("Pago no filtro")).toContain("1.835.626,54");
    expect(screen.queryByText("Total a pagar")).not.toBeInTheDocument();
  });

  it("marcando linhas, os cards passam a resumir só o marcado", () => {
    montar();
    marcar(PENDENTE);

    expect(screen.getByText("Selecionado")).toBeInTheDocument();
    expect(valorDoCard("Selecionado")).toContain("300,00");
    // A pendente marcada não pode aparecer como pronta para pagar.
    expect(valorDoCard("Pronto para pagar")).toContain("0,00");
    expect(valorDoCard("Aguardando aprovação")).toContain("300,00");
    expect(screen.queryByText("Total a pagar")).not.toBeInTheDocument();
  });
});

/**
 * O filtro de centro de custo é o único da fila que não compara igualdade: ele
 * compara a SUBÁRVORE do centro escolhido contra TODOS os centros do rateio.
 *
 * Os dois casos que importam: a parcela pendurada num EQUIPAMENTO tem de
 * aparecer quando se escolhe a manutenção (é a pergunta do dono), e a parcela de
 * outra obra tem de sair. Sem o segundo, um filtro que ignorasse o parâmetro
 * passaria no primeiro.
 */
describe("o filtro de centro de custo da fila", () => {
  const MANUT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const BOBCAT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const OBRA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  const CENTROS = [
    { id: MANUT, nome: "Manutenção", codigo: null, paiId: null, tipo: "manutencao" },
    { id: BOBCAT, nome: "Bobcat MC110C - 01", codigo: null, paiId: MANUT, tipo: null },
    { id: OBRA, nome: "009 - BR-364", codigo: null, paiId: null, tipo: "obra" },
  ];

  const DUAS = [
    parcela({
      id: APROVADA,
      lancamentoNumero: "LAN-DO-EQUIPAMENTO",
      // Pendurada no EQUIPAMENTO, não na raiz.
      centroCustoIds: [BOBCAT],
    }),
    parcela({
      id: PENDENTE,
      status: "pendente",
      lancamentoNumero: "LAN-DA-OBRA",
      centroCustoIds: [OBRA],
    }),
  ];

  function montarComCentro(centroIds: string[]) {
    render(
      <PagamentosCliente
        aprovadas={DUAS}
        pagas={[]}
        totalPagas={0}
        somaPagas={0}
        contas={[]}
        fornecedores={[]}
        categorias={[]}
        centrosCusto={CENTROS}
        formasPagamento={[]}
        podePagar
        podeEstornar={false}
        hoje="2026-08-26"
        valoresAPagar={{ ...FILTROS_A_PAGAR_VAZIOS, centroIds }}
        valoresPagas={{ ...FILTROS_A_PAGAR_VAZIOS, pagoDe: "", pagoAte: "" }}
        filtrosPagas={{}}
      />,
    );
  }

  it("escolher a manutenção acha a parcela do EQUIPAMENTO", () => {
    montarComCentro([MANUT]);
    expect(screen.getByText("LAN-DO-EQUIPAMENTO")).toBeInTheDocument();
    expect(screen.queryByText("LAN-DA-OBRA")).not.toBeInTheDocument();
  });

  it("CONTROLE: escolher a obra deixa de fora a do equipamento", () => {
    montarComCentro([OBRA]);
    expect(screen.getByText("LAN-DA-OBRA")).toBeInTheDocument();
    expect(screen.queryByText("LAN-DO-EQUIPAMENTO")).not.toBeInTheDocument();
  });

  it("sem filtro de centro, as duas aparecem", () => {
    montarComCentro([]);
    expect(screen.getByText("LAN-DO-EQUIPAMENTO")).toBeInTheDocument();
    expect(screen.getByText("LAN-DA-OBRA")).toBeInTheDocument();
  });

  /**
   * A capacidade nova: DOIS centros marcados ao mesmo tempo.
   *
   * O par com o caso de um centro só é o que dá valor a este: se o filtro
   * ignorasse tudo menos o primeiro id, o caso de um centro passaria e este
   * traria uma linha a menos. E é UNIÃO, não interseção -- marcar duas obras é
   * "quero as duas", e nenhuma parcela pertence às duas ao mesmo tempo aqui.
   */
  it("marcar a manutenção E a obra traz as duas linhas", () => {
    montarComCentro([MANUT, OBRA]);
    expect(screen.getByText("LAN-DO-EQUIPAMENTO")).toBeInTheDocument();
    expect(screen.getByText("LAN-DA-OBRA")).toBeInTheDocument();
  });

  it("CONTROLE: um centro que não é de ninguém esvazia a lista", () => {
    // Sem este caso, um filtro que devolvesse a lista inteira quando não achasse
    // nada passaria em todos os outros.
    montarComCentro(["99999999-9999-4999-8999-999999999999"]);
    expect(screen.queryByText("LAN-DO-EQUIPAMENTO")).not.toBeInTheDocument();
    expect(screen.queryByText("LAN-DA-OBRA")).not.toBeInTheDocument();
  });
});
