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

const OUTRA_ID = "66666666-6666-4666-8666-666666666666";

/** A segunda parcela da fila, a que o link NÃO aponta. */
function outraParcela() {
  return parcela({
    id: OUTRA_ID,
    lancamentoNumero: "LAN-2026-0099",
    fornecedorNome: "POSTO IPE",
    lancamentoDescricao: "Diesel S10",
  });
}

describe("FilaAprovacao aberta por link de aprovação", () => {
  it("mostra só o pagamento do link, não a fila inteira", () => {
    render(
      <FilaAprovacao
        parcelas={[parcela(), outraParcela()]}
        {...PADRAO}
        parcelasDoLink={[parcela().id]}
      />,
    );

    expect(screen.getByText("Compra de cimento")).toBeInTheDocument();
    // O perigo que isto trava: quem abre o link de um pagamento e vê a fila
    // inteira pode aprovar o vizinho por engano.
    expect(screen.queryByText("Diesel S10")).not.toBeInTheDocument();
  });

  it("avisa que a fila está recortada por um link, com saída para a fila inteira", () => {
    // Link de duas parcelas de propósito: com uma só o painel de conferência
    // abre por cima e, sendo modal, tira o resto da página da árvore acessível.
    // O aviso continua lá atrás, e é isso que a pessoa vê ao fechar o painel.
    render(
      <FilaAprovacao
        parcelas={[parcela(), outraParcela()]}
        {...PADRAO}
        parcelasDoLink={[parcela().id, OUTRA_ID]}
      />,
    );

    expect(screen.getByText(/abriu um link de aprovação/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ver a fila inteira" }),
    ).toBeInTheDocument();
  });

  it("não avisa nada na navegação normal pelo menu", () => {
    render(<FilaAprovacao parcelas={[parcela()]} {...PADRAO} />);
    expect(
      screen.queryByText(/abriu um link de aprovação/i),
    ).not.toBeInTheDocument();
  });

  it("não abre painel nenhum: quem confere vai para a tela inteira", () => {
    render(
      <FilaAprovacao
        parcelas={[parcela(), outraParcela()]}
        {...PADRAO}
        parcelasDoLink={[parcela().id]}
      />,
    );

    // O painel lateral saiu do sistema. Se voltar a abrir sozinho, é regressão.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("diz onde o pagamento foi parar quando ele já saiu da fila", () => {
    render(
      <FilaAprovacao
        parcelas={[]}
        {...PADRAO}
        parcelasDoLink={[parcela().id]}
        foraDaFila={[
          {
            id: parcela().id,
            numero: "LAN-2026-0015",
            fornecedorNome: "A CRUZEIRENSE",
            valor: 20,
            status: "aprovado",
            naoEncontrada: false,
          },
        ]}
      />,
    );

    // Um link parado dias no WhatsApp cai aqui. "Nenhum pagamento encontrado"
    // faria quem abriu achar que o lançamento foi perdido.
    expect(screen.getByText(/já está aprovado/i)).toBeInTheDocument();
    expect(
      screen.getByText(/pagamentos deste link já saíram da fila/i),
    ).toBeInTheDocument();
  });

  it("distingue pagamento sem acesso de pagamento já aprovado", () => {
    render(
      <FilaAprovacao
        parcelas={[]}
        {...PADRAO}
        parcelasDoLink={[parcela().id]}
        foraDaFila={[
          {
            id: parcela().id,
            numero: null,
            fornecedorNome: "-",
            valor: 0,
            status: null,
            naoEncontrada: true,
          },
        ]}
      />,
    );

    expect(screen.getByText(/não foi encontrado/i)).toBeInTheDocument();
  });
});

describe("FilaAprovacao não abre nada ao clicar na linha", () => {
  it("clicar na célula da descrição não abre painel nem navega", () => {
    render(<FilaAprovacao parcelas={[parcela()]} {...PADRAO} />);

    fireEvent.click(screen.getByText("Compra de cimento"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("marcar o checkbox só seleciona, sem abrir o pagamento", () => {
    render(<FilaAprovacao parcelas={[parcela()]} {...PADRAO} />);

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Selecionar LAN-2026-0015/i,
      }),
    );

    // O bug que isto trava: com a linha inteira clicável, o clique no checkbox
    // subia para a linha e a conferência abria por cima da seleção. Selecionar
    // pagamento para aprovar em lote virava fechar um painel a cada clique.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/1 selecionado/i)).toBeInTheDocument();
  });
});

describe("FilaAprovacao leva para a tela inteira do pagamento", () => {
  const ROTA_ESPERADA = `/financeiro/aprovacao-pagamentos/${parcela().id}`;

  it("pelo botão de visualizar da coluna Ações", () => {
    render(<FilaAprovacao parcelas={[parcela()]} {...PADRAO} />);

    const botao = screen.getByRole("link", {
      name: /Visualizar LAN-2026-0015 em tela inteira/i,
    });
    expect(botao).toHaveAttribute("href", ROTA_ESPERADA);
  });

  it("pelo número do lançamento, que é o alvo que a mão procura primeiro", () => {
    render(<FilaAprovacao parcelas={[parcela()]} {...PADRAO} />);

    const numero = screen.getByRole("link", {
      name: "LAN-2026-0015 · parcela 1 de 3",
    });
    expect(numero).toHaveAttribute("href", ROTA_ESPERADA);
  });
});

describe("FilaAprovacao copia a mensagem de aprovação", () => {
  /** Área de transferência de mentira, para ler o texto que sairia daqui. */
  function espionarClipboard() {
    const escrito: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (texto: string) => {
          escrito.push(texto);
        },
      },
    });
    return escrito;
  }

  it("copia fornecedor, valor e link do pagamento da linha", async () => {
    const escrito = espionarClipboard();
    render(<FilaAprovacao parcelas={[parcela()]} {...PADRAO} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: /Copiar mensagem de aprovação de LAN-2026-0015/i,
      }),
    );
    await vi.waitFor(() => expect(escrito).toHaveLength(1));

    expect(escrito[0]).toContain("A CRUZEIRENSE");
    expect(escrito[0]).toContain("Compra de cimento");
    // Uma parcela manda a tela inteira dela, não a fila recortada: é o que faz
    // quem recebe no WhatsApp cair no pagamento em vez de numa lista de um item.
    expect(escrito[0]).toContain(
      `/financeiro/aprovacao-pagamentos/${parcela().id}`,
    );
  });

  it("copia um link só com as duas parcelas quando há seleção", async () => {
    const escrito = espionarClipboard();
    render(<FilaAprovacao parcelas={[parcela(), outraParcela()]} {...PADRAO} />);

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Selecionar todos os pagamentos" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Copiar mensagem de aprovação" }),
    );
    await vi.waitFor(() => expect(escrito).toHaveLength(1));

    expect(escrito[0]).toContain("2 pagamentos para aprovar");
    expect(escrito[0]).toContain(
      `?parcela=${parcela().id},${OUTRA_ID}`,
    );
  });

  it("quem só tem ver copia a mensagem, mas não aprova nem revisa", () => {
    render(
      <FilaAprovacao
        parcelas={[parcela()]}
        {...PADRAO}
        podeAprovar={false}
        podeRevisar={false}
      />,
    );

    // O caso de uso do link: o financeiro monta a mensagem, quem aprova recebe.
    expect(
      screen.getByRole("button", {
        name: /Copiar mensagem de aprovação de LAN-2026-0015/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Aprovar LAN/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Revisar LAN/i }),
    ).not.toBeInTheDocument();
  });
});
