import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { PagamentosDiretos } from "@/modules/financeiro/aprovacao-pagamentos/components/pagamentos-diretos";
import type { PagamentoDireto } from "@/modules/financeiro/aprovacao-pagamentos/queries";
import { CONFERENCIA } from "@/modules/financeiro/aprovacao-pagamentos/rotulos";

const refresh = vi.fn();

// Client component com router e Server Actions: aqui o que se testa é o render
// e o que a tela chama, então router e ações viram no-op controlado.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
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

// Tipadas com os argumentos reais para o teste conferir o que a tela mandou:
// marcar e desmarcar são a mesma chamada com o booleano trocado, então o
// booleano é a parte que importa.
const marcarParcelaConferida =
  vi.fn<(id: string, conferido: boolean) => Promise<{ ok: true }>>();
const marcarParcelasConferidasEmLote =
  vi.fn<
    (
      ids: string[],
      conferido: boolean,
    ) => Promise<{ ok: true; marcadas: number }>
  >();

marcarParcelaConferida.mockResolvedValue({ ok: true });
marcarParcelasConferidasEmLote.mockResolvedValue({ ok: true, marcadas: 1 });

vi.mock("@/modules/financeiro/aprovacao-pagamentos/actions", () => ({
  marcarParcelaConferida: (id: string, conferido: boolean) =>
    marcarParcelaConferida(id, conferido),
  marcarParcelasConferidasEmLote: (ids: string[], conferido: boolean) =>
    marcarParcelasConferidasEmLote(ids, conferido),
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
  vi.clearAllMocks();
});

function pagamento(
  sobrescreve: Partial<PagamentoDireto> = {},
): PagamentoDireto {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    numeroParcela: 1,
    totalParcelas: 1,
    valor: 250.5,
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

const PADRAO = { podeConferir: true, podeVerLancamento: true };

/** Clique que espera a Server Action (mockada) resolver antes de seguir. */
async function clicar(elemento: HTMLElement) {
  await act(async () => {
    fireEvent.click(elemento);
  });
}

describe("PagamentosDiretos", () => {
  it("renderiza uma linha de verdade sem estourar", () => {
    // O bug que isto trava: o Tooltip do projeto é o Radix cru, sem provider
    // embutido. Sem TooltipProvider ancestral, a primeira linha com tooltip
    // (centro de custo rateado) lança no cliente e o error boundary derruba a
    // tela inteira. Com a lista vazia nada disso renderiza, e a falta passa
    // despercebida: foi exatamente assim que a fila ao lado subiu quebrada.
    expect(() =>
      render(
        <PagamentosDiretos
          pagamentos={[
            pagamento({
              rateios: [
                { nome: "Escritorio Central", valor: 150.5 },
                { nome: "009 - BR-364 Lote 09", valor: 100 },
              ],
            }),
          ]}
          {...PADRAO}
        />,
      ),
    ).not.toThrow();

    expect(screen.getByText("Diesel do caminhão pipa")).toBeInTheDocument();
  });

  it("deixa marcar uma parcela JÁ PAGA, que é o caso principal da aba", async () => {
    render(
      <PagamentosDiretos
        pagamentos={[pagamento({ status: "pago" })]}
        {...PADRAO}
      />,
    );

    // Situação "Pago" na linha e o botão de marcar disponível do mesmo jeito.
    expect(screen.getByText("Pago")).toBeInTheDocument();
    await clicar(screen.getByRole("button", { name: CONFERENCIA.acaoMarcar }));

    expect(marcarParcelaConferida).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      true,
    );
  });

  it("mostra quem conferiu e quando, e oferece desmarcar na mesma linha", async () => {
    render(
      <PagamentosDiretos
        pagamentos={[
          pagamento({
            conferidoEm: "2026-08-20T14:30:00Z",
            conferidoPorNome: "Tiago Cameli",
          }),
        ]}
        {...PADRAO}
      />,
    );

    // Dentro da tabela: "Conferido" também é título de KPI e opção de filtro.
    const tabela = screen.getByRole("table");
    expect(within(tabela).getByText(CONFERENCIA.marcado)).toBeInTheDocument();
    expect(within(tabela).getByText(/Tiago Cameli/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: CONFERENCIA.acaoMarcar }),
    ).not.toBeInTheDocument();

    await clicar(
      screen.getByRole("button", { name: CONFERENCIA.acaoDesmarcar }),
    );
    expect(marcarParcelaConferida).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      false,
    );
  });

  it("diz 'Não conferido' sem badge de pendência quando ninguém marcou", () => {
    render(<PagamentosDiretos pagamentos={[pagamento()]} {...PADRAO} />);
    // A palavra aparece na célula da linha (o filtro também tem a opção, por
    // isso a busca é dentro da tabela).
    const tabela = screen.getByRole("table");
    expect(
      within(tabela).getByText(CONFERENCIA.naoMarcado),
    ).toBeInTheDocument();
  });

  it("marca em lote pelo mesmo caminho da fila", async () => {
    render(<PagamentosDiretos pagamentos={[pagamento()]} {...PADRAO} />);

    await clicar(
      screen.getByRole("checkbox", { name: "Selecionar LAN-2026-0031" }),
    );
    await clicar(
      screen.getByRole("button", { name: CONFERENCIA.acaoMarcarLote }),
    );
    expect(marcarParcelasConferidasEmLote).toHaveBeenCalledWith(
      ["11111111-1111-4111-8111-111111111111"],
      true,
    );
  });

  it("esconde os botões de quem não pode aprovar pagamento", () => {
    render(
      <PagamentosDiretos
        pagamentos={[pagamento()]}
        podeConferir={false}
        podeVerLancamento
      />,
    );
    expect(
      screen.queryByRole("button", { name: CONFERENCIA.acaoMarcar }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("explica que a aba não trava pagamento nenhum", () => {
    render(<PagamentosDiretos pagamentos={[]} {...PADRAO} />);
    expect(
      screen.getByText(/Nada aqui prende, libera nem muda pagamento/i),
    ).toBeInTheDocument();
  });
});
