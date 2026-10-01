import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { FilaAprovacao } from "@/modules/financeiro/aprovacao-pagamentos/components/fila-aprovacao";
import type { ParcelaPendente } from "@/modules/financeiro/aprovacao-pagamentos/queries";

// A fila é client component e usa router e Server Actions; aqui o que se testa é
// o render, então router e ações viram no-op.
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
  // Promessa que não resolve, de propósito: o painel de conferência fica no
  // estado de carregando, que é o suficiente para checar que ele ABRIU. Devolver
  // vi.fn() cru (undefined) faz o painel estourar em `.then` de undefined, e era
  // o que acontecia aqui: nenhum teste abria o painel, então nunca apareceu.
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
afterEach(() => cleanup());

function parcela(sobrescreve: Partial<ParcelaPendente> = {}): ParcelaPendente {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    numeroParcela: 1,
    totalParcelas: 3,
    valor: 20,
    dataVencimento: "2026-08-14",
    lancamentoId: "22222222-2222-4222-8222-222222222222",
    lancamentoNumero: "LAN-2026-0015",
    lancamentoDescricao: "Compra de cimento",
    observacoes: null,
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
  // Navegação normal pelo menu: sem link de aprovação na URL.
  parcelasDoLink: [],
  foraDaFila: [],
};

/**
 * Finge a tela de celular: o `useTelaCelular` lê `matchMedia`, que o jsdom não
 * tem. Sem isto a fila desenha a tabela, como em todos os outros testes.
 */
function comoCelular() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (consulta: string) => ({
      matches: true,
      media: consulta,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const OUTRA = "66666666-6666-4666-8666-666666666666";

describe("FilaAprovacao no celular", () => {
  it("troca a tabela e os KPIs pela lista de cards", () => {
    comoCelular();
    render(<FilaAprovacao parcelas={[parcela()]} {...PADRAO} />);

    expect(
      screen.getByRole("list", { name: "Pagamentos para aprovar" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Em revisão")).not.toBeInTheDocument();
    expect(screen.getByText("A CRUZEIRENSE")).toBeInTheDocument();
    expect(screen.getByText("Compra de cimento")).toBeInTheDocument();
    expect(screen.getByText(/vence 14\/08\/2026/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Aprovar LAN-2026-0015 · parcela 1 de 3",
      }),
    ).toBeInTheDocument();
  });

  it("o número do lançamento abre a tela inteira do pagamento", () => {
    comoCelular();
    render(<FilaAprovacao parcelas={[parcela()]} {...PADRAO} />);
    expect(
      screen.getByRole("link", { name: "LAN-2026-0015 · parcela 1 de 3" }),
    ).toHaveAttribute(
      "href",
      "/financeiro/aprovacao-pagamentos/11111111-1111-4111-8111-111111111111",
    );
  });

  it("mostra a observação inteira no card, sem depender de tooltip", () => {
    comoCelular();
    render(
      <FilaAprovacao
        parcelas={[parcela({ observacoes: "PIX: 12.345.678/0001-90" })]}
        {...PADRAO}
      />,
    );
    expect(screen.getByText("PIX: 12.345.678/0001-90")).toBeInTheDocument();
  });

  it("no link, oferece aprovar o recorte inteiro e abre o modal do lote", () => {
    comoCelular();
    const ids = [parcela().id, OUTRA];
    render(
      <FilaAprovacao
        parcelas={[
          parcela(),
          parcela({ id: OUTRA, valor: 30, fornecedorNome: "B LTDA" }),
          parcela({
            id: "77777777-7777-4777-8777-777777777777",
            fornecedorNome: "FORA DO LINK",
          }),
        ]}
        {...PADRAO}
        parcelasDoLink={ids}
      />,
    );

    // Só o recorte do link, nunca a parcela vizinha.
    expect(screen.queryByText("FORA DO LINK")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Aprovar todos \(2\)/ }),
    );
    expect(
      screen.getByRole("heading", { name: "Aprovar 2 pagamentos" }),
    ).toBeInTheDocument();
  });

  it("fora do link não existe aprovar todos, e a busca aparece", () => {
    comoCelular();
    render(
      <FilaAprovacao
        parcelas={[parcela(), parcela({ id: OUTRA, fornecedorNome: "B LTDA" })]}
        {...PADRAO}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Aprovar todos/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("marcar um card mostra a barra com o total marcado", () => {
    comoCelular();
    render(
      <FilaAprovacao
        parcelas={[parcela(), parcela({ id: OUTRA, valor: 30 })]}
        {...PADRAO}
      />,
    );
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(
      screen.getByRole("button", { name: /Aprovar 1$/ }),
    ).toBeInTheDocument();
  });

  it("sem permissão de aprovar, o card não oferece aprovar", () => {
    comoCelular();
    render(
      <FilaAprovacao
        parcelas={[parcela()]}
        {...PADRAO}
        podeAprovar={false}
        podeRevisar={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /^Aprovar/ }),
    ).not.toBeInTheDocument();
  });

  it("no computador continua a tabela, sem os cards", () => {
    render(<FilaAprovacao parcelas={[parcela()]} {...PADRAO} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Pagamentos para aprovar" }),
    ).not.toBeInTheDocument();
  });
});
