import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUsuarioLogado = vi.fn();
const temPermissao = vi.fn();
const obrasDisponiveis = vi.fn();
const calendariosModelo = vi.fn();
const listarPastas = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/permissoes", () => ({
  getUsuarioLogado: () => getUsuarioLogado(),
  temPermissao: (...args: unknown[]) => temPermissao(...args),
}));
vi.mock("@/modules/execucao/obras/queries", () => ({
  listarPastas: () => listarPastas(),
  obrasDisponiveis: () => obrasDisponiveis(),
  calendariosModelo: () => calendariosModelo(),
}));
vi.mock("@/modules/execucao/obras/components/pastas-grade", () => ({ PastasGrade: () => null }));
vi.mock("@/modules/execucao/obras/components/novo-cronograma-drawer", () => ({
  NovoCronogramaDrawer: () => "Novo cronograma",
}));

import PaginaObras from "./page";

function permitir(...permitidas: string[]) {
  temPermissao.mockImplementation((_u: unknown, recurso: string, acao: string) => permitidas.includes(`${recurso}/${acao}`));
}

describe("PaginaObras", () => {
  beforeEach(() => {
    getUsuarioLogado.mockReset().mockResolvedValue({ id: "u" });
    temPermissao.mockReset();
    obrasDisponiveis.mockReset().mockResolvedValue([]);
    calendariosModelo.mockReset().mockResolvedValue([]);
    listarPastas.mockReset().mockResolvedValue([]);
  });

  it("sem execucao.obras/ver chama notFound", async () => {
    permitir();
    await expect(PaginaObras()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listarPastas).not.toHaveBeenCalled();
  });

  it("com ver e sem criar não renderiza Novo cronograma e não lê as obras disponíveis", async () => {
    permitir("execucao.obras/ver");
    const html = renderToStaticMarkup(await PaginaObras());
    expect(html).not.toContain("Novo cronograma");
    expect(obrasDisponiveis).not.toHaveBeenCalled();
    expect(calendariosModelo).not.toHaveBeenCalled();
  });

  it("com criar renderiza o botão e lê as obras", async () => {
    permitir("execucao.obras/ver", "execucao.cronogramas/criar");
    const html = renderToStaticMarkup(await PaginaObras());
    expect(html).toContain("Novo cronograma");
    expect(obrasDisponiveis).toHaveBeenCalled();
  });
});
