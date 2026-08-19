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
import { formatarBRL, formatarData } from "@/lib/formatadores";
import {
  buscarLancamentosParaEspelho,
  resumirParcelas,
  type EspelhoLancamento,
  type EspelhoParcela,
} from "@/modules/financeiro/lancamentos/espelho";

// Mocka toda a cadeia de dados da página: o objetivo destes testes é a
// ORQUESTRAÇÃO da página (permissão antes da consulta, os quatro estados
// vazios, o rótulo de status certo), não o banco. `buscarLancamentosParaEspelho`
// já tem cobertura própria no módulo.
vi.mock("@/lib/permissoes", () => ({
  getUsuarioLogado: vi.fn(),
  temPermissao: vi.fn(),
}));

// `resumirParcelas` NÃO é mockada de propósito: ela é a conta de dinheiro que
// o papel imprime, e o teste da página tem que exercitar a conta de verdade a
// partir das parcelas da fixture, não um resumo declarado à mão que pode
// discordar delas.
vi.mock("@/modules/financeiro/lancamentos/espelho", async (original) => ({
  ...(await original<typeof import("@/modules/financeiro/lancamentos/espelho")>()),
  buscarLancamentosParaEspelho: vi.fn(),
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

/** Uma parcela de teste, com o mínimo que o resumo precisa. */
function parcelaFixture(
  overrides: Partial<EspelhoParcela> = {},
): EspelhoParcela {
  return {
    id: "p1",
    numeroParcela: 1,
    dataVencimento: "2026-08-12",
    valor: 1000,
    desconto: 0,
    juros: 0,
    valorLiquido: 1000,
    status: "pendente",
    dataPagamento: null,
    contaNome: null,
    ...overrides,
  };
}

function lancamentoFixture(
  overrides: Partial<EspelhoLancamento> = {},
): EspelhoLancamento {
  const parcelas = overrides.parcelas ?? [];
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
    parcelas,
    // Derivado das parcelas, com a MESMA função que a produção usa: fixture
    // que declara o resumo à mão consegue afirmar um total que não bate com as
    // linhas, que é justamente a classe de defeito que este espelho já teve.
    resumoParcelas: resumirParcelas(parcelas),
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
    vi.mocked(listarAnexosPorDocumento).mockResolvedValue({});

    await renderPagina(ID_A);

    expect(screen.getByText("A receber")).toBeInTheDocument();
    expect(screen.queryByText("a_pagar")).not.toBeInTheDocument();
  });
});

/** BRL como o testing-library enxerga: `formatarBRL` usa espaço não separável. */
function brl(valor: number): string {
  return formatarBRL(valor).replace(/\u00a0/g, " ");
}

