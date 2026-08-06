import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { LoteContaBancaria } from "@/modules/financeiro/lancamentos/components/lote-conta-bancaria";
import { definirContaLancamentosLote } from "@/modules/financeiro/lancamentos/actions";

vi.mock("@/modules/financeiro/lancamentos/actions", () => ({
  definirContaLancamentosLote: vi.fn(async () => ({
    ok: true as const,
    resumo: {
      definidos: 2,
      puladosComConta: 1,
      puladosSemParcelaPendente: 0,
      naoEncontrados: 0,
    },
  })),
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

/**
 * O Combobox canônico é virtualizado, e o jsdom não faz layout: offsetHeight e
 * clientHeight voltam 0, então o virtualizador acha que a área visível tem 0px e
 * NÃO desenha linha nenhuma. Sem estes stubs, escolher uma conta no teste falha
 * com "não achei o texto Caixa 1234", que parece bug do componente e não é.
 *
 * Mesma receita do `combobox.test.tsx`, que é a origem. Se um terceiro teste
 * precisar disso, vale extrair para um helper compartilhado.
 */
const ALTURA_VISIVEL = 300;

beforeAll(() => {
  for (const propriedade of ["offsetHeight", "clientHeight"]) {
    Object.defineProperty(HTMLElement.prototype, propriedade, {
      configurable: true,
      get(this: HTMLElement) {
        return this.dataset.testid === "combobox-area-rolagem"
          ? ALTURA_VISIVEL
          : 0;
      },
    });
  }
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      if (this.dataset.testid !== "combobox-area-rolagem") return 0;
      const espacador = this.firstElementChild as HTMLElement | null;
      return Number.parseFloat(espacador?.style.height ?? "0") || 0;
    },
  });
  Object.defineProperty(Element.prototype, "scrollTo", {
    configurable: true,
    writable: true,
    value(this: Element, opcoes?: { top?: number }) {
      if (typeof opcoes?.top === "number") this.scrollTop = opcoes.top;
    },
  });
});

const CONTAS = [
  { valor: "conta-1", rotulo: "Caixa 1234" },
  { valor: "conta-2", rotulo: "Bradesco 5678" },
];

type Props = React.ComponentProps<typeof LoteContaBancaria>;

function montar(props: Partial<Props> = {}) {
  const cheias: Props = {
    selecionados: ["a", "b", "c"],
    valorSelecionado: 4200000,
    jaComConta: 1,
    contas: CONTAS,
    onLimparSelecao: vi.fn(),
    onConcluido: vi.fn(),
    ...props,
  };
  return { ...render(<LoteContaBancaria {...cheias} />), props: cheias };
}

/**
 * Escolhe a conta no Combobox canônico.
 *
 * Mesmo padrão do combobox.test.tsx: `fireEvent.click` no gatilho e depois no
 * texto da opção. Com `elemento.click()` direto o Radix não abre a lista no
 * jsdom, e o teste morre dizendo que não achou a opção.
 */
function escolherConta(rotulo: string) {
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByText(rotulo));
}

beforeEach(() => {
  vi.mocked(definirContaLancamentosLote).mockClear();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});
afterEach(cleanup);

describe("LoteContaBancaria", () => {
  it("não aparece sem seleção", () => {
    montar({ selecionados: [] });
    expect(screen.queryByText(/selecionado/i)).not.toBeInTheDocument();
  });

  it("mostra a contagem da seleção", () => {
    montar();
    expect(screen.getByText("3 selecionados")).toBeInTheDocument();
  });

  it("singular não diz '1 selecionados'", () => {
    montar({ selecionados: ["a"] });
    expect(screen.getByText("1 selecionado")).toBeInTheDocument();
  });

  it("acima do teto avisa e não oferece o botão", () => {
    const muitos = Array.from({ length: 501 }, (_, i) => `id-${i}`);
    montar({ selecionados: muitos });
    expect(
      screen.getByText(/no máximo 500 lançamentos por vez/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /definir conta bancária/i }),
    ).not.toBeInTheDocument();
  });

  it("sem conta escolhida o botão fica desabilitado", () => {
    montar();
    expect(
      screen.getByRole("button", { name: /definir conta bancária/i }),
    ).toBeDisabled();
  });

  it("com a conta escolhida diz quantos recebem, quantos pulam, a conta e o total", async () => {
    montar();
    escolherConta("Caixa 1234");
    expect(screen.getByText(/2 lançamentos recebem/)).toBeInTheDocument();
    expect(screen.getByText(/1 já tem conta e será pulado/)).toBeInTheDocument();
    expect(screen.getByText("R$ 4.200.000,00")).toBeInTheDocument();
  });

  it("erro da action vira toast de erro e a seleção FICA", async () => {
    vi.mocked(definirContaLancamentosLote).mockResolvedValueOnce({
      erro: "Conta bancaria invalida ou inativa",
    });
    const { props } = montar();
    escolherConta("Caixa 1234");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /definir conta bancária/i }),
      );
    });
    expect(toastMock.error).toHaveBeenCalledWith(
      "Conta bancaria invalida ou inativa",
    );
    // Perder a seleção depois de um erro é castigo em cima de tropeço.
    expect(props.onLimparSelecao).not.toHaveBeenCalled();
  });

  it("sucesso mostra o resumo real e limpa a seleção", async () => {
    const { props } = montar();
    escolherConta("Caixa 1234");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /definir conta bancária/i }),
      );
    });
    expect(definirContaLancamentosLote).toHaveBeenCalledWith(
      ["a", "b", "c"],
      "conta-1",
    );
    expect(toastMock.success).toHaveBeenCalledWith(
      "Conta definida em 2 lançamentos. 1 já tinham conta: pulados",
    );
    expect(props.onLimparSelecao).toHaveBeenCalled();
    expect(props.onConcluido).toHaveBeenCalled();
  });

  it("todos já com conta: não há o que fazer, botão desabilitado", async () => {
    montar({ selecionados: ["a", "b"], jaComConta: 2 });
    escolherConta("Caixa 1234");
    expect(
      screen.getByRole("button", { name: /definir conta bancária/i }),
    ).toBeDisabled();
  });

  it("limpar seleção avisa quem manda", () => {
    const { props } = montar();
    fireEvent.click(screen.getByRole("button", { name: /limpar seleção/i }));
    expect(props.onLimparSelecao).toHaveBeenCalled();
  });
});
