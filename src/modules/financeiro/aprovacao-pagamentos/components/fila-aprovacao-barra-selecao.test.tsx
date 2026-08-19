import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { FilaAprovacao } from "@/modules/financeiro/aprovacao-pagamentos/components/fila-aprovacao";
import type { ParcelaPendente } from "@/modules/financeiro/aprovacao-pagamentos/queries";

/**
 * Costura da barra de seleção da fila com o BotaoEspelho, no mesmo molde de
 * ordens-tabela-barra-selecao.test.tsx e lancamentos-tabela-barra-selecao.test.tsx.
 *
 * O FIO que liga checkbox da coluna, barra de ações e botão de imprimir não é
 * pego por teste unitário nenhum: só apertando o checkbox de verdade aparece
 * `id` errado indo para a URL, ou id de linha que já saiu da fila entrando no
 * maço.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/financeiro/aprovacao-pagamentos",
  useSearchParams: () => new URLSearchParams(),
}));

// O DataTable busca e salva a preferência de coluna por Server Action, e Server
// Action usa cookies(), que não existe fora de uma requisição. Sem este mock o
// render lança "cookies was called outside a request scope" como unhandled error.
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

vi.mock("@/modules/financeiro/aprovacao-pagamentos/actions", () => ({
  aprovarParcela: vi.fn(),
  aprovarParcelasEmLote: vi.fn(),
  revisarParcela: vi.fn(),
  revisarParcelasEmLote: vi.fn(),
  detalheDaFila: vi.fn(() => new Promise(() => {})),
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

// Sem cleanup automático nesta configuração: cada render ficaria no DOM e as
// buscas por texto achariam a linha de mais de um teste.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "66666666-6666-4666-8666-666666666666";

function parcela(sobrescreve: Partial<ParcelaPendente> = {}): ParcelaPendente {
  return {
    id: ID_A,
    numeroParcela: 1,
    totalParcelas: 3,
    valor: 20,
    dataVencimento: "2026-08-14",
    lancamentoId: "22222222-2222-4222-8222-222222222222",
    lancamentoNumero: "LAN-2026-0015",
    lancamentoDescricao: "Compra de cimento",
    fornecedorNome: "A CRUZEIRENSE",
    origem: "oc",
    origemId: "33333333-3333-4333-8333-333333333333",
    origemNumero: "OC-2026-0041",
    categoriaNome: "Material",
    formaPagamentoNome: "PIX",
    dataCompra: "2026-07-30",
    mesCompetencia: "2026-07-01",
    dataProgramada: null,
    contaBancariaId: "55555555-5555-4555-8555-555555555555",
    contaBancariaNome: "Caixa 1234",
    rateios: [],
    anexos: 0,
    semNota: false,
    ...sobrescreve,
  };
}

/** A segunda parcela da fila. */
function outraParcela(): ParcelaPendente {
  return parcela({
    id: ID_B,
    lancamentoNumero: "LAN-2026-0099",
    fornecedorNome: "POSTO IPE",
    lancamentoDescricao: "Diesel S10",
  });
}

const PADRAO = {
  incompletas: { parcelas: 0, valor: 0, lancamentos: 0 },
  emRevisao: { parcelas: 0, valor: 0 },
  aguardandoData: { parcelas: 0, valor: 0 },
  aguardandoConta: { parcelas: 0, valor: 0 },
  contas: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      nome: "Caixa 1234",
      banco: "caixa",
      saldoAtual: 0,
    },
  ],
  podeAprovar: true,
  podeRevisar: true,
  idUsuario: "44444444-4444-4444-8444-444444444444",
  parcelasDoLink: [],
  foraDaFila: [],
};

/** JSX parametrizado: o teste de refresh chama isto duas vezes com `rerender`. */
function props(parcelas: ParcelaPendente[]) {
  return <FilaAprovacao parcelas={parcelas} {...PADRAO} />;
}

function marcarTodas() {
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Selecionar todos os pagamentos" }),
  );
}

describe("Barra de seleção da FilaAprovacao", () => {
  it("sem nada marcado, a barra não oferece imprimir espelho", () => {
    render(props([parcela(), outraParcela()]));

    expect(
      screen.queryByRole("button", { name: /Imprimir espelho/i }),
    ).not.toBeInTheDocument();
  });

  it("marcar linhas mostra o botão de espelho com a contagem certa", () => {
    render(props([parcela(), outraParcela()]));
    marcarTodas();

    expect(
      screen.getByRole("button", { name: "Imprimir espelho (2)" }),
    ).toBeInTheDocument();
  });

  it("o botão abre a rota de pagamentos com os ids das parcelas marcadas", () => {
    render(props([parcela(), outraParcela()]));
    marcarTodas();

    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    fireEvent.click(
      screen.getByRole("button", { name: "Imprimir espelho (2)" }),
    );

    // A parcela da fila ainda não foi paga, e o espelho sai honesto assim
    // mesmo: src/app/(espelho)/espelho/pagamentos/page.tsx intitula o papel de
    // "Parcela" e imprime travessão em "Saiu da conta" e "Pago em" quando o
    // status não é 'pago'.
    expect(abrir).toHaveBeenCalledWith(
      `/espelho/pagamentos?ids=${ID_A}%2C${ID_B}`,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("parcela que saiu da fila não vai para o maço", () => {
    const { rerender } = render(props([parcela(), outraParcela()]));
    marcarTodas();
    expect(
      screen.getByRole("button", { name: "Imprimir espelho (2)" }),
    ).toBeInTheDocument();

    // Outra pessoa aprovou a segunda parcela e o refresh trouxe a fila menor.
    // Os ids do botão são DERIVADOS das linhas à vista (`selecionadasNaFila`),
    // não do Set cru de seleção: id que sumiu da tela sai do maço sozinho.
    rerender(props([parcela()]));

    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    fireEvent.click(screen.getByRole("button", { name: "Imprimir espelho" }));

    expect(abrir).toHaveBeenCalledWith(
      `/espelho/pagamentos?ids=${ID_A}`,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("quem só tem ver também imprime: selecionar e imprimir não mutam nada", () => {
    render(
      <FilaAprovacao
        parcelas={[parcela()]}
        {...PADRAO}
        podeAprovar={false}
        podeRevisar={false}
      />,
    );
    marcarTodas();

    expect(
      screen.getByRole("button", { name: "Imprimir espelho" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Aprovar selecionados" }),
    ).not.toBeInTheDocument();
  });
});
