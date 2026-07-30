import { cleanup, render, screen } from "@testing-library/react";
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
  detalheDaFila: vi.fn(),
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
    },
  ],
  podeAprovar: true,
  podeRevisar: true,
  podeEditarLancamento: true,
  idUsuario: "44444444-4444-4444-8444-444444444444",
};

describe("FilaAprovacao", () => {
  it("renderiza a linha com o badge Sem nota sem estourar", () => {
    // O bug que isto trava: o Tooltip do projeto é o Radix cru, sem provider
    // embutido. Sem TooltipProvider ancestral, a primeira linha com tooltip
    // ("Sem nota") lança no cliente e o error boundary derruba a tela inteira.
    // Com a fila vazia nada disso renderiza, e a falta passa despercebida: foi
    // exatamente assim que subiu para produção.
    expect(() =>
      render(
        <FilaAprovacao parcelas={[parcela({ semNota: true })]} {...PADRAO} />,
      ),
    ).not.toThrow();

    expect(screen.getByText("Sem nota")).toBeInTheDocument();
  });

  it("renderiza a linha com centro de custo rateado sem estourar", () => {
    // O outro tooltip da tela: a composição do rateio.
    expect(() =>
      render(
        <FilaAprovacao
          parcelas={[
            parcela({
              rateios: [
                { nome: "Escritorio Central", valor: 12 },
                { nome: "009 - BR-364 Lote 09", valor: 8 },
              ],
            }),
          ]}
          {...PADRAO}
        />,
      ),
    ).not.toThrow();
  });

  it("usa o rótulo canônico da parcela em todas as linhas", () => {
    render(
      <FilaAprovacao
        parcelas={[parcela({ numeroParcela: 1, totalParcelas: 3 })]}
        {...PADRAO}
      />,
    );
    expect(
      screen.getByText("LAN-2026-0015 · parcela 1 de 3"),
    ).toBeInTheDocument();
  });

  it("mostra a descrição com a categoria embaixo, na mesma coluna", () => {
    render(<FilaAprovacao parcelas={[parcela()]} {...PADRAO} />);
    expect(screen.getByText("Compra de cimento")).toBeInTheDocument();
    expect(screen.getByText("Categoria: Material")).toBeInTheDocument();
  });

  it("diz que a parcela está sem categoria em vez de deixar o traço", () => {
    render(
      <FilaAprovacao parcelas={[parcela({ categoriaNome: null })]} {...PADRAO} />,
    );
    expect(screen.getByText("Categoria: sem categoria")).toBeInTheDocument();
  });

  it("oferece o filtro de conta só quando a fila tem mais de uma conta", () => {
    // Filtro com uma opção única não filtra nada, então nem aparece na barra.
    const { unmount } = render(
      <FilaAprovacao parcelas={[parcela()]} {...PADRAO} />,
    );
    expect(screen.queryByText("Todas as contas")).not.toBeInTheDocument();
    unmount();

    render(
      <FilaAprovacao
        parcelas={[
          parcela(),
          parcela({
            id: "66666666-6666-4666-8666-666666666666",
            contaBancariaId: "77777777-7777-4777-8777-777777777777",
            contaBancariaNome: "BB 9876",
          }),
        ]}
        {...PADRAO}
      />,
    );
    expect(screen.getByText("Todas as contas")).toBeInTheDocument();
  });

  it("estado vazio explica que dinheiro e cartão não passam pela fila", () => {
    render(<FilaAprovacao parcelas={[]} {...PADRAO} />);
    expect(
      screen.getByText(/dinheiro e cartão de crédito não passam por aqui/i),
    ).toBeInTheDocument();
  });
});
