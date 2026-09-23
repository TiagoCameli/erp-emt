import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

import type { EsvaziamentoLinha } from "@/modules/combustivel/esvaziamentos/queries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/combustivel/esvaziamentos",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

vi.mock("@/modules/combustivel/esvaziamentos/actions", () => ({
  consultarEstoqueEsvaziamento: vi.fn(async () => ({ ok: true, litros: 0 })),
  excluirEsvaziamento: vi.fn(),
  registrarEsvaziamento: vi.fn(),
}));

import { colunas, EsvaziamentosTabela } from "@/modules/combustivel/esvaziamentos/components/esvaziamentos-tabela";

afterEach(cleanup);

function esvaziamento(troca: Partial<EsvaziamentoLinha> = {}): EsvaziamentoLinha {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    dataHora: "2026-09-23T12:05:00Z",
    tanqueId: "22222222-2222-4222-8222-222222222222",
    tanqueNome: "Tanque Base",
    litros: 155.6,
    motivo: "Diesel contaminado",
    valorPerda: 0,
    origem: "manual",
    ...troca,
  };
}

function celula(rotulo: string, registro: EsvaziamentoLinha) {
  const coluna = colunas.find((c) => String(c.header) === rotulo);
  if (!coluna) throw new Error(`coluna "${rotulo}" não existe`);
  const cell = (coluna as ColumnDef<EsvaziamentoLinha, unknown> & { cell?: unknown }).cell;
  if (typeof cell !== "function") throw new Error(`coluna "${rotulo}" sem cell`);
  return render(<>{cell({ row: { original: registro } } as CellContext<EsvaziamentoLinha, unknown>)}</>);
}

describe("colunas da lista de esvaziamentos", () => {
  it("litros nunca arredondam para inteiro", () => {
    // 155,6 L virando 156 foi o que fazia a trava de saldo recusar na origem.
    celula("Litros", esvaziamento());
    expect(screen.getByText("155,60 L")).toBeInTheDocument();
  });

  it("data em Rio Branco", () => {
    celula("Data", esvaziamento());
    expect(screen.getByText("23/09/2026 07:05")).toBeInTheDocument();
  });
});

describe("EsvaziamentosTabela", () => {
  it("sem excluir, não há menu de ações (esvaziamento não se edita)", () => {
    render(<EsvaziamentosTabela esvaziamentos={[esvaziamento()]} tanquesFiltro={[]} podeExcluir={false} />);
    expect(screen.getByText("Diesel contaminado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ações/i })).not.toBeInTheDocument();
  });

  it("com excluir, o menu aparece", () => {
    render(<EsvaziamentosTabela esvaziamentos={[esvaziamento()]} tanquesFiltro={[]} podeExcluir />);
    expect(screen.getAllByRole("button", { name: /ações/i }).length).toBeGreaterThan(0);
  });
});
