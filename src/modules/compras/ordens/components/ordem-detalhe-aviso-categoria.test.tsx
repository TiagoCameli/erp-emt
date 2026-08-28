import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { OrdemDetalheView } from "@/modules/compras/ordens/components/ordem-detalhe";
import type { OrdemDetalhe, OrdemItem } from "@/modules/compras/ordens/queries";

/**
 * O aviso de "item sem categoria de custo" na tela da OC.
 *
 * Existe porque `fn_aprovar_ordem_compra` recusa a ordem inteira quando um item
 * aponta para insumo sem `categoria_financeira_id` -- e o campo não mora na OC,
 * mora no cadastro do insumo. Sem este aviso o único sinal era o erro genérico
 * do banco no clique de Aprovar, sem dizer qual item nem para onde ir.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/compras/ordens",
  useSearchParams: () => new URLSearchParams(),
}));

// Server Actions e o painel de anexos batem em cookies()/Storage, inexistentes
// no jsdom. O teste só olha para o aviso, então basta não estourar.
vi.mock("@/modules/compras/ordens/actions", () => ({
  aprovarOrdem: vi.fn(),
  cancelarOrdem: vi.fn(),
  desaprovarOrdem: vi.fn(),
  enviarParaAprovacao: vi.fn(),
  excluirOrdemCompra: vi.fn(),
  rejeitarOrdem: vi.fn(),
}));
vi.mock("@/components/canonicos/anexos", () => ({
  Anexos: () => null,
}));

const ID_ORDEM = "11111111-1111-4111-8111-111111111111";

/**
 * Um item da OC. `semCategoriaCusto` é DERIVADO da categoria, e não um campo que
 * a fixture escolhe: no banco os dois saem da mesma coluna
 * (`insumos.categoria_financeira_id`), então um item "sem categoria de custo" que
 * ao mesmo tempo tem categoria é um estado que não existe. Fixture impossível
 * prova a crença de quem a escreveu, não o comportamento do código.
 */
function item(troca: Partial<OrdemItem> = {}): OrdemItem {
  const base = {
    id: "22222222-2222-4222-8222-222222222222",
    insumoId: "33333333-3333-4333-8333-333333333333",
    insumoNome: "MUNHÃO",
    unidade: "un",
    quantidade: 1,
    precoUnitario: 150,
    subtotal: 150,
    centroCustoId: "44444444-4444-4444-8444-444444444444",
    centroCustoNome: "Hilux SQR1C93 - 07",
    categoriaCustoId: "77777777-7777-4777-8777-777777777777" as string | null,
    categoriaCustoNome: "Peças e manutenção" as string | null,
    ...troca,
  };
  return { ...base, semCategoriaCusto: base.categoriaCustoId === null };
}

/** O item que trava a aprovação: insumo sem categoria de custo no cadastro. */
function itemSemCategoria(troca: Partial<OrdemItem> = {}): OrdemItem {
  return item({ categoriaCustoId: null, categoriaCustoNome: null, ...troca });
}

function ordem(troca: Partial<OrdemDetalhe> = {}): OrdemDetalhe {
  return {
    id: ID_ORDEM,
    numero: "OC-2026-0038",
    fornecedorId: "55555555-5555-4555-8555-555555555555",
    fornecedorNome: "PODIUM AUTO CENTER",
    condicaoPagamentoId: null,
    condicaoPagamentoDescricao: "À vista",
    formaPagamentoId: null,
    cotacaoId: null,
    cotacaoNumero: null,
    descricao: "Manutenção da Hilux",
    categoriaId: null,
    categoriaNome: null,
    valorTotal: 150,
    ajustes: { frete: 0, outrasDespesas: 0, impostos: 0, desconto: 0 },
    status: "pendente_aprovacao",
    motivoRejeicao: null,
    dataCompra: "2026-08-20",
    mesCompetencia: "2026-08-01",
    criadoEm: "2026-08-20T14:00:00Z",
    numeroDocumento: null,
    observacoes: null,
    itens: [item()],
    parcelas: [],
    // Ordem sem formas declaradas: e o estado das ordens antigas.
    formas: [],
    lancamento: null,
    ...troca,
  };
}

function renderizar(detalhe: OrdemDetalhe) {
  return render(
    <OrdemDetalheView
      ordem={detalhe}
      trilha={[]}
      fornecedores={[]}
      insumos={[]}
      centrosCusto={[]}
      condicoesPagamento={[]}
      formasPagamento={[]}
      categorias={[]}
      cartoes={[]}
      parcelasCondicao={[]}
      anexosIniciais={[]}
      podeEditar
      podeAprovar
      podeDesaprovar
      podeExcluir
      podeReceber
      podeVerLancamento
    />,
  );
}

afterEach(cleanup);

describe("aviso de item sem categoria de custo", () => {
  it("não aparece quando todos os itens estão classificados", () => {
    renderizar(ordem());

    expect(screen.queryByText(/sem categoria de custo/i)).toBeNull();
  });

  it("nomeia o item que trava a aprovação e leva ao cadastro dele", () => {
    renderizar(ordem({ itens: [itemSemCategoria()] }));

    expect(screen.getByText("1 item está sem categoria de custo")).toBeTruthy();

    // O link é o atalho para resolver: o campo mora no cadastro do insumo,
    // e a busca já vem preenchida com o nome dele.
    const link = screen.getByRole("link", { name: /MUNHÃO/ });
    expect(link.getAttribute("href")).toBe(
      "/cadastros/insumos?busca=MUNH%C3%83O",
    );
  });

  it("conta no plural quando é mais de um item", () => {
    renderizar(
      ordem({
        itens: [
          itemSemCategoria(),
          itemSemCategoria({
            id: "66666666-6666-4666-8666-666666666666",
            insumoNome: "CORREIA DO ALTERNADOR",
          }),
        ],
      }),
    );

    expect(
      screen.getByText("2 itens estão sem categoria de custo"),
    ).toBeTruthy();
  });

  /**
   * A trava só vale antes da aprovação. Numa OC já aprovada o lançamento e os
   * rateios já foram gerados com a categoria que existia na hora, então repetir
   * o alerta ali só assustaria sem ter o que fazer.
   */
  it("some depois da ordem aprovada", () => {
    renderizar(
      ordem({
        status: "aprovado",
        itens: [itemSemCategoria()],
      }),
    );

    expect(screen.queryByText("1 item está sem categoria de custo")).toBeNull();
  });
});
