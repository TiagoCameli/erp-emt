import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUsuarioLogado = vi.fn();
const temPermissao = vi.fn();
const listarServicos = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock("@/lib/permissoes", () => ({
  getUsuarioLogado: () => getUsuarioLogado(),
  temPermissao: (...args: unknown[]) => temPermissao(...args),
}));
vi.mock("@/modules/execucao/modelos/queries", () => ({
  listarServicos: () => listarServicos(),
  unidadesMedida: async () => [],
  listarCalendarios: async () => [],
  listarFeriados: async () => [],
  excecoesDoCalendario: async () => [],
}));

import PaginaModelos from "./page";

function permitir(...permitidas: string[]) {
  temPermissao.mockImplementation((_u: unknown, recurso: string, acao: string) => permitidas.includes(`${recurso}/${acao}`));
}

describe("PaginaModelos", () => {
  beforeEach(() => {
    getUsuarioLogado.mockReset().mockResolvedValue({ id: "u" });
    temPermissao.mockReset();
    listarServicos.mockReset().mockResolvedValue([]);
  });

  it("sem execucao.modelos/ver chama notFound", async () => {
    permitir();
    await expect(PaginaModelos()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listarServicos).not.toHaveBeenCalled();
  });

  it("com ver e sem criar não mostra Novo serviço, Novo calendário nem Novo feriado", async () => {
    permitir("execucao.modelos/ver");
    const html = renderToStaticMarkup(await PaginaModelos());
    expect(html).toContain("Serviços");
    expect(html).toContain("Calendários");
    expect(html).toContain("Feriados");
    expect(html).not.toContain("Novo serviço");
    expect(html).not.toContain("Novo calendário");
    expect(html).not.toContain("Novo feriado");
  });

  it("com criar mostra os três botões", async () => {
    permitir("execucao.modelos/ver", "execucao.modelos/criar");
    const html = renderToStaticMarkup(await PaginaModelos());
    expect(html).toContain("Novo serviço");
    expect(html).toContain("Novo calendário");
    expect(html).toContain("Novo feriado");
  });
});
