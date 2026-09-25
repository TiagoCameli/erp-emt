import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

import { formatarBRL } from "@/lib/formatadores";
import type { TransferenciaLinha } from "@/modules/combustivel/transferencias/queries";

const navegacao = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: navegacao.replace }),
  usePathname: () => "/combustivel/transferencias",
  useSearchParams: () => navegacao.params,
}));

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

vi.mock("@/modules/combustivel/transferencias/actions", () => ({
  consultarEstoqueTransferencia: vi.fn(async () => ({ ok: true, litros: 0 })),
  consultarPrecoMedioTanque: vi.fn(async () => ({ ok: true, preco: 0 })),
  consultarCombustivelNaData: vi.fn(async () => ({ ok: true, nome: null })),
  excluirTransferencia: vi.fn(),
  restaurarTransferencia: vi.fn(),
  salvarTransferencia: vi.fn(),
}));

import { colunas, TransferenciasTabela } from "@/modules/combustivel/transferencias/components/transferencias-tabela";

beforeEach(() => {
  navegacao.params = new URLSearchParams();
  navegacao.replace.mockReset();
});
afterEach(cleanup);

function transferencia(troca: Partial<TransferenciaLinha> = {}): TransferenciaLinha {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    dataHora: "2026-09-23T19:30:00Z",
    origemId: "22222222-2222-4222-8222-222222222222",
    origemNome: "Tanque Base",
    destinoId: "33333333-3333-4333-8333-333333333333",
    destinoNome: "Comboio 01",
    insumoId: "44444444-4444-4444-8444-444444444444",
    insumoNome: "Diesel S10",
    litros: 1500.1234,
    valorTotal: 9592.3456,
    observacoes: null,
    origem: "manual",
    excluidoEm: null,
    motivoExclusao: null,
    ...troca,
  };
}

function celula(rotulo: string, registro: TransferenciaLinha) {
  const coluna = colunas.find((c) => String(c.header) === rotulo);
  if (!coluna) throw new Error(`coluna "${rotulo}" não existe`);
  const cell = (coluna as ColumnDef<TransferenciaLinha, unknown> & { cell?: unknown }).cell;
  if (typeof cell !== "function") throw new Error(`coluna "${rotulo}" sem cell`);
  return render(<>{cell({ row: { original: registro } } as CellContext<TransferenciaLinha, unknown>)}</>);
}

describe("colunas da lista de transferências", () => {
  it("a data sai em Rio Branco (UTC-5), curta como na origem", () => {
    celula("Data/Hora", transferencia());
    expect(screen.getByText("23/09/26 14:30")).toBeInTheDocument();
  });

  it("origem → destino numa coluna só", () => {
    celula("Origem → Destino", transferencia());
    expect(screen.getByText("Tanque Base")).toBeInTheDocument();
    expect(screen.getByText("Comboio 01")).toBeInTheDocument();
  });

  it("litros com 2 casas e valor em R$ com 2 casas (o banco guarda 4)", () => {
    celula("Litros", transferencia());
    expect(screen.getByText("1.500,12 L")).toBeInTheDocument();
    cleanup();
    const { container } = celula("Valor", transferencia());
    // Pelo formatador: o R$ vem com espaço não separável, que o getByText não casa.
    expect(container.textContent).toBe(formatarBRL(9592.35));
  });
});

