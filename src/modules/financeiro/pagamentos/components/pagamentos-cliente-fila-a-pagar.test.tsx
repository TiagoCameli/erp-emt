import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { PagamentosCliente } from "@/modules/financeiro/pagamentos/components/pagamentos-cliente";
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

const VALORES = {
  busca: "",
  situacao: "",
  fornecedor: "",
  conta: "",
  valorDe: "",
  valorAte: "",
  vencDe: "",
  vencAte: "",
  progDe: "",
  progAte: "",
};

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
    montar(true, { valoresAPagar: { ...VALORES, situacao: "aprovado" } });

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
