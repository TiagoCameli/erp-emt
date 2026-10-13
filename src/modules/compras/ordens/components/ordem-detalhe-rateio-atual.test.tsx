import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { OrdemDetalheView } from "@/modules/compras/ordens/components/ordem-detalhe";
import type { OrdemDetalhe, OrdemItem } from "@/modules/compras/ordens/queries";

/**
 * O rateio atual do lançamento na tela da OC.
 *
 * `fn_definir_rateio_lancamento` reparte o custo de um lançamento aprovado ou
 * pago entre outras obras e NÃO encosta nos itens da OC: eles guardam o centro
 * da compra. Os relatórios de custo leem o rateio do lançamento. Sem este aviso
 * a OC-2026-0140 mostrava R$ 70.971,60 na BR-364 enquanto o custo já estava no
 * AC 405, e a correção parecia não ter pegado.
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
// As tabelas de itens, formas e parcelas são DataTable com idTabela, que lê e
// grava a preferência do usuário por Server Action.
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

const ID_ORDEM = "11111111-1111-4111-8111-111111111111";
const SUBCATEGORIA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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
    subcategoriaId: SUBCATEGORIA,
    subcategoriaNome: "Peças e componentes",
    ...troca,
  };
  return { ...base, semCategoriaCusto: base.categoriaCustoId === null };
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
      subcategorias={[]}
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

const LANCAMENTO = {
  id: "88888888-8888-4888-8888-888888888888",
  numero: "LAN-2026-6808",
  status: "pago",
  valor: 150,
  dataVencimento: "2026-10-05",
  aberto: 0,
};

afterEach(() => {
  cleanup();
  limparEstadosTabelaParaTeste();
});

describe("rateio atual do lançamento na OC", () => {
  it("não aparece quando o rateio nunca foi alterado no lançamento", () => {
    renderizar(
      ordem({
        status: "aprovado",
        lancamento: { ...LANCAMENTO, rateioAlterado: null },
      }),
    );

    expect(screen.queryByText(/rateio alterado no lançamento/i)).toBeNull();
  });

  it("mostra o rateio atual, quem mudou e por quê", () => {
    renderizar(
      ordem({
        status: "aprovado",
        lancamento: {
          ...LANCAMENTO,
          rateioAlterado: {
            em: "2026-10-13T22:17:37Z",
            porNome: "Tiago Cameli",
            motivo: "estava errado",
            linhas: [
              {
                centroCustoId: "99999999-9999-4999-8999-999999999999",
                centroCustoNome: "007.1 AC405 - Lote 2",
                valor: 100,
              },
              {
                centroCustoId: "44444444-4444-4444-8444-444444444444",
                centroCustoNome: "Hilux SQR1C93 - 07",
                valor: 50,
              },
            ],
          },
        },
      }),
    );

    expect(screen.getByText(/rateio alterado no lançamento/i)).toBeTruthy();
    expect(screen.getByText(/Tiago Cameli/)).toBeTruthy();
    expect(screen.getByText(/estava errado/)).toBeTruthy();

    const lista = screen.getByRole("list", { name: "Rateio atual" });
    expect(lista.textContent).toContain("007.1 AC405 - Lote 2");
    expect(lista.textContent).toMatch(/R\$\s100,00/);
    expect(lista.textContent).toMatch(/R\$\s50,00/);
  });
});
