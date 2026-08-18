import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PagamentosCliente } from "@/modules/financeiro/pagamentos/components/pagamentos-cliente";
import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import type { ParcelaPaga } from "@/modules/financeiro/pagamentos/queries";

/**
 * Único teste que renderiza PagamentosCliente inteira. Mesmo motivo de
 * lancamentos-tabela-barra-selecao.test.tsx e
 * ordens-tabela-barra-selecao.test.tsx: só um teste que troca de aba e aperta
 * o checkbox de verdade pega `idDaLinha` errado, uma BarraSelecao aninhada, ou
 * a seleção sobrevivendo à troca de aba (que imprimiria linha que o usuário
 * não está mais vendo).
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/financeiro/pagamentos",
  useSearchParams: () => new URLSearchParams(),
}));

// O DataTable busca e grava a preferência de coluna por Server Action, que usa
// cookies() — inexistente fora de uma requisição. Mesmo mock de
// lancamentos-tabela-barra-selecao.test.tsx.
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

// "use server" de verdade chama createClient() do Supabase, que também exige
// uma requisição. Nenhum teste aqui dispara paginação nem estorno, então o
// retorno nunca é olhado.
vi.mock("@/modules/financeiro/pagamentos/actions", () => ({
  buscarParcelasPagas: vi.fn(async () => ({ itens: [], total: 0 })),
  estornarPagamento: vi.fn(async () => ({ ok: true })),
}));

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

function parcelaPaga(troca: Partial<ParcelaPaga> = {}): ParcelaPaga {
  return {
    id: ID_A,
    lancamentoNumero: "LAN-2026-0015",
    numeroParcela: 1,
    descricao: "Combustível julho",
    categoriaNome: "Combustível",
    fornecedorNome: "GUERRA IMPLEMENTOS RODOVIARIOS S.A",
    contaNome: "Obra 364",
    dataPagamento: "2026-08-10",
    valor: 1000,
    desconto: 0,
    juros: 0,
    valorLiquido: 1000,
    ...troca,
  };
}

const PAGAS = [
  parcelaPaga({ id: ID_A, numeroParcela: 1 }),
  parcelaPaga({
    id: ID_B,
    numeroParcela: 2,
    lancamentoNumero: "LAN-2026-0016",
  }),
];

const VALORES_A_PAGAR = {
  busca: "",
  fornecedor: "",
  conta: "",
  valorDe: "",
  valorAte: "",
  vencDe: "",
  vencAte: "",
  progDe: "",
  progAte: "",
};

function montar() {
  return render(
    <PagamentosCliente
      aprovadas={[]}
      pagas={PAGAS}
      totalPagas={PAGAS.length}
      contas={[]}
      fornecedores={[]}
      podePagar={false}
      podeEstornar={false}
      hoje="2026-08-18"
      valoresAPagar={VALORES_A_PAGAR}
      valoresPagas={{ ...VALORES_A_PAGAR, pagoDe: "", pagoAte: "" }}
      filtrosPagas={{}}
    />,
  );
}

/**
 * Troca de aba do Radix: o gatilho reage a `onMouseDown`, não a `onClick` (ver
 * TabsTrigger em @radix-ui/react-tabs). `fireEvent.click` sozinho não move o
 * `data-state` da aba, e a troca fica sem efeito nenhum no teste.
 */
function irParaAbaPagas() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Pagas" }));
}

function irParaAbaAPagar() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: "A pagar" }));
}

function marcar(id: string) {
  fireEvent.click(screen.getByRole("checkbox", { name: `Selecionar ${id}` }));
}

afterEach(() => {
  cleanup();
  limparEstadosTabelaParaTeste();
});

describe("Seleção na aba Pagas de PagamentosCliente", () => {
  it("zero selecionado: a barra não aparece", () => {
    montar();
    irParaAbaPagas();
    expect(screen.queryByText(/selecionado/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Limpar seleção" }),
    ).not.toBeInTheDocument();
  });

  it("marcar parcelas pagas mostra a barra com a contagem certa e o botão de espelho com os ids certos", () => {
    montar();
    irParaAbaPagas();
    marcar(ID_A);
    marcar(ID_B);

    expect(screen.getByText("2 selecionados")).toBeInTheDocument();

    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    fireEvent.click(
      screen.getByRole("button", { name: "Imprimir espelho (2)" }),
    );
    expect(abrir).toHaveBeenCalledWith(
      `/espelho/pagamentos?ids=${ID_A}%2C${ID_B}`,
      "_blank",
      "noopener,noreferrer",
    );
    vi.unstubAllGlobals();
  });

  it("trocar de aba limpa a seleção: senão imprimiria linha que o usuário não está mais vendo", () => {
    montar();
    irParaAbaPagas();
    marcar(ID_A);
    expect(screen.getByText("1 selecionado")).toBeInTheDocument();

    irParaAbaAPagar();
    irParaAbaPagas();

    expect(screen.queryByText(/selecionado/i)).not.toBeInTheDocument();
  });
});
