import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Página do painel: a linha só abre o boletim para quem tem `medicao.boletim/ver` (a permissão é
 * lida no servidor e vai para a tabela como booleano; sem ela o clique daria 404).
 */

const getUsuarioLogado = vi.fn();
const temPermissao = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/permissoes", () => ({
  getUsuarioLogado: () => getUsuarioLogado(),
  temPermissao: (...args: unknown[]) => temPermissao(...args),
}));
vi.mock("@/modules/medicao/painel/queries", () => ({
  carregarPainel: vi.fn().mockResolvedValue({
    painel: {
      contratos: [],
      total: { previsto: "0.00", acumulado: "0.00", saldo: "0.00", pct_executado: null, corrente: "0.00" },
    },
    erro: null,
  }),
}));
vi.mock("@/modules/medicao/painel/components/painel-filtros", () => ({
  PainelFiltros: () => <div data-testid="filtros" />,
}));
vi.mock("@/modules/medicao/painel/components/painel-tabela", () => ({
  PainelTabela: ({ podeAbrirBoletim }: { podeAbrirBoletim: boolean }) => (
    <div data-testid="tabela">{podeAbrirBoletim ? "abre" : "não abre"}</div>
  ),
}));

import PaginaPainel from "./page";

afterEach(cleanup);

describe("PaginaPainel", () => {
  beforeEach(() => {
    getUsuarioLogado.mockReset().mockResolvedValue({ id: "u" });
    temPermissao.mockReset().mockReturnValue(true);
  });

  it("com medicao.boletim/ver, a tabela abre o boletim", async () => {
    render(await PaginaPainel({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("tabela").textContent).toBe("abre");
  });

  it("sem medicao.boletim/ver, a tabela não abre o boletim", async () => {
    temPermissao.mockImplementation((_u: unknown, recurso: string) => recurso !== "medicao.boletim");
    render(await PaginaPainel({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("tabela").textContent).toBe("não abre");
  });
});
