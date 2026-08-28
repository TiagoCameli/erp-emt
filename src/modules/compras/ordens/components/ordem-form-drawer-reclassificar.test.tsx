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
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

/**
 * Trocar a categoria de um insumo DENTRO da ordem de compra.
 *
 * O pedido do Tiago em 27/08/2026: a categoria vem do insumo, quem emite a ordem
 * pode trocá-la ali mesmo, e "quando ela faz a alteração e salva, a categoria
 * daquele insumo muda tanto nas OCs anteriores quanto para as futuras -- mas
 * quero que apareça um aviso na tela falando dessa mudança".
 *
 * O que este teste tranca:
 *  - o aviso aparece assim que a categoria muda, e SÓ quando muda;
 *  - salvar não passa direto: o clique abre a confirmação, e a ordem não é
 *    gravada enquanto ninguém confirmar;
 *  - confirmado, a ordem é salva E a reclassificação é aplicada;
 *  - cancelar não salva nem reclassifica.
 */

const editarOrdem = vi.fn(async () => ({ ok: true as const }));
const reclassificarInsumos = vi.fn(async () => ({
  ordens: 13,
  ordensAprovadas: 9,
  lancamentos: 9,
  valor: 41000,
}));
const contarImpactoReclassificacao = vi.fn(async () => ({
  ordens: 13,
  ordensAprovadas: 9,
  lancamentos: 9,
  valor: 41000,
}));

vi.mock("@/modules/compras/ordens/actions", () => ({
  criarOrdem: vi.fn(),
  editarOrdem: (...args: unknown[]) => editarOrdem(...(args as [])),
  reclassificarInsumos: (...args: unknown[]) =>
    reclassificarInsumos(...(args as [])),
  contarImpactoReclassificacao: (...args: unknown[]) =>
    contarImpactoReclassificacao(...(args as [])),
  sugerirParcelasPelaCondicao: vi.fn(async () => ({ parcelas: [] })),
}));
vi.mock("@/components/canonicos/anexos", () => ({ Anexos: () => null }));
vi.mock("@/components/canonicos/fila-anexos", () => ({
  FilaAnexos: () => null,
  subirFilaDeAnexos: async () => 0,
}));

const avisos: string[] = [];
const sucessos: string[] = [];
vi.mock("@/components/canonicos/toast", () => ({
  toast: {
    error: (mensagem: string) => avisos.push(mensagem),
    success: (mensagem: string) => sucessos.push(mensagem),
    warning: () => {},
    info: () => {},
  },
  DURACAO_TOAST: { sucesso: 2000, info: 3000, aviso: 5000, erro: 6000 },
}));

import { instalarLayoutDeLista } from "@/components/canonicos/combobox-jsdom-teste";
import { OrdemFormDrawer } from "@/modules/compras/ordens/components/ordem-form-drawer";
import type { OrdemDetalhe } from "@/modules/compras/ordens/queries";

const PIX = "11111111-1111-4111-8111-111111111111";
const FORNECEDOR = "33333333-3333-4333-8333-333333333333";
const CONDICAO = "44444444-4444-4444-8444-444444444444";
const MATERIAL = "55555555-5555-4555-8555-555555555555";
const PECAS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CENTRO = "66666666-6666-4666-8666-666666666666";
const INSUMO = "77777777-7777-4777-8777-777777777777";

const VALOR = 15400;

/** OC pendente, um item de MUNHÃO classificado como Materiais no cadastro. */
function ordem(): OrdemDetalhe {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    numero: "OC-2026-0038",
    fornecedorId: FORNECEDOR,
    fornecedorNome: "PODIUM AUTO CENTER",
    condicaoPagamentoId: CONDICAO,
    condicaoPagamentoDescricao: "À vista",
    formaPagamentoId: PIX,
    cotacaoId: null,
    cotacaoNumero: null,
    descricao: "Munhão da Hilux",
    categoriaId: MATERIAL,
    categoriaNome: "Materiais",
    valorTotal: VALOR,
    ajustes: { frete: 0, outrasDespesas: 0, impostos: 0, desconto: 0 },
    status: "pendente_aprovacao",
    motivoRejeicao: null,
    dataCompra: "2026-08-20",
    mesCompetencia: "2026-08-01",
    criadoEm: "2026-08-20T14:00:00Z",
    numeroDocumento: null,
    observacoes: null,
    itens: [
      {
        id: "99999999-9999-4999-8999-999999999999",
        insumoId: INSUMO,
        insumoNome: "MUNHÃO",
        unidade: "un",
        quantidade: 1,
        precoUnitario: VALOR,
        subtotal: VALOR,
        centroCustoId: CENTRO,
        centroCustoNome: "Hilux SQR1C93 - 07",
        semCategoriaCusto: false,
        categoriaCustoId: MATERIAL,
        categoriaCustoNome: "Materiais",
      },
    ],
    parcelas: [],
    formas: [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        formaPagamentoId: PIX,
        formaPagamentoNome: "PIX",
        cartaoId: null,
        cartaoRotulo: null,
        valor: VALOR,
      },
    ],
    lancamento: null,
  };
}

