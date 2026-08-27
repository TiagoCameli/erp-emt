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
} from "@testing-library/react";

/**
 * "Clico em Salvar e não acontece nada."
 *
 * Reportado pelo Tiago em 27/08/2026 e reproduzido na OC-2026-0026 (dividida
 * entre PIX e Cartão de Crédito): basta o total dos itens deixar de fechar com
 * as formas para o `handleSubmit` recusar o envio. Antes do
 * `submeterComAviso`, essa recusa não produzia sinal nenhum na altura do
 * botão -- as duas mensagens nascem na seção de formas e na de parcelas, 600 px
 * abaixo da área visível de um formulário de tela cheia.
 *
 * O que este teste tranca: submit recusado SEMPRE avisa.
 */

const editarOrdem = vi.fn(async () => ({ ok: true as const }));

vi.mock("@/modules/compras/ordens/actions", () => ({
  criarOrdem: vi.fn(),
  editarOrdem: (...args: unknown[]) => editarOrdem(...(args as [])),
  sugerirParcelasPelaCondicao: vi.fn(async () => ({ parcelas: [] })),
}));
// Anexos batem em Storage, inexistente no jsdom.
vi.mock("@/components/canonicos/anexos", () => ({ Anexos: () => null }));
vi.mock("@/components/canonicos/fila-anexos", () => ({
  FilaAnexos: () => null,
  subirFilaDeAnexos: async () => 0,
}));

const avisos: string[] = [];
vi.mock("@/components/canonicos/toast", () => ({
  toast: {
    error: (mensagem: string) => avisos.push(mensagem),
    success: () => {},
    warning: () => {},
    info: () => {},
  },
  DURACAO_TOAST: { sucesso: 2000, info: 3000, aviso: 5000, erro: 6000 },
}));

import { instalarLayoutDeLista } from "@/components/canonicos/combobox-jsdom-teste";
import { OrdemFormDrawer } from "@/modules/compras/ordens/components/ordem-form-drawer";
import type { OrdemDetalhe } from "@/modules/compras/ordens/queries";

const PIX = "11111111-1111-4111-8111-111111111111";
const CARTAO = "22222222-2222-4222-8222-222222222222";
const FORNECEDOR = "33333333-3333-4333-8333-333333333333";
const CONDICAO = "44444444-4444-4444-8444-444444444444";
const CATEGORIA = "55555555-5555-4555-8555-555555555555";
const CENTRO = "66666666-6666-4666-8666-666666666666";
const INSUMO = "77777777-7777-4777-8777-777777777777";
/** O CARTÃO em si, do cadastro. `CARTAO` acima é a FORMA de pagamento. */
const CARTAO_OBRA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/**
 * A OC-2026-0026 como estava no banco: R$ 15.400,00 em PIX (400) + cartão
 * (15.000). O `comCartao` diz se a linha do cartão de crédito já tem cartão
 * escolhido — sem ele o formulário recusa o envio, que é a regra de 27/08/2026.
 */
function ordemDividida(precoDoItem: number, comCartao = true): OrdemDetalhe {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    numero: "OC-2026-0026",
    fornecedorId: FORNECEDOR,
    fornecedorNome: "ATAIDE LOPES",
    condicaoPagamentoId: CONDICAO,
    condicaoPagamentoDescricao: "À vista",
    formaPagamentoId: null,
    cotacaoId: null,
    cotacaoNumero: null,
    descricao: "REFERENTE CONSERTO MOTOR DA PATROL 12H - 01",
    categoriaId: CATEGORIA,
    categoriaNome: "Outras despesas",
    valorTotal: precoDoItem,
    ajustes: { frete: 0, outrasDespesas: 0, impostos: 0, desconto: 0 },
    status: "pendente_aprovacao",
    motivoRejeicao: null,
    dataCompra: "2026-08-17",
    mesCompetencia: "2026-08-01",
    criadoEm: "2026-08-18T12:00:00Z",
    numeroDocumento: null,
    observacoes: null,
    itens: [
      {
        id: "99999999-9999-4999-8999-999999999999",
        insumoId: INSUMO,
        insumoNome: "Serviço Prestado",
        unidade: "un",
        quantidade: 1,
        precoUnitario: precoDoItem,
        subtotal: precoDoItem,
        centroCustoId: CENTRO,
        centroCustoNome: "Motoniveladora 12H - 01",
        semCategoriaCusto: false,
      },
    ],
    parcelas: [
      {
        numeroParcela: 1,
        dataVencimento: "2026-08-17",
        valor: 400,
        formaPagamentoId: PIX,
      },
      {
        numeroParcela: 2,
        dataVencimento: "2026-08-28",
        valor: 3000,
        formaPagamentoId: CARTAO,
      },
      {
        numeroParcela: 3,
        dataVencimento: "2026-09-28",
        valor: 3000,
        formaPagamentoId: CARTAO,
      },
      {
        numeroParcela: 4,
        dataVencimento: "2026-10-28",
        valor: 3000,
        formaPagamentoId: CARTAO,
      },
      {
        numeroParcela: 5,
        dataVencimento: "2026-11-28",
        valor: 3000,
        formaPagamentoId: CARTAO,
      },
      {
        numeroParcela: 6,
        dataVencimento: "2026-12-28",
        valor: 3000,
        formaPagamentoId: CARTAO,
      },
    ],
    formas: [
      {
        id: "f-pix",
        formaPagamentoId: PIX,
        formaPagamentoNome: "PIX",
        cartaoId: null,
        cartaoRotulo: null,
        valor: 400,
      },
      {
        id: "f-cc",
        formaPagamentoId: CARTAO,
        formaPagamentoNome: "Cartão de Crédito",
        cartaoId: comCartao ? CARTAO_OBRA : null,
        cartaoRotulo: comCartao ? "Cartão obra (7712)" : null,
        valor: 15000,
      },
    ],
    lancamento: null,
  };
}

