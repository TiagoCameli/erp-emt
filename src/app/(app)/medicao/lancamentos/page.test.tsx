import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Página de Lançamentos: guarda `medicao.lancamentos/ver`; sem contrato escolhido mostra só o
 * seletor; contrato fora da lista de acesso (RLS) dá 404; sem nenhuma medição aberta no contrato
 * mostra o aviso com o link para Medições (o caso real do Lote 09); os booleanos de permissão vão
 * para a tabela como veio do servidor.
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
  carregarContrato: vi
    .fn()
    .mockResolvedValue({ id: CONTRATO, codigo: "L09", nome_obra: "BR-364 Lote 09", tipo_localizacao: "rodovia" }),
}));
vi.mock("@/modules/medicao/medicoes/queries", () => ({
  carregarMedicoes: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/modules/medicao/lancamentos/queries", () => ({
  servicosParaLancar: vi.fn().mockResolvedValue([]),
  listarLancamentos: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/modules/medicao/_shared/seletor-contrato", () => ({
  FiltroContrato: () => <div data-testid="filtro-contrato" />,
}));
vi.mock("@/modules/medicao/lancamentos/components/lancamentos-tabela", () => ({
  LancamentosTabela: ({ podeCriar, podeEditar, podeExcluir }: { podeCriar: boolean; podeEditar: boolean; podeExcluir: boolean }) => (
    <div data-testid="tabela">{`${podeCriar}|${podeEditar}|${podeExcluir}`}</div>
  ),
}));

import { servicosParaLancar } from "@/modules/medicao/lancamentos/queries";
import PaginaLancamentos from "./page";

afterEach(cleanup);

describe("PaginaLancamentos", () => {
  beforeEach(() => {
    getUsuarioLogado.mockReset().mockResolvedValue({ id: "u" });
    temPermissao.mockReset().mockReturnValue(true);
    vi.mocked(servicosParaLancar).mockReset().mockResolvedValue([]);
  });

  it("sem medicao.lancamentos/ver, dá 404", async () => {
    temPermissao.mockReturnValue(false);
    await expect(PaginaLancamentos({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sem contrato escolhido, mostra o seletor sem a tabela", async () => {
    render(await PaginaLancamentos({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("filtro-contrato")).toBeTruthy();
    expect(screen.queryByTestId("tabela")).toBeNull();
  });

  it("contrato fora da lista de acesso (RLS devolve null): 404", async () => {
    const { carregarContrato } = await import("@/modules/medicao/contratos/queries");
    vi.mocked(carregarContrato).mockResolvedValueOnce(null);
    await expect(PaginaLancamentos({ searchParams: Promise.resolve({ contrato: CONTRATO }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("sem nenhuma medição aberta no contrato (caso real do Lote 09): mostra o aviso com o link para Medições", async () => {
    vi.mocked(servicosParaLancar).mockResolvedValue([]);
    render(await PaginaLancamentos({ searchParams: Promise.resolve({ contrato: CONTRATO }) }));
    expect(screen.getByRole("alert")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Abra a próxima medição em Medições/ });
    expect(link.getAttribute("href")).toBe(`/medicao/medicoes?contrato=${CONTRATO}`);
    // Mesmo sem medição aberta, a tabela (com o histórico) continua visível.
    expect(screen.getByTestId("tabela")).toBeTruthy();
  });

  it("com medição aberta, sem o aviso", async () => {
    vi.mocked(servicosParaLancar).mockResolvedValue([
      {
        medicaoId: "m11",
        medicaoNumero: 11,
        periodoInicio: "2026-09-01",
        periodoFim: "2026-09-30",
        itemId: "item-1",
        codigo: "02.02",
        descricao: "Escavação",
        unidade: "m3",
        quantidadePrevista: "1000",
      },
    ]);
    render(await PaginaLancamentos({ searchParams: Promise.resolve({ contrato: CONTRATO }) }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("os booleanos de permissão (criar/editar/excluir) vão para a tabela como o servidor calculou", async () => {
    temPermissao.mockImplementation(
      (_u: unknown, recurso: string, acao: string) => recurso === "medicao.lancamentos" && acao !== "excluir",
    );
    render(await PaginaLancamentos({ searchParams: Promise.resolve({ contrato: CONTRATO }) }));
    expect(screen.getByTestId("tabela").textContent).toBe("true|true|false");
  });

  it("sem medicao.medicoes/ver: o aviso fica sem o link, só o texto", async () => {
    temPermissao.mockImplementation((_u: unknown, recurso: string) => recurso !== "medicao.medicoes");
    render(await PaginaLancamentos({ searchParams: Promise.resolve({ contrato: CONTRATO }) }));
    expect(screen.getByText(/Peça para abrir a próxima medição em Medições/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Abra a próxima medição/ })).toBeNull();
  });
});
