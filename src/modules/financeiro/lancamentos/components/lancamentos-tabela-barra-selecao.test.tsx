import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

import { LancamentosTabela } from "@/modules/financeiro/lancamentos/components/lancamentos-tabela";
import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { lerFiltrosLancamentos } from "@/modules/financeiro/lancamentos/filtros";
import { definirContaLancamentosLote } from "@/modules/financeiro/lancamentos/actions";
import type { LancamentoLista } from "@/modules/financeiro/lancamentos/queries";

/**
 * Este é o único arquivo que renderiza LancamentosTabela inteira. O resto da
 * suíte de lançamentos testa `montarColunas` e as células isoladas
 * (lancamentos-tabela.test.tsx), ou BarraSelecao e LoteContaBancaria cada um
 * por si (barra-selecao.test.tsx, lote-conta-bancaria.test.tsx). Nenhum dos
 * dois pega o FIO que os liga: `limparDesabilitado` amarrado ao flag errado,
 * `onSalvandoChange` esquecido de passar, ou `resumo` lendo a variável errada
 * deixariam as duas suítes unitárias verdes. Só um teste que renderiza a
 * tabela de verdade e aperta o checkbox pega isso — e o mesmo padrão vale
 * para as telas de ordens, pagamentos e lançamento-detalhe que vêm depois.
 */

// A tabela é client component e usa router; aqui o que se testa é o render, não
// navegação, então o router vira no-op. Mesmo padrão de fila-aprovacao.test.tsx.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/financeiro/lancamentos",
  useSearchParams: () => new URLSearchParams(),
}));

// O DataTable busca e grava a preferência de coluna por Server Action, que usa
// cookies() — inexistente fora de uma requisição. Sem isto o render lança
// "cookies was called outside a request scope" como unhandled error. Mesmo mock
// de data-table.test.tsx e fila-aprovacao.test.tsx.
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