function abrirEdicao(ordem: OrdemDetalhe) {
  render(
    <OrdemFormDrawer
      aberto
      onAbertoChange={() => {}}
      ordem={ordem}
      fornecedores={[{ id: FORNECEDOR, nome: "ATAIDE LOPES" }]}
      insumos={[{ id: INSUMO, nome: "Serviço Prestado", unidade: "un" }]}
      centrosCusto={[
        {
          id: CENTRO,
          nome: "Motoniveladora 12H - 01",
          codigo: null,
          tipo: null,
          paiId: null,
        } as never,
      ]}
      condicoesPagamento={[{ id: CONDICAO, descricao: "À vista" } as never]}
      formasPagamento={[
        { id: PIX, nome: "PIX", tipo: "bancario" },
        { id: CARTAO, nome: "Cartão de Crédito", tipo: "cartao_credito" },
      ]}
      categorias={[{ id: CATEGORIA, nome: "Outras despesas" }]}
      cartoes={[
        { id: CARTAO_OBRA, nome: "Cartão obra", ultimosDigitos: "7712" },
      ]}
    />,
  );
}

describe("editar OC: salvar com o formulário inválido", () => {
  // O Combobox é uma lista virtualizada: sem layout falso o jsdom não desenha
  // opção nenhuma e o teste falharia por um motivo que não é o dele.
  beforeAll(instalarLayoutDeLista);
  beforeEach(() => {
    editarOrdem.mockClear();
    avisos.length = 0;
  });
  afterEach(cleanup);

  it("avisa em vez de ficar calado quando as formas não fecham com o total", async () => {
    // R$ 15.500,00 no item contra R$ 15.400,00 divididos entre as duas formas.
    abrirEdicao(ordemDividida(15500));

    fireEvent.click(
      await screen.findByRole("button", { name: /salvar ordem/i }),
    );

    await waitFor(() => expect(avisos.length).toBe(1));
    expect(editarOrdem).not.toHaveBeenCalled();
    expect(avisos[0]).toMatch(/R\$/);
  });

  it("avisa quando a compra é no cartão e ninguém disse qual cartão", async () => {
    // A regra de 27/08/2026: forma do tipo cartão de crédito exige o cartão. Sem
    // este teste, um envio sem cartão só quebraria no banco, com a mensagem da
    // trigger e depois da ida ao servidor.
    abrirEdicao(ordemDividida(15400, false));

    fireEvent.click(
      await screen.findByRole("button", { name: /salvar ordem/i }),
    );

    await waitFor(() => expect(avisos.length).toBe(1));
    expect(editarOrdem).not.toHaveBeenCalled();
    expect(avisos[0]).toMatch(/cart[ãa]o/i);
  });

  it("trocar a forma de cartão para PIX limpa o cartão escolhido", async () => {
    // Sem isto, o cartão fica pendurado numa forma que não é cartão e
    // `trg_oc_formas_cartao` recusa o salvamento com "So forma do tipo cartao de
    // credito aceita cartao" — falando de uma escolha que a tela já nem mostra.
    abrirEdicao(ordemDividida(15400));

    const seletores = await screen.findAllByRole("combobox", {
      name: /forma de pagamento/i,
    });
    // O último é o da linha do cartão na tabela de formas (a de R$ 15.000,00).
    const daLinhaDoCartao = seletores[seletores.length - 1]!;
    fireEvent.click(daLinhaDoCartao);
    fireEvent.click(await screen.findByRole("option", { name: "PIX" }));

    fireEvent.click(
      await screen.findByRole("button", { name: /salvar ordem/i }),
    );

    await waitFor(() => expect(avisos.length).toBe(1));
    // Duas linhas de PIX: o erro agora é sobre a forma repetida, NÃO sobre o
    // cartão. Se o cartão tivesse ficado, ele apareceria antes.
    expect(avisos[0]).not.toMatch(/cart[ãa]o/i);
  });

  it("salva sem avisar nada quando está tudo fechado", async () => {
    abrirEdicao(ordemDividida(15400));

    fireEvent.click(
      await screen.findByRole("button", { name: /salvar ordem/i }),
    );

    await waitFor(() => expect(editarOrdem).toHaveBeenCalledTimes(1));
    expect(avisos).toEqual([]);
  });
});