describe("TransferenciasTabela", () => {
  it("sem editar nem excluir, a linha não tem menu de ações", () => {
    render(
      <TransferenciasTabela
        transferencias={[transferencia()]}
        tanques={[]}
        tanquesFiltro={[]}
        podeEditar={false}
        podeExcluir={false}
      />,
    );
    expect(screen.getByText("Tanque Base")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ações/i })).not.toBeInTheDocument();
  });

  it("lista vazia diz o que lançar", () => {
    render(
      <TransferenciasTabela transferencias={[]} tanques={[]} tanquesFiltro={[]} podeEditar podeExcluir />,
    );
    expect(screen.getByText("Nenhuma transferência lançada")).toBeInTheDocument();
  });

  it("excluída não aparece sem permissão de restaurar, nem o filtro de excluídos", () => {
    render(
      <TransferenciasTabela
        transferencias={[transferencia({ excluidoEm: "2026-09-23T20:00:00Z", origemNome: "Tanque Excluído" })]}
        tanques={[]}
        tanquesFiltro={[]}
        podeEditar
        podeExcluir
      />,
    );
    expect(screen.queryByText("Tanque Excluído")).not.toBeInTheDocument();
    expect(screen.queryByText("Mostrar excluídos")).not.toBeInTheDocument();
  });

  it("a faixa de resumo soma o que o filtro acha", () => {
    render(
      <TransferenciasTabela
        transferencias={[transferencia(), transferencia({ id: "22222222-2222-4222-8222-000000000002", litros: 500, valorTotal: 100 })]}
        tanques={[]}
        tanquesFiltro={[]}
        podeEditar
        podeExcluir
      />,
    );
    const faixa = screen.getByTestId("faixa-resumo");
    expect(faixa.textContent).toContain("2 transferências");
    expect(faixa.textContent).toContain("2.000,12 L");
    expect(faixa.textContent).toContain(formatarBRL(9692.35));
  });

  it("o recorte da URL filtra (período em dia de Rio Branco e tanque dos dois lados)", () => {
    const fora = transferencia({ id: "22222222-2222-4222-8222-000000000003", dataHora: "2026-08-01T15:00:00Z", origemNome: "Fora do período" });
    render(
      <TransferenciasTabela
        transferencias={[transferencia(), fora]}
        filtrosUrl={{ de: "2026-09-01", ate: "2026-09-30", tanqueIds: ["33333333-3333-4333-8333-333333333333"], insumoIds: [] }}
        tanques={[]}
        tanquesFiltro={[]}
        podeEditar
        podeExcluir
      />,
    );
    expect(screen.getByText("Tanque Base")).toBeInTheDocument();
    expect(screen.queryByText("Fora do período")).not.toBeInTheDocument();
  });

  it("clique na linha abre o detalhe, com o diagrama origem → destino", () => {
    render(<TransferenciasTabela transferencias={[transferencia()]} tanques={[]} tanquesFiltro={[]} podeEditar podeExcluir />);
    fireEvent.click(screen.getByText("Tanque Base"));
    expect(screen.getByText("Transferência de combustível")).toBeInTheDocument();
    expect(screen.getByText("Litros transferidos")).toBeInTheDocument();
  });

  it("?novo=1 abre o formulário de nova transferência e sai da URL", () => {
    navegacao.params = new URLSearchParams("de=2026-09-01&novo=1");
    render(<TransferenciasTabela transferencias={[]} tanques={[]} tanquesFiltro={[]} podeCriar podeEditar podeExcluir />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(navegacao.replace).toHaveBeenCalledWith("/combustivel/transferencias?de=2026-09-01", { scroll: false });
  });

  it("?detalhe=<id> (link do detalhe do tanque) abre o detalhe daquela transferência e sai da URL", () => {
    navegacao.params = new URLSearchParams("detalhe=11111111-1111-4111-8111-111111111111");
    render(<TransferenciasTabela transferencias={[transferencia()]} tanques={[]} tanquesFiltro={[]} podeEditar podeExcluir />);
    expect(screen.getByText("Transferência de combustível")).toBeInTheDocument();
    expect(navegacao.replace).toHaveBeenCalledWith("/combustivel/transferencias", { scroll: false });
  });

  it("linha de controle: sem ?novo=1 o formulário não abre", () => {
    render(<TransferenciasTabela transferencias={[]} tanques={[]} tanquesFiltro={[]} podeCriar podeEditar podeExcluir />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(navegacao.replace).not.toHaveBeenCalled();
  });
});
