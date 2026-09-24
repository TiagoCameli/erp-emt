import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import type { TanqueLinha } from "@/modules/combustivel/tanques/queries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/combustivel/tanques",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/combustivel/tanques/actions", () => ({
  excluirTanque: vi.fn(),
  importar: vi.fn(),
  validarImport: vi.fn(),
  criarTanque: vi.fn(),
  editarTanque: vi.fn(),
}));

vi.mock("@/modules/combustivel/esvaziamentos/components/esvaziamento-form-drawer", () => ({
  EsvaziamentoFormDrawer: () => null,
}));

vi.mock("./tanque-form-drawer", () => ({ TanqueFormDrawer: () => null }));
vi.mock("./tanques-acoes-cabecalho", () => ({ TanquesAcoesCabecalho: () => null }));

import { filtrarTanques, TanquesLista } from "./tanques-lista";

afterEach(cleanup);

function tanque(troca: Partial<TanqueLinha> = {}): TanqueLinha {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    nome: "Tanque Comboio 01",
    apelido: "Comboio",
    capacidade: 5000,
    nivel: 2168.5,
    combustivelId: "22222222-2222-4222-8222-222222222222",
    combustivelNome: "Diesel S500",
    ehExterno: false,
    proprietarioId: null,
    proprietarioNome: null,
    observacoes: null,
    ativo: true,
    ...troca,
  };
}

const EXTERNO = tanque({
  id: "33333333-3333-4333-8333-333333333333",
  nome: "Posto Transterra",
  apelido: null,
  capacidade: 0,
  nivel: 0,
  combustivelNome: null,
  ehExterno: true,
  proprietarioId: "x",
  proprietarioNome: "Transterra",
});

describe("TanquesLista", () => {
  it("card do tanque próprio: cápsula, contagem e link para o detalhe", () => {
    render(<TanquesLista tanques={[tanque(), EXTERNO]} fornecedores={[]} podeEditar podeExcluir />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Tanques de Combustível (2)");
    expect(screen.getByRole("img", { name: /Tanque Comboio 01: 2\.168,50 L de 5\.000 L/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir o tanque Tanque Comboio 01" })).toHaveAttribute(
      "href",
      "/combustivel/tanques/11111111-1111-4111-8111-111111111111",
    );
    expect(screen.getAllByText("43% de 5.000 L").length).toBeGreaterThan(0);
  });

  it("tanque de terceiro vai para a lista compacta, sem cápsula", () => {
    render(<TanquesLista tanques={[tanque(), EXTERNO]} fornecedores={[]} podeEditar podeExcluir />);
    const secao = screen.getByRole("region", { name: /Tanques externos/i });
    expect(within(secao).getByText("Posto Transterra")).toBeInTheDocument();
    expect(within(secao).getByText("Externo")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Posto Transterra/ })).not.toBeInTheDocument();
  });

  it("'Esvaziar' só com editar, permissão de esvaziar e nível acima de zero (como a origem)", () => {
    const cheio = tanque();
    const vazio = tanque({ id: "44444444-4444-4444-8444-444444444444", nome: "Vazio", nivel: 0 });
    render(<TanquesLista tanques={[cheio, vazio]} fornecedores={[]} podeEditar podeExcluir={false} podeEsvaziar />);
    expect(screen.getAllByRole("button", { name: "Esvaziar" })).toHaveLength(1);
    cleanup();

    render(<TanquesLista tanques={[cheio]} fornecedores={[]} podeEditar podeExcluir={false} />);
    expect(screen.queryByRole("button", { name: "Esvaziar" })).not.toBeInTheDocument();
    cleanup();

    render(<TanquesLista tanques={[cheio]} fornecedores={[]} podeEditar={false} podeExcluir podeEsvaziar />);
    expect(screen.queryByRole("button", { name: "Esvaziar" })).not.toBeInTheDocument();
  });

  it("sem editar nem excluir, o card não tem ações", () => {
    render(<TanquesLista tanques={[tanque(), EXTERNO]} fornecedores={[]} podeEditar={false} podeExcluir={false} />);
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
  });

  it("com permissão, cada tanque ganha Editar e Excluir", () => {
    render(<TanquesLista tanques={[tanque(), EXTERNO]} fornecedores={[]} podeEditar podeExcluir />);
    expect(screen.getAllByRole("button", { name: "Editar" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Excluir" })).toHaveLength(2);
  });

  it("lista vazia oferece o caminho", () => {
    render(<TanquesLista tanques={[]} fornecedores={[]} podeEditar podeExcluir />);
    expect(screen.getByText("Nenhum tanque cadastrado")).toBeInTheDocument();
  });
});

describe("filtrarTanques", () => {
  const inativo = tanque({ id: "55555555-5555-4555-8555-555555555555", nome: "Velho", ativo: false });

  it("status: ativos por padrão, inativos e todos", () => {
    const lista = [tanque(), inativo];
    expect(filtrarTanques(lista, "", "ativos").map((t) => t.nome)).toEqual(["Tanque Comboio 01"]);
    expect(filtrarTanques(lista, "", "inativos").map((t) => t.nome)).toEqual(["Velho"]);
    expect(filtrarTanques(lista, "", "todos")).toHaveLength(2);
  });

  it("busca por nome, apelido ou dono", () => {
    const lista = [tanque(), EXTERNO];
    expect(filtrarTanques(lista, "transterra", "todos").map((t) => t.nome)).toEqual(["Posto Transterra"]);
    expect(filtrarTanques(lista, "comboio", "todos").map((t) => t.nome)).toEqual(["Tanque Comboio 01"]);
  });
});
