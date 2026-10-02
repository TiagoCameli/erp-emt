import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const getUsuarioLogado = vi.fn();
const temPermissao = vi.fn();
const carregarAlertas = vi.fn();

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
  listarContratos: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/modules/medicao/alertas/queries", () => ({
  carregarAlertas: (...args: unknown[]) => carregarAlertas(...args),
}));
vi.mock("@/modules/medicao/alertas/components/alertas-filtros", () => ({
  AlertasFiltros: () => <div data-testid="filtros" />,
}));
vi.mock("@/modules/medicao/alertas/components/alertas-tabela", () => ({
  AlertasTabela: () => <div data-testid="tabela" />,
}));

import PaginaAlertas from "./page";

afterEach(cleanup);

describe("PaginaAlertas", () => {
  beforeEach(() => {
    getUsuarioLogado.mockReset().mockResolvedValue({ id: "u" });
    temPermissao.mockReset().mockReturnValue(true);
    carregarAlertas.mockReset().mockResolvedValue([]);
  });

  it("sem medicao.alertas/ver, dá 404", async () => {
    temPermissao.mockReturnValue(false);
    await expect(PaginaAlertas({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(temPermissao).toHaveBeenCalledWith({ id: "u" }, "medicao.alertas", "ver");
  });

  it("com permissão, mostra filtros e tabela e repassa só filtros válidos", async () => {
    render(await PaginaAlertas({ searchParams: Promise.resolve({ contrato: "lixo", gravidade: "alta" }) }));
    expect(screen.getByTestId("filtros")).toBeTruthy();
    expect(screen.getByTestId("tabela")).toBeTruthy();
    expect(carregarAlertas).toHaveBeenCalledWith({ contratoId: undefined, gravidade: "alta" });
  });

  it("chave herdada do protótipo não vira filtro de gravidade", async () => {
    await PaginaAlertas({ searchParams: Promise.resolve({ gravidade: "toString" }) });
    expect(carregarAlertas).toHaveBeenCalledWith({ contratoId: undefined, gravidade: undefined });
  });
});