describe("EspelhoLancamentosPage e o resumo das parcelas", () => {
  function prepararUsuario() {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);
    vi.mocked(listarAnexosPorDocumento).mockResolvedValue({});
  }

  it("imprime pagas e a pagar em vez de uma linha por parcela", async () => {
    // Parcelamento longo é o caso que motivou a troca: o DARF PERT da Receita
    // tem 150 parcelas, e a tabela antiga de nove colunas enchia folhas.
    // Aqui, três parcelas bastam para provar o agrupamento.
    prepararUsuario();
    vi.mocked(buscarLancamentosParaEspelho).mockResolvedValue([
      lancamentoFixture({
        parcelas: [
          parcelaFixture({
            id: "1",
            numeroParcela: 1,
            status: "pago",
            valor: 1000,
            desconto: 50,
            valorLiquido: 950,
            dataPagamento: "2026-07-10",
          }),
          parcelaFixture({
            id: "2",
            numeroParcela: 2,
            status: "pago",
            valor: 1000,
            valorLiquido: 1000,
            dataPagamento: "2026-08-10",
          }),
          parcelaFixture({
            id: "3",
            numeroParcela: 3,
            status: "pendente",
            valor: 1000,
            valorLiquido: 1000,
            dataVencimento: "2026-09-10",
          }),
        ],
      }),
    ]);

    await renderPagina(ID_A);

    // Os três números que o Tiago pediu, em cartão: quantas foram pagas,
    // quanto já saiu e quanto falta.
    expect(screen.getByText("Parcelas pagas")).toBeInTheDocument();
    expect(screen.getByText("2 de 3")).toBeInTheDocument();
    expect(screen.getByText("Já pago")).toBeInTheDocument();
    // "Em aberto", não "A pagar": "A pagar" é o rótulo do status do
    // lançamento, que sai na tarja do mesmo papel.
    expect(screen.getByText("Em aberto")).toBeInTheDocument();
    // Pagas somam o LÍQUIDO: 950 + 1.000. Somar o valor daria 2.000 e mentiria
    // sobre o caixa, porque a primeira teve R$ 50 de desconto.
    expect(screen.getByText(brl(1950))).toBeInTheDocument();
    expect(screen.queryByText(brl(2000))).not.toBeInTheDocument();
    // O total das parcelas fecha com os cartões: 1.950 pagas + 1.000 em aberto.
    // É a linha que deixa a divergência entre parcelamento e cabeçalho visível.
    expect(screen.getByText("Total das parcelas")).toBeInTheDocument();
    expect(screen.getByText(brl(2950))).toBeInTheDocument();

    // E a coluna "Conta", que antes colidia com o líquido na folha, sumiu
    // junto com a tabela parcela a parcela.
    expect(screen.queryByText("Nº")).not.toBeInTheDocument();
    expect(screen.queryByText("Líquido")).not.toBeInTheDocument();
  });

  it("mostra o próximo vencimento em aberto e o último pagamento", async () => {
    prepararUsuario();
    vi.mocked(buscarLancamentosParaEspelho).mockResolvedValue([
      lancamentoFixture({
        parcelas: [
          parcelaFixture({
            id: "1",
            numeroParcela: 1,
            status: "pago",
            dataPagamento: "2026-07-10",
          }),
          parcelaFixture({
            id: "2",
            numeroParcela: 2,
            status: "pendente",
            dataVencimento: "2026-10-05",
          }),
          parcelaFixture({
            id: "3",
            numeroParcela: 3,
            status: "pendente",
            dataVencimento: "2026-09-05",
          }),
        ],
      }),
    ]);

    await renderPagina(ID_A);

    expect(screen.getByText("Próximo vencimento")).toBeInTheDocument();
    // A mais ANTIGA em aberto, não a da primeira linha nem a do cabeçalho.
    expect(screen.getByText(formatarData("2026-09-05"))).toBeInTheDocument();
    // O último pagamento virou a nota do cartão de parcelas pagas: é contexto
    // do número, não um campo próprio, e no papel ele economiza uma linha.
    expect(
      screen.getByText(`última em ${formatarData("2026-07-10")}`),
    ).toBeInTheDocument();
  });

  it("lançamento sem nenhuma parcela paga sai com travessão no último pagamento", async () => {
    prepararUsuario();
    vi.mocked(buscarLancamentosParaEspelho).mockResolvedValue([
      lancamentoFixture({ parcelas: [parcelaFixture()] }),
    ]);

    await renderPagina(ID_A);

    // Sem nenhuma paga, a nota DIZ que não houve pagamento, em vez de deixar
    // o cartão sem contexto: no papel, vazio não distingue "não tem" de
    // "esqueceram de imprimir".
    expect(screen.getByText("nenhuma paga ainda")).toBeInTheDocument();
    expect(screen.getByText("0 de 1")).toBeInTheDocument();
  });

  it("não imprime mais a Trilha", async () => {
    prepararUsuario();
    vi.mocked(buscarLancamentosParaEspelho).mockResolvedValue([
      lancamentoFixture({ parcelas: [parcelaFixture()] }),
    ]);

    await renderPagina(ID_A);

    expect(screen.queryByText("Trilha")).not.toBeInTheDocument();
    expect(screen.queryByText("Quem")).not.toBeInTheDocument();
  });
});
