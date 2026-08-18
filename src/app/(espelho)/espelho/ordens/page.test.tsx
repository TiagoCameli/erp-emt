import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import EspelhoOrdensPage from "@/app/(espelho)/espelho/ordens/page";
import { formatarBRL } from "@/lib/formatadores";
import { MAX_ESPELHOS } from "@/lib/ids-do-espelho";
import {
  getUsuarioLogado,
  temPermissao,
  type UsuarioLogado,
} from "@/lib/permissoes";
import { listarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import {
  buscarOrdensParaEspelho,
  type EspelhoOrdem,
} from "@/modules/compras/ordens/espelho";
import { trilhaOrdem } from "@/modules/compras/ordens/queries";

// Mocka toda a cadeia de dados da página: o objetivo destes testes é a
// ORQUESTRAÇÃO da página (permissão antes da consulta, os quatro estados
// vazios, o rótulo de status certo), não o banco. `buscarOrdensParaEspelho`
// e `trilhaOrdem` já têm cobertura própria em seus módulos.
vi.mock("@/lib/permissoes", () => ({
  getUsuarioLogado: vi.fn(),
  temPermissao: vi.fn(),
}));

vi.mock("@/modules/compras/ordens/espelho", () => ({
  buscarOrdensParaEspelho: vi.fn(),
}));

vi.mock("@/modules/compras/ordens/queries", () => ({
  trilhaOrdem: vi.fn(),
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

function ordemFixture(overrides: Partial<EspelhoOrdem> = {}): EspelhoOrdem {
  return {
    id: ID_A,
    numero: "OC-2026-0001",
    descricao: "Pedra para a obra",
    // valorTotal É o total da ordem (itens + ajustes), não a soma dos itens:
    // 100.000 de itens + 500 de frete = 100.500.
    valorTotal: 100500,
    somaItens: 100000,
    frete: 500,
    outrasDespesas: 0,
    impostos: 0,
    desconto: 0,
    status: "aprovado",
    motivoRejeicao: null,
    dataCompra: "2026-07-31",
    mesCompetencia: "2026-07-01",
    observacoes: null,
    fornecedorNome: "BRITAM",
    categoriaNome: "Materiais",
    cotacaoNumero: "COT-2026-0003",
    condicaoDescricao: "À Vista",
    itens: [],
    parcelas: [],
    rateios: [],
    ...overrides,
  };
}

async function renderPagina(ids?: string) {
  const jsx = await EspelhoOrdensPage({
    searchParams: Promise.resolve(ids === undefined ? {} : { ids }),
  });
  render(jsx);
}

describe("EspelhoOrdensPage", () => {
  it("sem permissão de ver mostra a página de sem permissão, e NUNCA chama a consulta", async () => {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(false);

    await renderPagina(ID_A);

    expect(screen.getByText("Sem permissão")).toBeInTheDocument();
    // Propriedade de segurança: sem "ver", a consulta nem deve rodar. Não
    // basta esconder o resultado na tela se o dado já saiu do banco.
    expect(buscarOrdensParaEspelho).not.toHaveBeenCalled();
  });

  it("sem ids mostra nada para imprimir", async () => {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);

    await renderPagina(undefined);

    expect(screen.getByText("Nada para imprimir")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Marque ao menos uma ordem na listagem e clique em Imprimir espelho.",
      ),
    ).toBeInTheDocument();
    expect(buscarOrdensParaEspelho).not.toHaveBeenCalled();
  });

  it("ids todos inválidos mostra nada para imprimir, com o aviso de link inválido", async () => {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);

    await renderPagina("nao-e-id,tambem-nao-e");

    expect(screen.getByText("Nada para imprimir")).toBeInTheDocument();
    expect(
      screen.getByText("O link não traz nenhuma ordem de compra válida."),
    ).toBeInTheDocument();
    expect(buscarOrdensParaEspelho).not.toHaveBeenCalled();
  });

  it("mais de 50 ids válidos recusa por seleção grande demais, sem truncar em silêncio", async () => {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);

    await renderPagina(idsValidos(MAX_ESPELHOS + 1).join(","));

    expect(screen.getByText("Seleção grande demais")).toBeInTheDocument();
    expect(buscarOrdensParaEspelho).not.toHaveBeenCalled();
  });

  it("ids válidos mas nada visível (RLS) mostra nada visível para imprimir", async () => {
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);
    vi.mocked(buscarOrdensParaEspelho).mockResolvedValue([]);

    await renderPagina(ID_A);

    expect(screen.getByText("Nada visível para imprimir")).toBeInTheDocument();
  });

  it("imprime o rótulo do status, nunca o código cru do banco", async () => {
    // Regressão real: o brief original imprimia `ordem.status` direto, o que
    // colocaria "pendente_aprovacao" no papel em vez de "Pendente de
    // aprovação". infoStatusOC(status).rotulo é quem traduz.
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);
    vi.mocked(buscarOrdensParaEspelho).mockResolvedValue([
      ordemFixture({ status: "pendente_aprovacao" }),
    ]);
    vi.mocked(trilhaOrdem).mockResolvedValue([]);
    vi.mocked(listarAnexosPorDocumento).mockResolvedValue({});

    await renderPagina(ID_A);

    expect(screen.getByText("Pendente de aprovação")).toBeInTheDocument();
    expect(screen.queryByText("pendente_aprovacao")).not.toBeInTheDocument();
  });

  it("o total da ordem e o total dos itens saem com rótulos diferentes, e o papel diz quanto vale a OC", async () => {
    // Regressão real e cara: o cabeçalho imprimia `valorTotal` (que a
    // migration 20260817160000 passou a definir como itens + frete + outras +
    // impostos - desconto) rotulado "Total dos itens", e o rodapé da tabela
    // imprimia a soma real dos itens sob o MESMO rótulo. Dois números
    // diferentes com o mesmo nome, e nenhum campo dizendo o valor da ordem.
    // Números da OC 2592 do Mais Controle.
    vi.mocked(getUsuarioLogado).mockResolvedValue(USUARIO);
    vi.mocked(temPermissao).mockReturnValue(true);
    vi.mocked(buscarOrdensParaEspelho).mockResolvedValue([
      ordemFixture({
        valorTotal: 100000,
        somaItens: 103835.95,
        frete: 0,
        desconto: 3835.95,
        itens: [
          {
            id: "item-1",
            insumoNome: "Serviço",
            unidade: null,
            // 5 x 20.767,19 = 103.835,95. Quantidade e preço diferentes do
            // subtotal de propósito: assim a contagem de ocorrências abaixo
            // mede as células que interessam, e não o eco do preço unitário.
            quantidade: 5,
            precoUnitario: 20767.19,
            subtotal: 103835.95,
            centroCustoId: "aaaaaaaa-0000-4000-8000-000000000001",
            centroCustoNome: "009 - Lote 09",
            centroCustoCodigo: "009",
          },
        ],
      }),
    ]);
    vi.mocked(trilhaOrdem).mockResolvedValue([]);
    vi.mocked(listarAnexosPorDocumento).mockResolvedValue({});

    await renderPagina(ID_A);

    // O valor da ordem aparece, e sob o nome dele.
    expect(screen.getByText("Total da ordem")).toBeInTheDocument();
    expect(screen.getByText(brl(100000))).toBeInTheDocument();

    // A soma dos itens aparece sob o rótulo "Total dos itens" nos dois lugares
    // (campo do cabeçalho e rodapé da tabela), sempre com o MESMO número. As
    // três células com esse valor são: o campo do cabeçalho, o subtotal da
    // única linha de item, e o rodapé da tabela.
    expect(screen.getAllByText("Total dos itens")).toHaveLength(2);
    expect(screen.getAllByText(brl(103835.95))).toHaveLength(3);
    // E os dois números NÃO são o mesmo: era exatamente isso que o papel
    // escondia ao dar o mesmo rótulo aos dois.
    expect(screen.queryAllByText(brl(100000))).toHaveLength(1);

    // E o desconto vai com o sinal, para a conta fechar no papel.
    expect(screen.getByText("Desconto (−)")).toBeInTheDocument();
    expect(screen.getByText(brl(3835.95))).toBeInTheDocument();
  });
});
