import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Aba Reajuste: guarda `medicao.reajuste/ver` no servidor (a RLS da medição sozinha não basta) e
 * repassa só filtro válido (`?contrato=` id e `?situacao=` das três opções) para `listarReajustes`.
 */

const getUsuarioLogado = vi.fn();
const temPermissao = vi.fn();
const listarReajustes = vi.fn();
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
}));
vi.mock("@/modules/medicao/reajuste/queries", () => ({
  listarReajustes: (...args: unknown[]) => listarReajustes(...args),
  facetasReajustes: vi.fn().mockResolvedValue({ contrato: [], situacao: [] }),
}));
vi.mock("@/modules/medicao/reajuste/components/reajustes-filtros", () => ({
  ReajustesFiltros: () => <div data-testid="filtros" />,
}));
vi.mock("@/modules/medicao/reajuste/components/reajustes-tabela", () => ({
  ReajustesTabela: () => <div data-testid="tabela" />,
}));

import PaginaReajuste from "./page";

afterEach(cleanup);

describe("PaginaReajuste", () => {
  beforeEach(() => {
    getUsuarioLogado.mockReset().mockResolvedValue({ id: "u" });
    temPermissao.mockReset().mockReturnValue(true);
    listarReajustes.mockReset().mockResolvedValue([]);
  });

  it("sem medicao.reajuste/ver, dá 404 e não consulta nada", async () => {
    temPermissao.mockReturnValue(false);
    await expect(PaginaReajuste({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(temPermissao).toHaveBeenCalledWith({ id: "u" }, "medicao.reajuste", "ver");
    expect(listarReajustes).not.toHaveBeenCalled();
  });

  it("sem usuário logado, dá 404", async () => {
    getUsuarioLogado.mockResolvedValue(null);
    await expect(PaginaReajuste({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("com permissão, mostra filtros e tabela com os filtros da URL", async () => {
    render(await PaginaReajuste({ searchParams: Promise.resolve({ contrato: CONTRATO, situacao: "provisorio" }) }));
    expect(screen.getByText("Reajuste")).toBeTruthy();
    expect(screen.getByTestId("filtros")).toBeTruthy();
    expect(screen.getByTestId("tabela")).toBeTruthy();
    expect(listarReajustes).toHaveBeenCalledWith({ contratoId: CONTRATO, situacao: "provisorio" });
  });

  it("filtro inválido ou chave do protótipo não vira filtro", async () => {
    await PaginaReajuste({ searchParams: Promise.resolve({ contrato: "lixo", situacao: "toString" }) });
    expect(listarReajustes).toHaveBeenCalledWith({ contratoId: undefined, situacao: undefined });
  });
});