vi.mock("@/components/canonicos/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

/**
 * Porta para o teste segurar `definirContaLancamentosLote` em voo e observar
 * "Limpar seleção" desabilitado ANTES de deixar a gravação terminar. Mesmo
 * truque de portas em filter-bar.test.tsx.
 */
const porta = vi.hoisted(() => ({
  resolver: null as
    | ((valor: Awaited<ReturnType<typeof definirContaLancamentosLote>>) => void)
    | null,
}));

vi.mock("@/modules/financeiro/lancamentos/actions", () => ({
  definirContaLancamentosLote: vi.fn(
    () =>
      new Promise((resolve) => {
        porta.resolver = resolve;
      }),
  ),
}));

/**
 * O Combobox canônico é virtualizado, e o jsdom não faz layout: offsetHeight e
 * clientHeight voltam 0, então o virtualizador acha que a área visível tem 0px e
 * não desenha opção nenhuma. Mesma receita de lote-conta-bancaria.test.tsx, que
 * por sua vez veio de combobox.test.tsx.
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

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";

function lancamento(troca: Partial<LancamentoLista> = {}): LancamentoLista {
  return {
    id: ID_A,
    numero: "LAN-2026-0015",
    numeroDocumento: null,
    anexos: 0,
    tipo: "a_pagar",
    origem: "manual",
    descricao: "Combustível julho",
    categoriaNome: "Combustível",
    fornecedorNome: "GUERRA IMPLEMENTOS RODOVIARIOS S.A",
    valor: 1000,
    dataVencimento: "2026-08-10",
    status: "a_pagar",
    qtdParcelas: 3,
    dataCompra: "2026-07-10",
    mesCompetencia: "2026-07-01",
    criadoEm: "2026-07-11T14:30:00.000Z",
    valorPago: 0,
    valorAberto: 1000,
    valorVencido: 0,
    descontoObtido: 0,
    revisao: "sem-conta",
    // Sem recorte: a coluna do recorte só existe quando a URL recorta.
    valorRecorte: null,
    ...troca,
  };
}

/**
 * Duas linhas com valores diferentes, de propósito: com uma seleção só, o total
 * do resumo bateria com o valor da própria linha na coluna "Valor" da tabela, e
 * `getByText` acharia dois elementos iguais e reprovaria o teste por ambiguidade
 * (não por bug). Marcando as duas, a soma (R$ 1.234,56) não é igual a NENHUM dos
 * dois valores individuais, e o texto do resumo fica sozinho no documento.
 */
const LANCAMENTOS = [
  lancamento({ id: ID_A, valor: 1000, valorAberto: 1000 }),
  lancamento({ id: ID_B, valor: 234.56, valorAberto: 234.56 }),
];

/**
 * Página 2, para o teste de troca de página: ID_A continua (ainda marcado),
 * ID_B saiu de vista e ID_C é novo. Mesmo recorte de
 * ordens-tabela-barra-selecao.test.tsx.
 */
const LANCAMENTOS_PAGINA_2 = [
  lancamento({ id: ID_A, valor: 1000, valorAberto: 1000 }),
  lancamento({
    id: ID_C,
    numero: "LAN-2026-0017",
    valor: 500,
    valorAberto: 500,
  }),
];

const CONTA = { id: "conta-1", nome: "Obra 364", banco: "bb", saldoAtual: 0 };

/**
 * JSX completo, parametrizado por `lancamentos`: o teste de troca de página
 * chama isto duas vezes com `rerender` — página 1 e depois página 2 — pra
 * simular o que a URL faria de verdade (nova consulta no servidor, novo
 * `lancamentos` como prop), sem router real nem Server Component. Mesmo
 * recurso de ordens-tabela-barra-selecao.test.tsx.
 */
function props(lancamentos: LancamentoLista[]) {
  return (
    <LancamentosTabela
      lancamentos={lancamentos}
      total={lancamentos.length}
      pagina={0}
      tamanho={25}
      valores={lerFiltrosLancamentos({}).valores}
      categorias={[]}
      fornecedores={[]}
      centrosCusto={[]}
      formasPagamento={[]}
      contas={[CONTA]}
      podeExcluir={false}
      rotuloRecorte={null}
    />
  );
}

function montar() {
  return render(props(LANCAMENTOS));
}

function marcar(id: string) {
  fireEvent.click(screen.getByRole("checkbox", { name: `Selecionar ${id}` }));
}

/**
 * Escolhe a conta no Combobox canônico.
 *
 * Diferente de lote-conta-bancaria.test.tsx (onde ele é o único combobox da
 * tela): aqui a tabela também tem Comboboxes de filtro (categoria, fornecedor,
 * etc.), e `role="combobox"` por padrão NÃO tem nome acessível — a ARIA diz que
 * este papel só ganha nome de `aria-label`/`aria-labelledby`, nunca do texto
 * visível dentro dele, e o canônico não recebe um `ariaLabel` aqui. Por isso
 * localiza pelo texto do placeholder e sobe até o gatilho, em vez de tentar
 * `getByRole("combobox", { name: ... })`.
 */
function escolherConta() {
  const gatilho = screen
    .getByText("Escolha a conta bancária")
    .closest('[role="combobox"]');
  if (!gatilho) throw new Error("não achei o gatilho do combobox de conta");
  fireEvent.click(gatilho);
  fireEvent.click(screen.getByText("Obra 364 - Banco do Brasil"));
}

/** A div que BarraSelecao desenha, achada a partir do texto de contagem. */
function barra(): HTMLElement {
  const contagem = screen.getByText(/^\d+ selecionados?$/);
  const wrapper = contagem.closest("div");
  if (!wrapper) throw new Error("não achei o invólucro da barra de seleção");
  return wrapper;
}

beforeEach(() => {
  porta.resolver = null;
  vi.mocked(definirContaLancamentosLote).mockClear();
});

afterEach(() => {
  cleanup();
  limparEstadosTabelaParaTeste();
});

describe("BarraSelecao dentro de LancamentosTabela", () => {
  it("zero selecionado: a barra não aparece", () => {
    montar();
    expect(screen.queryByText(/selecionado/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Limpar seleção" }),
    ).not.toBeInTheDocument();
    // A barra some inteira, então o espelho some junto: não há como imprimir
    // sem ter marcado nada.
    expect(
      screen.queryByRole("button", { name: /imprimir espelho/i }),
    ).not.toBeInTheDocument();
  });

  it("marcar linhas mostra a barra com a contagem e o total certos", () => {
    montar();
    marcar(ID_A);
    marcar(ID_B);

    expect(screen.getByText("2 selecionados")).toBeInTheDocument();
    expect(within(barra()).getByText("R$ 1.234,56")).toBeInTheDocument();
  });

  it("sem gravação em voo, limpar seleção fica habilitado", () => {
    montar();
    marcar(ID_A);

    expect(
      within(barra()).getByRole("button", { name: "Limpar seleção" }),
    ).toBeEnabled();
  });

  it("com a gravação em lote em voo, limpar seleção fica desabilitado — e volta a habilitar quando ela termina", async () => {
    montar();
    marcar(ID_A);
    escolherConta();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /definir conta bancária/i }),
      );
    });

    expect(
      within(barra()).getByRole("button", { name: "Limpar seleção" }),
    ).toBeDisabled();

    // Termina com ERRO (não sucesso) de propósito: sucesso limpa a seleção e a
    // barra some inteira, o que impediria checar que o botão voltou a habilitar
    // — teria simplesmente deixado de existir.
    await act(async () => {
      porta.resolver?.({ erro: "falha de rede" });
    });

    expect(
      within(barra()).getByRole("button", { name: "Limpar seleção" }),
    ).toBeEnabled();
  });

  it("marcar linhas mostra o botão de espelho dentro da barra, junto da ação de lote", () => {
    montar();
    marcar(ID_A);
    marcar(ID_B);

    // Esta é a única das três telas com DUAS ações na mesma barra: o espelho
    // tem que conviver com o lote de conta, e os dois dentro da barra (não
    // soltos acima da tabela).
    expect(
      within(barra()).getByRole("button", { name: "Imprimir espelho (2)" }),
    ).toBeInTheDocument();
    expect(
      within(barra()).getByRole("button", { name: "Definir conta bancária" }),
    ).toBeInTheDocument();
  });

  it("o botão de espelho abre a rota de lançamentos com os ids das linhas marcadas", () => {
    montar();
    marcar(ID_A);
    marcar(ID_B);

    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    fireEvent.click(
      screen.getByRole("button", { name: "Imprimir espelho (2)" }),
    );
    expect(abrir).toHaveBeenCalledWith(
      `/espelho/lancamentos?ids=${ID_A}%2C${ID_B}`,
      "_blank",
      "noopener,noreferrer",
    );
    vi.unstubAllGlobals();
  });

  it("trocar de página descarta da contagem quem saiu de vista, sem descartar quem continua", () => {
    const { rerender } = montar();
    marcar(ID_A);
    marcar(ID_B);
    expect(screen.getByText("2 selecionados")).toBeInTheDocument();

    // Troca de página de verdade: o servidor manda outra lista de
    // `lancamentos`. ID_A continua nela (ainda marcado), ID_B não veio mais.
    rerender(props(LANCAMENTOS_PAGINA_2));

    expect(screen.getByText("1 selecionado")).toBeInTheDocument();
    // Não é só a contagem: o botão também não carrega o id que saiu de vista.
    expect(
      screen.getByRole("button", { name: "Imprimir espelho" }),
    ).toBeInTheDocument();
  });
});
