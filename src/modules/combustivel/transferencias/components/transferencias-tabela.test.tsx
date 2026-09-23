import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

import { formatarBRL } from "@/lib/formatadores";
import type { TransferenciaLinha } from "@/modules/combustivel/transferencias/queries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/combustivel/transferencias",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

vi.mock("@/modules/combustivel/transferencias/actions", () => ({
  consultarEstoqueTransferencia: vi.fn(async () => ({ ok: true, litros: 0 })),
  excluirTransferencia: vi.fn(),
  salvarTransferencia: vi.fn(),
}));

import { colunas, TransferenciasTabela } from "@/modules/combustivel/transferencias/components/transferencias-tabela";

afterEach(cleanup);

function transferencia(troca: Partial<TransferenciaLinha> = {}): TransferenciaLinha {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    dataHora: "2026-09-23T19:30:00Z",
    origemId: "22222222-2222-4222-8222-222222222222",
    origemNome: "Tanque Base",
    destinoId: "33333333-3333-4333-8333-333333333333",
    destinoNome: "Comboio 01",
    insumoNome: "Diesel S10",
    litros: 1500.1234,
    valorTotal: 9592.3456,
    observacoes: null,
    origem: "manual",
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
  it("a data sai em Rio Branco (UTC-5)", () => {
    celula("Data", transferencia());
    expect(screen.getByText("23/09/2026 14:30")).toBeInTheDocument();
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
});
