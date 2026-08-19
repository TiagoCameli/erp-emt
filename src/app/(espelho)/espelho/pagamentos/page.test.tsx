import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import EspelhoPagamentosPage from "@/app/(espelho)/espelho/pagamentos/page";
import { formatarBRL, formatarData } from "@/lib/formatadores";
import { MAX_ESPELHOS } from "@/lib/ids-do-espelho";
import {
  getUsuarioLogado,
  temPermissao,
  type UsuarioLogado,
} from "@/lib/permissoes";
import { listarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import {
  buscarPagamentosParaEspelho,
  type EspelhoPagamento,
} from "@/modules/financeiro/pagamentos/espelho";

// Mocka toda a cadeia de dados da página: o objetivo destes testes é a
// ORQUESTRAÇÃO da página (permissão antes da consulta, os quatro estados
// vazios, o rótulo de status certo), não o banco. `buscarPagamentosParaEspelho`
// já tem cobertura própria no módulo.
vi.mock("@/lib/permissoes", () => ({
  getUsuarioLogado: vi.fn(),
  temPermissao: vi.fn(),
}));

vi.mock("@/modules/financeiro/pagamentos/espelho", () => ({
  buscarPagamentosParaEspelho: vi.fn(),
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

/**
 * BRL como o testing-library enxerga.
 *
 * Assertar pelo formatador, e não por literal: se o formato mudar, o teste tem
 * que quebrar junto. Mas `formatarBRL` usa espaço NÃO SEPARÁVEL (U+00A0) e o
 * normalizador do testing-library troca isso por espaço comum antes de
 * comparar — então o matcher precisa da mesma troca, senão nunca bate.
 */
function brl(valor: number): string {
  return formatarBRL(valor).replace(/\u00a0/g, " ");
}

/** Ids válidos (mesmo gerador de src/lib/ids-do-espelho.test.ts). */
function idsValidos(quantidade: number): string[] {
  return Array.from(
    { length: quantidade },
    (_, i) => `550e8400-e29b-41d4-a716-4466554${String(i).padStart(5, "0")}`,
  );
}

/**
 * O valor impresso ao lado de um rótulo da grade de campos.
 *
 * A grade é `<dt>rótulo</dt><dd>valor</dd>`: pegar o `dd` irmão é o único jeito
 * de provar que "Pago em" saiu travessão sem esbarrar nos outros travessões da
 * folha (num documento de parcela em aberto há vários).
 */
function valorDoCampo(rotulo: string): string {
  const dt = screen.getByText(rotulo);
  return dt.nextElementSibling?.textContent ?? "";
}

function pagamentoFixture(
  overrides: Partial<EspelhoPagamento> = {},
): EspelhoPagamento {
  const base: EspelhoPagamento = {
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
    somaRateios: 0,
    ...overrides,
  };
  // `somaRateios` sempre derivado das linhas, igual ao que
  // `montarEspelhoPagamento` faz: fixture que pudesse declarar uma soma
  // diferente do rateio impresso provaria o contrário do que o teste quer.
  return {
    ...base,
    somaRateios: base.rateios.reduce((soma, rateio) => soma + rateio.valor, 0),
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

  it("quem tem SÓ a aba de aprovação imprime, porque o botão vive lá também", async () => {
    // A fila de aprovação e os pagamentos diretos oferecem "Imprimir espelho".
    // Se esta rota exigisse apenas `financeiro.pagamentos`, quem tem só a aba
    // de aprovação clicaria no botão e cairia em "Sem permissão" — o botão
    // existiria só para recusar. Não alarga nada: essa pessoa já lê a mesma
    // parcela na tela de detalhe da aprovação, e a RLS segue decidindo linha a
    // linha.
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockImplementation(
      (_usuario, recurso) => recurso === "financeiro.aprovacao-pagamentos",
    );
    vi.mocked(buscarPagamentosParaEspelho).mockResolvedValue([]);

    await renderPagina(ID_A);

    expect(screen.queryByText("Sem permissão")).not.toBeInTheDocument();
    expect(buscarPagamentosParaEspelho).toHaveBeenCalled();
  });

  it("quem tem SÓ a listagem de pagas continua imprimindo", async () => {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockImplementation(
      (_usuario, recurso) => recurso === "financeiro.pagamentos",
    );
    vi.mocked(buscarPagamentosParaEspelho).mockResolvedValue([]);

    await renderPagina(ID_A);

    expect(screen.queryByText("Sem permissão")).not.toBeInTheDocument();
    expect(buscarPagamentosParaEspelho).toHaveBeenCalled();
  });

  it("quem não tem NENHUM dos dois recursos continua barrado antes da consulta", async () => {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockImplementation(
      (_usuario, recurso) => recurso === "compras.ordens",
    );

    await renderPagina(ID_A);

    expect(screen.getByText("Sem permissão")).toBeInTheDocument();
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
    vi.mocked(listarAnexosPorDocumento).mockResolvedValue({});

    await renderPagina(ID_A);

    expect(screen.getByText("A receber")).toBeInTheDocument();
    expect(screen.queryByText("a_pagar")).not.toBeInTheDocument();
  });
});

describe("EspelhoPagamentosPage e a parcela que ainda não foi paga", () => {
  function prepararUsuario() {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);
    vi.mocked(listarAnexosPorDocumento).mockResolvedValue({});
  }

  it("parcela pendente não afirma pagamento: título 'Parcela', 'Saiu da conta' e 'Pago em' em travessão", async () => {
    // O link do espelho é colável, então este é o caminho que resta depois de o
    // botão sumir da tela de aprovação. `valorLiquido` continua preenchido
    // (coluna calculada), e imprimi-lo como "Saiu da conta" seria dizer que
    // saiu da conta dinheiro que não saiu — num papel que vai para contador e
    // para processo.
    prepararUsuario();
    vi.mocked(buscarPagamentosParaEspelho).mockResolvedValue([
      pagamentoFixture({
        status: "pendente",
        lancamentoStatus: "a_pagar",
        dataPagamento: null,
      }),
    ]);

    await renderPagina(ID_A);

    // Duas vezes: o título do documento e o rótulo da primeira seção. A seção
    // acompanha o título de propósito — uma seção chamada "Pagamento" num papel
    // intitulado "Parcela" reintroduziria em miniatura a afirmação que o título
    // acabou de tirar.
    expect(screen.getAllByText("Parcela")).toHaveLength(2);
    expect(screen.queryAllByText("Pagamento")).toHaveLength(0);
    expect(valorDoCampo("Saiu da conta")).toBe("—");
    expect(valorDoCampo("Pago em")).toBe("—");
    // Nem em outro canto do papel: o líquido de um pagamento que não houve não
    // pode aparecer em lugar nenhum.
    expect(screen.queryByText(brl(970))).not.toBeInTheDocument();
    // E o resto do documento continua útil: valor da parcela, vencimento e o
    // status real da parcela seguem impressos.
    expect(valorDoCampo("Valor da parcela")).toBe(formatarBRL(1000));
    expect(valorDoCampo("Vencimento")).toBe(formatarData("2026-07-06"));
    expect(valorDoCampo("Status")).toBe("Pendente");
  });

  it("parcela paga continua saindo como 'Pagamento', com o líquido e a data", async () => {
    prepararUsuario();
    vi.mocked(buscarPagamentosParaEspelho).mockResolvedValue([
      pagamentoFixture(),
    ]);

    await renderPagina(ID_A);

    // "Parcela" é o título do documento degradado; num pagamento de verdade ele
    // não aparece em canto nenhum do papel, nem como rótulo de seção.
    expect(screen.queryByText("Parcela")).not.toBeInTheDocument();
    expect(screen.getAllByText("Pagamento")).toHaveLength(2);
    expect(valorDoCampo("Saiu da conta")).toBe(formatarBRL(970));
    expect(valorDoCampo("Pago em")).toBe(formatarData("2026-06-26"));
  });
});

describe("EspelhoPagamentosPage e o total do rateio", () => {
  it("soma as linhas impressas em vez de ecoar o valor do lançamento", async () => {
    // Rateio DIVERGENTE de propósito (700 + 500 = 1.200 contra um lançamento de
    // 3.000): com rateio que fecha, um total que ecoa o pai passaria no teste
    // sem provar nada. É justamente a divergência que o papel tem que mostrar.
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);
    vi.mocked(listarAnexosPorDocumento).mockResolvedValue({});
    vi.mocked(buscarPagamentosParaEspelho).mockResolvedValue([
      pagamentoFixture({
        lancamentoValor: 3000,
        rateios: [
          { centroNome: "Escritório Central", centroCodigo: "001", valor: 700 },
          { centroNome: "BR-364 Lote 09", centroCodigo: "009", valor: 500 },
        ],
      }),
    ]);

    await renderPagina(ID_A);

    // O rótulo diz o que o número é. "Total do lançamento" sobre a soma do
    // rateio seria um número com o nome de outro.
    expect(screen.getByText("Total do rateio")).toBeInTheDocument();
    expect(screen.queryByText("Total do lançamento")).not.toBeInTheDocument();
    expect(screen.getByText(brl(1200))).toBeInTheDocument();
    // O valor do lançamento aparece UMA vez só, na seção "Lançamento de
    // origem". Se aparecesse duas, o total estaria ecoando o pai de novo — e é
    // a comparação entre os dois números que revela a divergência.
    expect(screen.queryAllByText(brl(3000))).toHaveLength(1);
  });
});
