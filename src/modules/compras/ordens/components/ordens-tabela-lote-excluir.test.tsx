import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { OrdensTabela } from "@/modules/compras/ordens/components/ordens-tabela";
import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import type { OrdemLista } from "@/modules/compras/ordens/queries";

/**
 * O FIO da exclusão em lote: checkbox -> barra de seleção -> botão -> diálogo ->
 * Server Action.
 *
 * O que nenhuma suíte unitária pega e este teste pega: o botão aparecer para
 * status que NÃO pode ser excluído, a contagem do botão contar as marcadas em vez
 * das elegíveis, e a ação receber id que não devia. Numa ação definitiva, cada um
 * desses é dinheiro apagado sem volta.
 */

const roteador = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: roteador.refresh,
    replace: vi.fn(),
    push: vi.fn(),
  }),
  usePathname: () => "/compras/ordens",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

const excluirLote = vi.hoisted(() => vi.fn());
vi.mock("@/modules/compras/ordens/actions", () => ({
  excluirOrdensCompraLote: excluirLote,
}));

const RASCUNHO = "11111111-1111-4111-8111-111111111111";
const CANCELADA = "22222222-2222-4222-8222-222222222222";
const APROVADA = "33333333-3333-4333-8333-333333333333";

function ordem(id: string, numero: string, status: string): OrdemLista {
  return {
    id,
    numero,
    fornecedorNome: "GUERRA IMPLEMENTOS RODOVIARIOS S.A",
    descricao: "Peças para caminhão",
    categoriaNome: "Manutenção",
    qtdCategorias: 1,
    valorTotal: 1000,
    status,
    dataCompra: "2026-07-10",
    mesCompetencia: "2026-07-01",
    condicaoPagamentoDescricao: null,
    formaPagamentoNome: null,
    cotacaoNumero: null,
    numeroDocumento: null,
    anexos: 0,
    criadoEm: "2026-07-10T12:00:00Z",
    criadoPorNome: "Tiago",
    quitadaSemNota: false,
  };
}

const ORDENS = [
  ordem(RASCUNHO, "OC-2026-0001", "rascunho"),
  ordem(CANCELADA, "OC-2026-0002", "cancelado"),
  ordem(APROVADA, "OC-2026-0003", "aprovado"),
];

function montar(podeExcluir = true) {
  return render(
    <OrdensTabela
      ordens={ORDENS}
      podeExcluir={podeExcluir}
      total={ORDENS.length}
      pagina={0}
      tamanho={25}
      status=""
      busca=""
      fornecedorId=""
      de=""
      ate=""
      mes=""
      categoriaId=""
      formaPagamentoId=""
      condicaoPagamentoId=""
      criadaDe=""
      criadaAte=""
      centroCustoId=""
      insumoId=""
      nota=""
      origem=""
      autoria=""
      fornecedores={[]}
      categorias={[]}
      formasPagamento={[]}
      condicoesPagamento={[]}
      centrosCusto={[]}
      insumos={[]}
      idUsuario="44444444-4444-4444-8444-444444444444"
    />,
  );
}

function marcar(id: string) {
  fireEvent.click(screen.getByRole("checkbox", { name: `Selecionar ${id}` }));
}

function botaoExcluir() {
  return screen.queryByRole("button", { name: /^Excluir \d+$/ });
}

afterEach(() => {
  cleanup();
  limparEstadosTabelaParaTeste();
  excluirLote.mockReset();
  roteador.refresh.mockClear();
});

describe("exclusão em lote na lista de OC", () => {
  it("sem permissão de excluir, o botão não existe nem com rascunho marcado", () => {
    montar(false);
    marcar(RASCUNHO);
    expect(screen.getByText("1 selecionado")).toBeInTheDocument();
    expect(botaoExcluir()).not.toBeInTheDocument();
  });

  it("marcando só uma aprovada, o botão não aparece", () => {
    // Nada elegível: um botão que só sabe recusar é ruído.
    montar();
    marcar(APROVADA);
    expect(screen.getByText("1 selecionado")).toBeInTheDocument();
    expect(botaoExcluir()).not.toBeInTheDocument();
  });

  it("rascunho e cancelada marcadas: o botão conta as duas", () => {
    montar();
    marcar(RASCUNHO);
    marcar(CANCELADA);
    expect(screen.getByRole("button", { name: "Excluir 2" })).toBeInTheDocument();
  });

  it("seleção misturada: o botão conta as ELEGÍVEIS, não as marcadas", () => {
    // A barra diz 2 selecionados e o botão diz Excluir 1. É a diferença que o
    // diálogo explica; sem o número no botão, a pessoa acharia que apaga as duas.
    montar();
    marcar(RASCUNHO);
    marcar(APROVADA);
    expect(screen.getByText("2 selecionados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir 1" })).toBeInTheDocument();
  });

  it("o diálogo diz o que apaga, o que pula e que não dá para desfazer", () => {
    montar();
    marcar(RASCUNHO);
    marcar(APROVADA);
    fireEvent.click(screen.getByRole("button", { name: "Excluir 1" }));

    expect(screen.getByText("Excluir 1 ordem de compra")).toBeInTheDocument();
    expect(
      screen.getByText(/1 marcada não pode ser excluída \(1 aprovada\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Não é possível desfazer/)).toBeInTheDocument();
  });

  it("confirmando, a ação recebe SÓ os ids elegíveis", async () => {
    excluirLote.mockResolvedValue({
      resumo: {
        excluidas: 1,
        puladasPorStatus: [
          { status: "aprovado", rotulo: "Aprovada", quantidade: 1 },
        ],
        recusadas: [],
        naoEncontradas: 0,
      },
    });

    montar();
    marcar(RASCUNHO);
    marcar(APROVADA);
    fireEvent.click(screen.getByRole("button", { name: "Excluir 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

    await vi.waitFor(() => {
      expect(excluirLote).toHaveBeenCalledTimes(1);
    });
    // O id da aprovada NÃO pode ir junto: a lista dela é o que o servidor apaga.
    expect(excluirLote).toHaveBeenCalledWith([RASCUNHO]);
  });

  it("erro da ação mantém a seleção, para a pessoa tentar de novo", async () => {
    excluirLote.mockResolvedValue({ erro: "Sem permissão" });

    montar();
    marcar(RASCUNHO);
    fireEvent.click(screen.getByRole("button", { name: "Excluir 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

    await vi.waitFor(() => {
      expect(excluirLote).toHaveBeenCalled();
    });
    expect(screen.getByText("1 selecionado")).toBeInTheDocument();
  });
});
