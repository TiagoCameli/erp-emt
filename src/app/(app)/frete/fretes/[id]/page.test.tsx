import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { frete } from "@/modules/frete/fretes/fixture-frete";

/**
 * Página do frete (destino dos links das Anomalias): pede frete.fretes/ver, responde
 * "Frete não encontrado" com o link de volta quando não acha ou não pode, e abre o
 * excluído com o selo e o motivo.
 */

const getUsuarioLogado = vi.fn();
const temPermissao = vi.fn();
const buscarFrete = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/permissoes", () => ({
  getUsuarioLogado: () => getUsuarioLogado(),
  temPermissao: (...args: unknown[]) => temPermissao(...args),
}));
vi.mock("@/modules/frete/fretes/queries", () => ({
  buscarFrete: (...args: unknown[]) => buscarFrete(...args),
  listarOpcoesFrete: vi.fn().mockResolvedValue({ localidades: [], transportadoras: [], insumos: [], obras: [] }),
}));
vi.mock("@/modules/frete/fretes/components/frete-detalhe-drawer", () => ({
  FreteDetalheConteudo: ({ frete: f }: { frete: { id: string } }) => <div data-testid="conteudo">{f.id}</div>,
}));
vi.mock("@/modules/frete/fretes/components/frete-detalhe-acoes", () => ({
  FreteDetalheAcoes: () => <div data-testid="acoes" />,
}));

import PaginaFrete from "./page";

const ID = "99999999-9999-4999-8999-999999999999";
const params = (id: string) => Promise.resolve({ id });

afterEach(cleanup);

describe("PaginaFrete", () => {
  beforeEach(() => {
    getUsuarioLogado.mockReset().mockResolvedValue({ id: "u" });
    temPermissao.mockReset().mockReturnValue(true);
    buscarFrete.mockReset();
  });

  it("sem frete.fretes/ver: não encontrado, e nem busca o frete", async () => {
    temPermissao.mockImplementation((_u: unknown, recurso: string, acao: string) => !(recurso === "frete.fretes" && acao === "ver"));
    render(await PaginaFrete({ params: params(ID) }));
    expect(screen.getByText("Frete não encontrado")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Voltar para fretes/ }).length).toBeGreaterThan(0);
    expect(buscarFrete).not.toHaveBeenCalled();
  });

  it("id inválido ou frete inexistente: não encontrado", async () => {
    render(await PaginaFrete({ params: params("abc") }));
    expect(screen.getByText("Frete não encontrado")).toBeTruthy();
    cleanup();
    buscarFrete.mockResolvedValue(null);
    render(await PaginaFrete({ params: params(ID) }));
    expect(screen.getByText("Frete não encontrado")).toBeTruthy();
  });

  it("frete vivo: título pela NF e o conteúdo do detalhe", async () => {
    buscarFrete.mockResolvedValue(frete({ id: ID, notaFiscal: "123" }));
    render(await PaginaFrete({ params: params(ID) }));
    expect(screen.getByText("Frete NF 123")).toBeTruthy();
    expect(screen.getByTestId("conteudo").textContent).toBe(ID);
    expect(screen.queryByText("Excluído")).toBeNull();
  });

  it("frete excluído abre com o selo Excluído e o motivo", async () => {
    buscarFrete.mockResolvedValue(
      frete({ id: ID, excluidoEm: "2026-09-20T15:00:00Z", motivoExclusao: "duplicado" }),
    );
    render(await PaginaFrete({ params: params(ID) }));
    expect(screen.getByText("Excluído")).toBeTruthy();
    expect(screen.getByText(/Motivo: duplicado/)).toBeTruthy();
    expect(screen.getByTestId("conteudo")).toBeTruthy();
  });
});
