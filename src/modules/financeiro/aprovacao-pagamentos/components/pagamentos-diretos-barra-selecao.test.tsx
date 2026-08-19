import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PagamentosDiretos } from "@/modules/financeiro/aprovacao-pagamentos/components/pagamentos-diretos";
import type { PagamentoDireto } from "@/modules/financeiro/aprovacao-pagamentos/queries";

/**
 * Costura da barra de seleção da aba de dinheiro e cartão com o BotaoEspelho,
 * no mesmo molde de ordens-tabela-barra-selecao.test.tsx. Mesmo motivo de lá: o
 * fio entre checkbox, barra e botão não aparece em teste unitário.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/financeiro/aprovacao-pagamentos",
  useSearchParams: () => new URLSearchParams(),
}));

// O DataTable busca e salva a preferência de coluna por Server Action, e Server
// Action usa cookies(), que não existe fora de uma requisição.
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

vi.mock("@/modules/financeiro/aprovacao-pagamentos/actions", () => ({
  marcarParcelaConferida: vi.fn(async () => ({ ok: true })),
  marcarParcelasConferidasEmLote: vi.fn(async () => ({
    ok: true,
    marcadas: 1,
  })),
}));

// A DataTable guarda a personalização de colunas no localStorage, que o jsdom
// desta configuração não fornece completo. Stub mínimo, só para o render passar.
beforeAll(() => {
  const memoria = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (chave: string) => memoria.get(chave) ?? null,
      setItem: (chave: string, valor: string) => void memoria.set(chave, valor),
      removeItem: (chave: string) => void memoria.delete(chave),
      clear: () => memoria.clear(),
      key: () => null,
      length: 0,
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "66666666-6666-4666-8666-666666666666";

function pagamento(
  sobrescreve: Partial<PagamentoDireto> = {},
): PagamentoDireto {
  return {
    id: ID_A,
    numeroParcela: 1,
    totalParcelas: 1,
    valor: 250.5,
    desconto: 0,
    valorLiquido: 250.5,
    dataVencimento: "2026-08-14",
    dataPagamento: "2026-08-14",
    status: "pago",
    lancamentoId: "22222222-2222-4222-8222-222222222222",
    lancamentoNumero: "LAN-2026-0031",
    lancamentoDescricao: "Diesel do caminhão pipa",
    fornecedorNome: "POSTO CENTRAL",
    origem: "manual",
    origemId: null,
    origemNumero: null,
    categoriaNome: "Combustível",
    formaPagamentoNome: "Espécie",
    formaPagamentoTipo: "dinheiro",
    contaBancariaId: null,
    contaBancariaNome: null,
    dataCompra: "2026-08-14",
    mesCompetencia: "2026-08-01",
    rateios: [],
    anexos: 0,
    semNota: false,
    conferidoEm: null,
    conferidoPorNome: null,
    ...sobrescreve,
  };
}

function outroPagamento(): PagamentoDireto {
  return pagamento({
    id: ID_B,
    lancamentoNumero: "LAN-2026-0032",
    lancamentoDescricao: "Peça no cartão",
    fornecedorNome: "AUTO PECAS ACRE",
    formaPagamentoNome: "Cartão da empresa",
    formaPagamentoTipo: "cartao_credito",
  });
}

const PADRAO = { podeConferir: true, podeVerLancamento: true };

/** JSX parametrizado: o teste de refresh chama isto duas vezes com `rerender`. */
function props(pagamentos: PagamentoDireto[]) {
  return <PagamentosDiretos pagamentos={pagamentos} {...PADRAO} />;
}

function marcarTodos() {
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Selecionar todos os pagamentos" }),
  );
}

describe("Barra de seleção de PagamentosDiretos", () => {
  it("sem nada marcado, a barra não oferece imprimir espelho", () => {
    render(props([pagamento(), outroPagamento()]));

    expect(
      screen.queryByRole("button", { name: /Imprimir espelho/i }),
    ).not.toBeInTheDocument();
  });

  it("marcar linhas mostra o botão de espelho com a contagem certa", () => {
    render(props([pagamento(), outroPagamento()]));
    marcarTodos();

    expect(
      screen.getByRole("button", { name: "Imprimir espelho (2)" }),
    ).toBeInTheDocument();
  });

  it("o botão abre a rota de pagamentos com os ids das linhas marcadas", () => {
    render(props([pagamento(), outroPagamento()]));
    marcarTodos();

    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    fireEvent.click(
      screen.getByRole("button", { name: "Imprimir espelho (2)" }),
    );

    expect(abrir).toHaveBeenCalledWith(
      `/espelho/pagamentos?ids=${ID_A}%2C${ID_B}`,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("linha que saiu da lista não vai para o maço", () => {
    const { rerender } = render(props([pagamento(), outroPagamento()]));
    marcarTodos();
    expect(
      screen.getByRole("button", { name: "Imprimir espelho (2)" }),
    ).toBeInTheDocument();

    // Os ids são DERIVADOS das linhas à vista (`selecionadosVisiveis`), não do
    // Set cru: o que sumiu da tela sai do maço sozinho.
    rerender(props([pagamento()]));

    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    fireEvent.click(screen.getByRole("button", { name: "Imprimir espelho" }));

    expect(abrir).toHaveBeenCalledWith(
      `/espelho/pagamentos?ids=${ID_A}`,
      "_blank",
      "noopener,noreferrer",
    );
  });
});
