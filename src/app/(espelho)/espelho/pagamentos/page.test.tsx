import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import EspelhoPagamentosPage from "@/app/(espelho)/espelho/pagamentos/page";
import { MAX_ESPELHOS } from "@/lib/ids-do-espelho";
import {
  getUsuarioLogado,
  temPermissao,
  type UsuarioLogado,
} from "@/lib/permissoes";
import { listarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import {
  buscarPagamentosParaEspelho,
  trilhaDeParcelas,
  type EspelhoPagamento,
} from "@/modules/financeiro/pagamentos/espelho";

// Mocka toda a cadeia de dados da página: o objetivo destes testes é a
// ORQUESTRAÇÃO da página (permissão antes da consulta, os quatro estados
// vazios, o rótulo de status certo), não o banco. `buscarPagamentosParaEspelho`
// e `trilhaDeParcelas` já têm cobertura própria em seus módulos.
vi.mock("@/lib/permissoes", () => ({
  getUsuarioLogado: vi.fn(),
  temPermissao: vi.fn(),
}));

vi.mock("@/modules/financeiro/pagamentos/espelho", () => ({
  buscarPagamentosParaEspelho: vi.fn(),
  trilhaDeParcelas: vi.fn(),
}));

vi.mock("@/modules/_shared/anexos/queries", () => ({
  listarAnexosPorDocumento: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const USUARIO: UsuarioLogado = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "Fulano de Tal",
  email: "fulano@emtconstrutora.com",
  ativo: true,
  perfilId: null,
  permissoes: [],
};

const ID_A = "550e8400-e29b-41d4-a716-446655440000";

/** Ids válidos (mesmo gerador de src/lib/ids-do-espelho.test.ts). */
function idsValidos(quantidade: number): string[] {
  return Array.from(
    { length: quantidade },
    (_, i) => `550e8400-e29b-41d4-a716-4466554${String(i).padStart(5, "0")}`,
  );
}

function pagamentoFixture(
  overrides: Partial<EspelhoPagamento> = {},
): EspelhoPagamento {
  return {
    id: ID_A,
    titulo: "LAN-2026-0001 parcela 2",
    numeroParcela: 2,
    dataVencimento: "2026-07-06",
    valor: 1000,
    desconto: 50,
    juros: 20,
    valorLiquido: 970,
    status: "pago",
    dataPagamento: "2026-06-26",
    contaNome: "BANCO DO BRASIL 102.124-9",
    lancamentoId: "550e8400-e29b-41d4-a716-446655440001",
    lancamentoNumero: "LAN-2026-0001",
    lancamentoDescricao: "Referente pagamento de salário",
    lancamentoValor: 3000,
    lancamentoStatus: "pago",
    lancamentoTipo: "a_pagar",
    lancamentoObservacoes: null,
    mesCompetencia: "2026-07-01",
    fornecedorNome: "João Santiago de Oliveira",
    categoriaNome: "Salário Mão de Obra",
    formaPagamentoNome: "PIX",
    rateios: [],
    ...overrides,
  };
}

async function renderPagina(ids?: string) {
  const jsx = await EspelhoPagamentosPage({
    searchParams: Promise.resolve(ids === undefined ? {} : { ids }),
  });
  render(jsx);
}

describe("EspelhoPagamentosPage", () => {
  it("sem permissão de ver mostra a página de sem permissão, e NUNCA chama a consulta", async () => {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(false);

    await renderPagina(ID_A);

    expect(screen.getByText("Sem permissão")).toBeInTheDocument();
    // Propriedade de segurança: sem "ver", a consulta nem deve rodar. Não
    // basta esconder o resultado na tela se o dado já saiu do banco.
    expect(buscarPagamentosParaEspelho).not.toHaveBeenCalled();
  });

  it("sem ids mostra nada para imprimir", async () => {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);

    await renderPagina(undefined);

    expect(screen.getByText("Nada para imprimir")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Marque ao menos um pagamento na listagem e clique em Imprimir espelho.",
      ),
    ).toBeInTheDocument();
    expect(buscarPagamentosParaEspelho).not.toHaveBeenCalled();
  });

  it("ids todos inválidos mostra nada para imprimir, com o aviso de link inválido", async () => {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);

    await renderPagina("nao-e-id,tambem-nao-e");

    expect(screen.getByText("Nada para imprimir")).toBeInTheDocument();
    expect(
      screen.getByText("O link não traz nenhum pagamento válido."),
    ).toBeInTheDocument();
    expect(buscarPagamentosParaEspelho).not.toHaveBeenCalled();
  });

  it("mais de 50 ids válidos recusa por seleção grande demais, sem truncar em silêncio", async () => {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);

    await renderPagina(idsValidos(MAX_ESPELHOS + 1).join(","));

    expect(screen.getByText("Seleção grande demais")).toBeInTheDocument();
    expect(buscarPagamentosParaEspelho).not.toHaveBeenCalled();
  });

  it("ids válidos mas nada visível (RLS) mostra nada visível para imprimir", async () => {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);
    vi.mocked(buscarPagamentosParaEspelho).mockResolvedValue([]);

    await renderPagina(ID_A);

    expect(screen.getByText("Nada visível para imprimir")).toBeInTheDocument();
  });

  it("lançamento a receber imprime 'A receber', nunca o código cru e invertido", async () => {
    // Regressão real (a mesma da revisão do espelho de lançamento): a
    // StatusLancamento "a_pagar" é o código genérico de pendência, usado tanto
    // por lançamentos a pagar quanto a receber. rotuloStatusLancamento(status,
    // tipo) é quem inverte pro rótulo certo quando tipo é "a_receber" — sem
    // passar o tipo, o papel imprimia o código cru, que para um recebível é
    // literalmente o texto errado, num documento que vai para contador.
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);
    vi.mocked(buscarPagamentosParaEspelho).mockResolvedValue([
      pagamentoFixture({
        lancamentoTipo: "a_receber",
        lancamentoStatus: "a_pagar",
      }),
    ]);
    vi.mocked(trilhaDeParcelas).mockResolvedValue({});
    vi.mocked(listarAnexosPorDocumento).mockResolvedValue({});

    await renderPagina(ID_A);

    expect(screen.getByText("A receber")).toBeInTheDocument();
    expect(screen.queryByText("a_pagar")).not.toBeInTheDocument();
  });
});
