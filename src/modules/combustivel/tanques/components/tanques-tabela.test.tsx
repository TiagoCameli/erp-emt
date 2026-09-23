import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

import type { TanqueLinha } from "@/modules/combustivel/tanques/queries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/combustivel/tanques",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

vi.mock("@/modules/combustivel/tanques/actions", () => ({
  alternarAtivoTanque: vi.fn(),
  excluirTanque: vi.fn(),
}));

import { NivelTanque } from "@/modules/combustivel/tanques/components/nivel-tanque";
import { colunas, TanquesTabela } from "@/modules/combustivel/tanques/components/tanques-tabela";

afterEach(cleanup);

function tanque(troca: Partial<TanqueLinha> = {}): TanqueLinha {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    nome: "Tanque Comboio 01",
    apelido: "Comboio",
    capacidade: 10000,
    nivel: 2500.5,
    combustivelId: "22222222-2222-4222-8222-222222222222",
    combustivelNome: "Diesel S10",
    ehExterno: false,
    proprietarioId: null,
    proprietarioNome: null,
    observacoes: null,
    ativo: true,
    ...troca,
  };
}

function celula(rotulo: string, registro: TanqueLinha) {
  const coluna = colunas.find((c) => String(c.header) === rotulo);
  if (!coluna) throw new Error(`coluna "${rotulo}" não existe`);
  const cell = (coluna as ColumnDef<TanqueLinha, unknown> & { cell?: unknown }).cell;
  if (typeof cell !== "function") throw new Error(`coluna "${rotulo}" sem cell`);
  return render(<>{cell({ row: { original: registro } } as CellContext<TanqueLinha, unknown>)}</>);
}

describe("NivelTanque", () => {
  it("mostra litros com 2 casas e a barra no percentual da capacidade", () => {
    render(<NivelTanque nivel={2500.5} capacidade={10000} ehExterno={false} />);
    expect(screen.getByText("2.500,50 L")).toBeInTheDocument();
    const barra = screen.getByRole("meter", { name: "Nível do tanque" });
    expect(barra).toHaveAttribute("aria-valuenow", "25");
  });

  it("sem capacidade cadastrada não desenha barra, só os litros", () => {
    render(<NivelTanque nivel={155.6} capacidade={0} ehExterno={false} />);
    expect(screen.getByText("155,60 L")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });

  it("tanque de terceiro diz que não tem estoque", () => {
    render(<NivelTanque nivel={0} capacidade={30000} ehExterno />);
    expect(screen.getByText("Tanque de terceiro, sem estoque")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });
});

describe("colunas da lista de tanques", () => {
  it("dono: EMT para tanque próprio, o fornecedor para o de terceiro", () => {
    celula("Dono", tanque());
    expect(screen.getByText("EMT")).toBeInTheDocument();
    cleanup();
    celula("Dono", tanque({ ehExterno: true, proprietarioId: "x", proprietarioNome: "Transterra" }));
    expect(screen.getByText("Transterra")).toBeInTheDocument();
  });

  it("combustível de tanque de terceiro não aparece", () => {
    celula("Combustível", tanque({ ehExterno: true, combustivelNome: "Diesel S10" }));
    expect(screen.queryByText("Diesel S10")).not.toBeInTheDocument();
  });
});

describe("TanquesTabela", () => {
  it("sem editar nem excluir, a linha não tem menu de ações", () => {
    render(<TanquesTabela tanques={[tanque()]} podeEditar={false} podeExcluir={false} onEditar={vi.fn()} />);
    expect(screen.getByText("Tanque Comboio 01")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ações/i })).not.toBeInTheDocument();
  });

  it("com permissão, a linha ganha o menu de ações", () => {
    render(<TanquesTabela tanques={[tanque()]} podeEditar podeExcluir onEditar={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /ações/i }).length).toBeGreaterThan(0);
  });

  it("lista vazia oferece o caminho", () => {
    render(<TanquesTabela tanques={[]} podeEditar podeExcluir onEditar={vi.fn()} />);
    expect(screen.getByText("Nenhum tanque cadastrado")).toBeInTheDocument();
  });

  function abrirMenu() {
    fireEvent.pointerDown(screen.getAllByRole("button", { name: /ações/i })[0]!, { button: 0, ctrlKey: false });
  }

  it("'Esvaziar tanque' aparece com editar, permissão de esvaziar e nível acima de zero (como a origem)", async () => {
    const onEsvaziar = vi.fn();
    render(<TanquesTabela tanques={[tanque({ nivel: 155.6 })]} podeEditar podeExcluir={false} onEditar={vi.fn()} onEsvaziar={onEsvaziar} />);
    abrirMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Esvaziar tanque/ }));
    expect(onEsvaziar).toHaveBeenCalledWith(expect.objectContaining({ nivel: 155.6 }));
  });

  it("sem nível, sem editar, sem permissão de esvaziar ou tanque de terceiro: não aparece", async () => {
    const casos = [
      { linha: tanque({ nivel: 0 }), podeEditar: true, onEsvaziar: vi.fn() },
      { linha: tanque({ nivel: 155.6 }), podeEditar: true, onEsvaziar: undefined },
      { linha: tanque({ nivel: 155.6, ehExterno: true, proprietarioId: "x" }), podeEditar: true, onEsvaziar: vi.fn() },
    ];
    for (const caso of casos) {
      render(
        <TanquesTabela
          tanques={[caso.linha]}
          podeEditar={caso.podeEditar}
          podeExcluir
          onEditar={vi.fn()}
          onEsvaziar={caso.onEsvaziar}
        />,
      );
      abrirMenu();
      expect(await screen.findByRole("menuitem", { name: /Excluir tanque/ })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: /Esvaziar tanque/ })).not.toBeInTheDocument();
      cleanup();
    }
    render(<TanquesTabela tanques={[tanque({ nivel: 155.6 })]} podeEditar={false} podeExcluir onEditar={vi.fn()} onEsvaziar={vi.fn()} />);
    abrirMenu();
    expect(await screen.findByRole("menuitem", { name: /Excluir tanque/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Esvaziar tanque/ })).not.toBeInTheDocument();
  });
});
