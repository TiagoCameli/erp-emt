import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUsuarioLogado = vi.fn();
const temPermissao = vi.fn();
const listarCronogramas = vi.fn();
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
vi.mock("@/modules/execucao/cronogramas/queries", () => ({
  listarCronogramas: (...args: unknown[]) => listarCronogramas(...args),
}));
vi.mock("@/modules/execucao/obras/queries", () => ({
  listarPastas: () => listarPastas(),
  obrasDisponiveis: () => obrasDisponiveis(),
  calendariosModelo: () => calendariosModelo(),
}));
vi.mock("@/modules/execucao/cronogramas/components/cronogramas-tabela", () => ({ CronogramasTabela: () => null }));
vi.mock("@/modules/execucao/obras/components/novo-cronograma-drawer", () => ({
  NovoCronogramaDrawer: () => "Novo cronograma",
}));

import PaginaCronogramas from "./page";

const OBRA = "11111111-1111-4111-8111-111111111111";

function permitir(...permitidas: string[]) {
  temPermissao.mockImplementation((_u: unknown, recurso: string, acao: string) => permitidas.includes(`${recurso}/${acao}`));
}

const params = (p: Record<string, string> = {}) => ({ searchParams: Promise.resolve(p) });

describe("PaginaCronogramas", () => {
  beforeEach(() => {
    getUsuarioLogado.mockReset().mockResolvedValue({ id: "u" });
    temPermissao.mockReset();
    listarCronogramas.mockReset().mockResolvedValue([]);
    obrasDisponiveis.mockReset().mockResolvedValue([]);
    calendariosModelo.mockReset().mockResolvedValue([]);
    listarPastas.mockReset().mockResolvedValue([]);
  });

  it("sem execucao.cronogramas/ver chama notFound", async () => {
    permitir();
    await expect(PaginaCronogramas(params())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listarCronogramas).not.toHaveBeenCalled();
  });

  it("com ver e sem criar não renderiza Novo cronograma nem lê as obras disponíveis", async () => {
    permitir("execucao.cronogramas/ver");
    const html = renderToStaticMarkup(await PaginaCronogramas(params()));
    expect(html).not.toContain("Novo cronograma");
    expect(obrasDisponiveis).not.toHaveBeenCalled();
    expect(calendariosModelo).not.toHaveBeenCalled();
  });

  it("com criar renderiza o botão", async () => {
    permitir("execucao.cronogramas/ver", "execucao.cronogramas/criar");
    const html = renderToStaticMarkup(await PaginaCronogramas(params()));
    expect(html).toContain("Novo cronograma");
    expect(obrasDisponiveis).toHaveBeenCalled();
  });

  it("filtros da URL: obra e situação válidas vão para a consulta; o resto é ignorado", async () => {
    permitir("execucao.cronogramas/ver");
    await PaginaCronogramas(params({ obra: OBRA, status: "ativo" }));
    expect(listarCronogramas).toHaveBeenLastCalledWith({ obraId: OBRA, status: "ativo" });
    await PaginaCronogramas(params({ obra: "x", status: "qualquer" }));
    expect(listarCronogramas).toHaveBeenLastCalledWith({ obraId: undefined, status: undefined });
  });
});
