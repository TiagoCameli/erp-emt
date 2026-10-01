import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Página de Medições: guarda `medicao.medicoes/ver`; o botão "Abrir próxima medição" só some para
 * quem não tem `criar`; a linha abre o detalhe da medição (o botão de lançamentos mora lá).
 */

const getUsuarioLogado = vi.fn();
const temPermissao = vi.fn();
const { CONTRATO } = vi.hoisted(() => ({ CONTRATO: "33333333-3333-4333-8333-333333333333" }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/permissoes", () => ({
  getUsuarioLogado: () => getUsuarioLogado(),
  temPermissao: (...args: unknown[]) => temPermissao(...args),
}));
vi.mock("@/modules/medicao/contratos/queries", () => ({
  listarContratos: vi.fn().mockResolvedValue([{ id: CONTRATO, codigo: "L09", nomeObra: "BR-364 Lote 09" }]),
  carregarContrato: vi.fn().mockResolvedValue({ id: CONTRATO, codigo: "L09", nome_obra: "BR-364 Lote 09" }),
}));
vi.mock("@/modules/medicao/medicoes/queries", () => ({
  carregarMedicoes: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/modules/medicao/_shared/seletor-contrato", () => ({
  SeletorContrato: () => <div data-testid="seletor" />,
}));
vi.mock("@/modules/medicao/medicoes/components/abrir-medicao-drawer", () => ({
  AbrirProximaMedicaoBotao: () => <button type="button">Abrir próxima medição</button>,
}));
vi.mock("@/modules/medicao/medicoes/components/medicoes-tabela", () => ({
  MedicoesTabela: () => <div data-testid="tabela" />,
}));

import PaginaMedicoes from "./page";

afterEach(cleanup);

describe("PaginaMedicoes", () => {
  beforeEach(() => {
    getUsuarioLogado.mockReset().mockResolvedValue({ id: "u" });
    temPermissao.mockReset().mockReturnValue(true);
  });

  it("sem medicao.medicoes/ver, dá 404", async () => {
    temPermissao.mockReturnValue(false);
    await expect(PaginaMedicoes({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sem contrato escolhido, mostra o seletor sem o botão de abrir", async () => {
    render(await PaginaMedicoes({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("seletor")).toBeTruthy();
    expect(screen.queryByText("Abrir próxima medição")).toBeNull();
  });

  it("com medicao.medicoes/criar, mostra o botão de abrir próxima medição", async () => {
    render(await PaginaMedicoes({ searchParams: Promise.resolve({ contrato: CONTRATO }) }));
    expect(screen.getByText("Abrir próxima medição")).toBeTruthy();
  });

  it("sem medicao.medicoes/criar, o botão não aparece", async () => {
    temPermissao.mockImplementation((_u: unknown, recurso: string, acao: string) => !(recurso === "medicao.medicoes" && acao === "criar"));
    render(await PaginaMedicoes({ searchParams: Promise.resolve({ contrato: CONTRATO }) }));
    expect(screen.queryByText("Abrir próxima medição")).toBeNull();
  });

  it("com contrato escolhido, mostra a tabela", async () => {
    render(await PaginaMedicoes({ searchParams: Promise.resolve({ contrato: CONTRATO }) }));
    expect(screen.getByTestId("tabela")).toBeTruthy();
  });

  it("contrato fora da lista de acesso (RLS devolve null): 404", async () => {
    const { carregarContrato } = await import("@/modules/medicao/contratos/queries");
    vi.mocked(carregarContrato).mockResolvedValueOnce(null);
    await expect(PaginaMedicoes({ searchParams: Promise.resolve({ contrato: CONTRATO }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
