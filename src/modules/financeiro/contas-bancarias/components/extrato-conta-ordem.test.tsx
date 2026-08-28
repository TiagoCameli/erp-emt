import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { formatarBRL } from "@/lib/formatadores";
import { montarExtrato } from "@/modules/financeiro/contas-bancarias/extrato";
import { ExtratoContaTabela } from "@/modules/financeiro/contas-bancarias/components/extrato-conta-tabela";
import type { ContaLista } from "@/modules/financeiro/contas-bancarias/queries";

/**
 * A PRIMEIRA LINHA DO EXTRATO TEM QUE MOSTRAR O SALDO ATUAL DA CONTA.
 *
 * É a leitura que a pessoa faz sem pensar: o cartão "Saldo atual" em cima diz um
 * número, e o extrato embaixo tem que começar nele. O que quebrava isso não era
 * conta errada — o acumulado sempre fechou —, era ORDEM: a tabela abria na
 * sequência crua do servidor (crescente), então o saldo atual estava na última
 * linha da última página. Com 25 por página e 69 movimentos, três páginas
 * adiante de onde a pessoa estava olhando.
 *
 * E ordenar a coluna por data não conserta, que foi a segunda tentativa: data
 * não tem hora. Ordenando por data decrescente, os DIAS invertem mas cada dia
 * fica internamente crescente, e o saldo atual cai no fim do primeiro bloco de
 * dia. Na tela real de 28/08/2026 isso pôs R$ 264.170,16 no topo com o saldo
 * atual (R$ 159.992,48) quatro linhas abaixo.
 *
 * Por isso este teste RENDERIZA a tabela e lê a primeira linha: a regra vive na
 * combinação de três coisas (o índice `ordem`, o comparador da coluna e a
 * ordenação inicial), e cada uma delas passa sozinha nos testes puros.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/financeiro/contas-bancarias/conta-1",
  useSearchParams: () => new URLSearchParams(),
}));

// O DataTable lê e grava preferência de coluna por Server Action, que usa
// cookies() — inexistente fora de uma requisição.
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

const CONTA: ContaLista = {
  id: "conta-1",
  nome: "BANCO DO BRASIL 102.124-9",
  banco: "bb",
  agencia: "1234",
  conta: "102.124-9",
  tipo: "corrente",
  saldoInicial: 155484.34,
  saldoInicialData: "2026-08-21",
  saldoAtual: 0, // sobrescrito abaixo pelo que o extrato fecha.
  movimentoAnteriorAoCorte: null,
  posicaoAplicacao: null,
  podeVerSaldo: true,
  ativo: true,
};

/**
 * O caso que a tela mostrou: quatro movimentos no MESMO 28/08 depois de um
 * 27/08. Se a ordem for por data, o dia 28/08 inteiro aparece internamente
 * crescente e a primeira linha não é a última do acumulado.
 */
function extratoDoCasoReal() {
  return montarExtrato(CONTA.saldoInicial, [
    linha("a", "2026-08-27", 210),
    linha("b", "2026-08-28", 898.63),
    linha("c", "2026-08-28", 100000),
    linha("d", "2026-08-28", 3009.68),
    linha("e", "2026-08-28", 1168),
  ]);
}

/**
 * O texto de dinheiro como o `getByText` enxerga.
 *
 * `formatarBRL` separa o "R$" com espaço NÃO SEPARÁVEL, e o normalizador do
 * testing-library troca o do DOM por espaço comum. Sem esta troca do lado da
 * busca, nenhum valor bate e a falha tem a cara de "o número não está na tela".
 * Mesmo helper de espelho/pagamentos/page.test.tsx.
 */
function brl(valor: number): string {
  return formatarBRL(valor).replace(/\u00a0/g, " ");
}

function linha(chave: string, data: string, valor: number) {
  return {
    chave,
    tipo: "parcela" as const,
    lancamentoId: null,
    data,
    entrada: false,
    valor,
    noSaldo: true,
    numero: `LAN-${chave}`,
    numeroDocumento: null,
    descricao: `MOVIMENTO ${chave.toUpperCase()}`,
    categoriaNome: null,
    contraparte: null,
    parcela: null,
  };
}

afterEach(() => {
  cleanup();
  limparEstadosTabelaParaTeste();
});

describe("ordem do extrato na tela", () => {
  it("abre com o saldo atual da conta na primeira linha", () => {
    const { movimentos, saldoFinal } = extratoDoCasoReal();

    render(
      <ExtratoContaTabela
        conta={{ ...CONTA, saldoAtual: saldoFinal }}
        movimentos={movimentos}
        escopo="saldo"
        podeVerLancamentos={false}
      />,
    );

    const linhas = screen.getAllByRole("row");
    // linhas[0] é o cabeçalho.
    const primeira = within(linhas[1]);

    // O movimento mais recente da sequência, não o mais antigo.
    expect(primeira.getByText("LAN-e")).toBeInTheDocument();
    // E o saldo dele é o mesmo número do cartão "Saldo atual".
    expect(primeira.getByText(brl(saldoFinal!))).toBeInTheDocument();
  });

  it("mostra os movimentos do dia mais recente para o mais antigo dentro do dia", () => {
    const { movimentos, saldoFinal } = extratoDoCasoReal();

    render(
      <ExtratoContaTabela
        conta={{ ...CONTA, saldoAtual: saldoFinal }}
        movimentos={movimentos}
        escopo="saldo"
        podeVerLancamentos={false}
      />,
    );

    const documentos = screen
      .getAllByText(/^LAN-[a-e]$/)
      .map((elemento) => elemento.textContent);

    // Exatamente o inverso da sequência do servidor, o dia de dentro incluído.
    expect(documentos).toEqual(["LAN-e", "LAN-d", "LAN-c", "LAN-b", "LAN-a"]);
  });

  it("a última linha é o movimento mais antigo, não o saldo atual", () => {
    // O contrário do primeiro teste, para ele não passar por acidente numa
    // tabela que exiba as linhas em qualquer ordem.
    const { movimentos, saldoFinal } = extratoDoCasoReal();

    render(
      <ExtratoContaTabela
        conta={{ ...CONTA, saldoAtual: saldoFinal }}
        movimentos={movimentos}
        escopo="saldo"
        podeVerLancamentos={false}
      />,
    );

    const linhas = screen.getAllByRole("row");
    // A última linha do corpo, antes do rodapé de totais.
    const ultima = within(linhas[5]);

    expect(ultima.getByText("LAN-a")).toBeInTheDocument();
    expect(ultima.getByText(brl(155274.34))).toBeInTheDocument();
  });
});
