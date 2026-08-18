import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { OrdensTabela } from "@/modules/compras/ordens/components/ordens-tabela";
import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import type { OrdemLista } from "@/modules/compras/ordens/queries";

/**
 * Único teste que renderiza OrdensTabela inteira. Mesmo motivo de
 * lancamentos-tabela-barra-selecao.test.tsx: o FIO que liga `selecao` do
 * DataTable, BarraSelecao e BotaoEspelho não é pego por nenhuma suíte
 * unitária isolada — só um teste que aperta o checkbox de verdade pega
 * `idDaLinha` errado ou uma BarraSelecao aninhada.
 */

// Tabela é client component e usa router. `push` fica exposto para o teste de
// clique na linha conferir a navegação; os demais testes não olham para ele.
// Mesmo padrão de lancamentos-tabela-barra-selecao.test.tsx.
const roteador = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
    push: roteador.push,
  }),
  usePathname: () => "/compras/ordens",
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

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

function ordem(troca: Partial<OrdemLista> = {}): OrdemLista {
  return {
    id: ID_A,
    numero: "OC-2026-0001",
    fornecedorNome: "GUERRA IMPLEMENTOS RODOVIARIOS S.A",
    descricao: "Peças para caminhão",
    categoriaNome: "Manutenção",
    valorTotal: 1000,
    status: "aprovado",
    dataCompra: "2026-07-10",
    mesCompetencia: "2026-07-01",
    condicaoPagamentoDescricao: null,
    formaPagamentoNome: null,
    cotacaoNumero: null,
    notaFiscal: null,
    criadoEm: "2026-07-11T14:30:00.000Z",
    criadoPorNome: "Tiago",
    quitadaSemNota: false,
    ...troca,
  };
}

const ORDENS = [
  ordem({ id: ID_A, numero: "OC-2026-0001" }),
  ordem({ id: ID_B, numero: "OC-2026-0002" }),
];

function montar() {
  return render(
    <OrdensTabela
      ordens={ORDENS}
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

afterEach(() => {
  cleanup();
  limparEstadosTabelaParaTeste();
  roteador.push.mockClear();
});

describe("BarraSelecao dentro de OrdensTabela", () => {
  it("zero selecionado: a barra não aparece", () => {
    montar();
    expect(screen.queryByText(/selecionado/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Limpar seleção" }),
    ).not.toBeInTheDocument();
  });

  it("marcar linhas mostra a barra com a contagem certa e o botão de espelho com a mesma contagem", () => {
    montar();
    marcar(ID_A);
    marcar(ID_B);

    expect(screen.getByText("2 selecionados")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Imprimir espelho (2)" }),
    ).toBeInTheDocument();
  });

  it("o botão de espelho abre a rota de ordens com os ids das linhas marcadas", () => {
    montar();
    marcar(ID_A);
    marcar(ID_B);

    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    fireEvent.click(screen.getByRole("button", { name: "Imprimir espelho (2)" }));
    expect(abrir).toHaveBeenCalledWith(
      `/espelho/ordens?ids=${ID_A}%2C${ID_B}`,
      "_blank",
      "noopener,noreferrer",
    );
    vi.unstubAllGlobals();
  });

  it("clicar na linha (fora do checkbox) ainda abre o detalhe, sem o checkbox atrapalhar", () => {
    montar();
    // Clica no texto do número da ordem, não no checkbox: é o comportamento
    // que o checkbox precisa NÃO quebrar (ver stopPropagation em data-table.tsx).
    fireEvent.click(screen.getByText("OC-2026-0001"));
    expect(roteador.push).toHaveBeenCalledWith(`/compras/ordens/${ID_A}`);
  });

  it("limpar seleção zera a contagem e desmarca o botão de espelho", () => {
    montar();
    marcar(ID_A);
    expect(screen.getByText("1 selecionado")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Limpar seleção" }));

    expect(screen.queryByText(/selecionado/i)).not.toBeInTheDocument();
  });
});
