import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import EspelhoLancamentosPage from "@/app/(espelho)/espelho/lancamentos/page";
import { MAX_ESPELHOS } from "@/lib/ids-do-espelho";
import {
  getUsuarioLogado,
  temPermissao,
  type UsuarioLogado,
} from "@/lib/permissoes";
import { listarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import {
  buscarLancamentosParaEspelho,
  type EspelhoLancamento,
} from "@/modules/financeiro/lancamentos/espelho";
import { trilhaLancamento } from "@/modules/financeiro/lancamentos/queries";

// Mocka toda a cadeia de dados da página: o objetivo destes testes é a
// ORQUESTRAÇÃO da página (permissão antes da consulta, os quatro estados
// vazios, o rótulo de status certo), não o banco. `buscarLancamentosParaEspelho`
// e `trilhaLancamento` já têm cobertura própria em seus módulos.
vi.mock("@/lib/permissoes", () => ({
  getUsuarioLogado: vi.fn(),
  temPermissao: vi.fn(),
}));

vi.mock("@/modules/financeiro/lancamentos/espelho", () => ({
  buscarLancamentosParaEspelho: vi.fn(),
}));

vi.mock("@/modules/financeiro/lancamentos/queries", () => ({
  trilhaLancamento: vi.fn(),
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

function lancamentoFixture(
  overrides: Partial<EspelhoLancamento> = {},
): EspelhoLancamento {
  return {
    id: ID_A,
    numero: "LAN-2026-0001",
    descricao: "Aluguel de equipamento",
    valor: 1000,
    status: "a_pagar",
    tipo: "a_pagar",
    dataCompra: "2026-08-01",
    dataVencimento: "2026-08-12",
    mesCompetencia: "2026-08-01",
    observacoes: null,
    fornecedorNome: "Fornecedor Teste",
    categoriaNome: "Categoria Teste",
    formaPagamentoNome: "PIX",
    parcelas: [],
    rateios: [],
    ...overrides,
  };
}

async function renderPagina(ids?: string) {
  const jsx = await EspelhoLancamentosPage({
    searchParams: Promise.resolve(ids === undefined ? {} : { ids }),
  });
  render(jsx);
}

describe("EspelhoLancamentosPage", () => {
  it("sem permissão de ver mostra a página de sem permissão, e NUNCA chama a consulta", async () => {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(false);

    await renderPagina(ID_A);

    expect(screen.getByText("Sem permissão")).toBeInTheDocument();
    // Propriedade de segurança: sem "ver", a consulta nem deve rodar. Não
    // basta esconder o resultado na tela se o dado já saiu do banco.
    expect(buscarLancamentosParaEspelho).not.toHaveBeenCalled();
  });

  it("sem ids mostra nada para imprimir", async () => {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);

    await renderPagina(undefined);

    expect(screen.getByText("Nada para imprimir")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Marque ao menos um lançamento na listagem e clique em Imprimir espelho.",
      ),
    ).toBeInTheDocument();
    expect(buscarLancamentosParaEspelho).not.toHaveBeenCalled();
  });

  it("ids todos inválidos mostra nada para imprimir, com o aviso de link inválido", async () => {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);

    await renderPagina("nao-e-id,tambem-nao-e");

    expect(screen.getByText("Nada para imprimir")).toBeInTheDocument();
    expect(
      screen.getByText("O link não traz nenhum lançamento válido."),
    ).toBeInTheDocument();
    expect(buscarLancamentosParaEspelho).not.toHaveBeenCalled();
  });

  it("mais de 50 ids válidos recusa por seleção grande demais, sem truncar em silêncio", async () => {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);

    await renderPagina(idsValidos(MAX_ESPELHOS + 1).join(","));

    expect(screen.getByText("Seleção grande demais")).toBeInTheDocument();
    expect(buscarLancamentosParaEspelho).not.toHaveBeenCalled();
  });

  it("ids válidos mas nada visível (RLS) mostra nada visível para imprimir", async () => {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);
    vi.mocked(buscarLancamentosParaEspelho).mockResolvedValue([]);

    await renderPagina(ID_A);

    expect(screen.getByText("Nada visível para imprimir")).toBeInTheDocument();
  });

  it("lançamento a receber imprime 'A receber', nunca o código cru e invertido", async () => {
    // Regressão real: a StatusLancamento "a_pagar" é o código genérico de
    // pendência, usado tanto por lançamentos a pagar quanto a receber.
    // rotuloStatusLancamento(status, tipo) é quem inverte pro rótulo certo
    // quando tipo é "a_receber" — sem passar o tipo, o papel imprimia o
    // código cru, que para um recebível é literalmente o texto errado.
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);
    vi.mocked(buscarLancamentosParaEspelho).mockResolvedValue([
      lancamentoFixture({ tipo: "a_receber", status: "a_pagar" }),
    ]);
    vi.mocked(trilhaLancamento).mockResolvedValue([]);
    vi.mocked(listarAnexosPorDocumento).mockResolvedValue({});

    await renderPagina(ID_A);

    expect(screen.getByText("A receber")).toBeInTheDocument();
    expect(screen.queryByText("a_pagar")).not.toBeInTheDocument();
  });
});