function abrirEdicao() {
  render(
    <OrdemFormDrawer
      aberto
      onAbertoChange={() => {}}
      ordem={ordem()}
      fornecedores={[{ id: FORNECEDOR, nome: "PODIUM AUTO CENTER" }]}
      insumos={[
        {
          id: INSUMO,
          nome: "MUNHÃO",
          unidade: "un",
          categoriaCustoId: MATERIAL,
          categoriaCustoNome: "Materiais",
        },
      ]}
      centrosCusto={[
        {
          id: CENTRO,
          nome: "Hilux SQR1C93 - 07",
          codigo: null,
          tipo: null,
          paiId: null,
        },
      ]}
      condicoesPagamento={[{ id: CONDICAO, descricao: "À vista" }]}
      formasPagamento={[{ id: PIX, nome: "PIX", tipo: "bancario" }]}
      categorias={[
        { id: MATERIAL, nome: "Materiais" },
        { id: PECAS, nome: "Peças e manutenção" },
      ]}
      cartoes={[]}
      anexos={[]}
    />,
  );
}

/** Troca a categoria do único item para "Peças e manutenção". */
async function trocarCategoriaDoItem() {
  const seletor = await screen.findByRole("combobox", {
    name: /categoria do custo/i,
  });
  fireEvent.click(seletor);
  fireEvent.click(
    await screen.findByRole("option", { name: "Peças e manutenção" }),
  );
}

describe("trocar a categoria do insumo dentro da OC", () => {
  beforeAll(instalarLayoutDeLista);
  beforeEach(() => {
    editarOrdem.mockClear();
    reclassificarInsumos.mockClear();
    contarImpactoReclassificacao.mockClear();
    avisos.length = 0;
    sucessos.length = 0;
  });
  afterEach(cleanup);

  it("sem mudança nenhuma, não há aviso e salvar salva direto", async () => {
    abrirEdicao();

    expect(
      screen.queryByText(/vai mudar de categoria no cadastro/i),
    ).toBeNull();

    fireEvent.click(
      await screen.findByRole("button", { name: /salvar ordem/i }),
    );

    await waitFor(() => expect(editarOrdem).toHaveBeenCalledTimes(1));
    expect(reclassificarInsumos).not.toHaveBeenCalled();
  });

  it("trocar a categoria mostra o aviso na tela, com o de/para", async () => {
    abrirEdicao();
    await trocarCategoriaDoItem();

    expect(
      await screen.findByText("1 insumo vai mudar de categoria no cadastro"),
    ).toBeTruthy();
    // O aviso diz o que é surpreendente: vale para as ordens ANTERIORES.
    expect(screen.getByText(/ordens anteriores/i)).toBeTruthy();
    expect(screen.getAllByText("MUNHÃO").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Peças e manutenção").length).toBeGreaterThan(0);
  });

  /**
   * O portão. Antes de existir, o mesmo clique que salvava a ordem reclassificava
   * o cadastro que todas as outras leem, sem ninguém dizer que ia acontecer.
   */
  it("salvar com categoria trocada NÃO grava: pede confirmação primeiro", async () => {
    abrirEdicao();
    await trocarCategoriaDoItem();

    fireEvent.click(
      await screen.findByRole("button", { name: /salvar ordem/i }),
    );

    expect(
      await screen.findByRole("button", { name: /salvar e reclassificar/i }),
    ).toBeTruthy();
    expect(editarOrdem).not.toHaveBeenCalled();
    expect(reclassificarInsumos).not.toHaveBeenCalled();
  });

  it("a confirmação mostra quantas ordens e lançamentos mudam", async () => {
    abrirEdicao();
    await trocarCategoriaDoItem();
    fireEvent.click(
      await screen.findByRole("button", { name: /salvar ordem/i }),
    );

    await waitFor(() =>
      expect(contarImpactoReclassificacao).toHaveBeenCalledWith([INSUMO]),
    );
    expect(
      await screen.findByText(
        "13 ordens anteriores e 9 lançamentos são reclassificados.",
      ),
    ).toBeTruthy();
  });

  it("confirmado: salva a ordem E aplica a reclassificação", async () => {
    abrirEdicao();
    await trocarCategoriaDoItem();
    fireEvent.click(
      await screen.findByRole("button", { name: /salvar ordem/i }),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /salvar e reclassificar/i }),
    );

    await waitFor(() => expect(editarOrdem).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(reclassificarInsumos).toHaveBeenCalledTimes(1));
    // A foto do "antes" sobe junto: é ela que faz o banco recusar quando outra
    // pessoa reclassificou o mesmo insumo enquanto esta tela estava aberta.
    expect(reclassificarInsumos).toHaveBeenCalledWith([
      {
        insumoId: INSUMO,
        categoriaId: PECAS,
        categoriaAnteriorId: MATERIAL,
      },
    ]);
  });

  it("cancelar não salva a ordem nem reclassifica nada", async () => {
    abrirEdicao();
    await trocarCategoriaDoItem();
    fireEvent.click(
      await screen.findByRole("button", { name: /salvar ordem/i }),
    );

    // Escopado ao diálogo: o rodapé do drawer tem um "Cancelar" próprio, e é ele
    // que `findByRole` acha primeiro. Clicar no do drawer deixaria o diálogo
    // aberto e o teste passaria a medir outra coisa.
    const dialogo = (
      await screen.findByText(/mudar a categoria deste insumo/i)
    ).closest("[role='dialog']") as HTMLElement;
    fireEvent.click(
      within(dialogo).getByRole("button", { name: /^cancelar$/i }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /salvar e reclassificar/i }),
      ).toBeNull(),
    );
    expect(editarOrdem).not.toHaveBeenCalled();
    expect(reclassificarInsumos).not.toHaveBeenCalled();
  });
});
