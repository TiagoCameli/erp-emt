import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Página do detalhe da medição: guarda `medicao.medicoes/ver`, 404 para id inválido e para medição
 * fora da lista de acesso (RLS devolve null), e os passos do ciclo calculados no servidor pelo status
 * e pelas permissões (editar, aprovar, desaprovar).
 */

const getUsuarioLogado = vi.fn();
const temPermissao = vi.fn();
const carregarMedicao = vi.fn();
const revisaoItens = vi.fn();
const ID = "33333333-3333-4333-8333-333333333333";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/permissoes", () => ({
  getUsuarioLogado: () => getUsuarioLogado(),
  temPermissao: (...args: unknown[]) => temPermissao(...args),
}));
vi.mock("@/modules/medicao/medicoes/detalhe-queries", () => ({
  carregarMedicao: (...a: unknown[]) => carregarMedicao(...a),
  revisaoItens: (...a: unknown[]) => revisaoItens(...a),
}));
vi.mock("@/modules/medicao/medicoes/components/aprovar-drawer", () => ({
  BotaoAprovar: ({ revisaoRotulo, linhas }: { revisaoRotulo: string; linhas: { itemId: string; medida: string }[] }) => (
    <span data-testid="botao-aprovar">{`${revisaoRotulo}:${linhas.map((l) => `${l.itemId}=${l.medida}`).join(",")}`}</span>
  ),
}));
vi.mock("@/modules/medicao/medicoes/components/medicao-detalhe", () => ({
  MedicaoDetalhe: ({
    passos,
    podeVerLancamentos,
    botaoAprovar,
    congelados,
  }: {
    passos: string[];
    podeVerLancamentos: boolean;
    botaoAprovar?: ReactNode;
    congelados: unknown[];
  }) => (
    <div>
      <span data-testid="passos">{passos.join(",")}</span>
      <span data-testid="lancamentos">{podeVerLancamentos ? "sim" : "não"}</span>
      <span data-testid="congelados">{congelados.length}</span>
      {botaoAprovar ?? <span data-testid="sem-aprovar" />}
    </div>
  ),
}));

import PaginaMedicao from "./page";

const params = (id = ID) => ({ params: Promise.resolve({ id }) });

function medicao(status: string, corrente: { status: string; fase: string; numero: number } | null) {
  return {
    id: ID,
    status,
    revisaoCorrente: corrente ? { id: "r", motivo: null, criadoEm: "", ...corrente } : null,
    itens: [{ itemId: "i1", codigo: "01.01", descricao: "CBUQ", unidade: "t" }],
  };
}

afterEach(cleanup);

beforeEach(() => {
  getUsuarioLogado.mockReset().mockResolvedValue({ id: "u" });
  temPermissao.mockReset().mockReturnValue(true);
  carregarMedicao.mockReset().mockResolvedValue(medicao("aberta", { status: "em_aberto", fase: "antes_aprovacao", numero: 0 }));
  revisaoItens.mockReset().mockResolvedValue({
    congelados: [
      { revisaoId: "r-velha", itemId: "i1", quantidade: "28" },
      { revisaoId: "r", itemId: "i1", quantidade: "29" },
    ],
    extras: [],
  });
});

describe("PaginaMedicao", () => {
  it("sem medicao.medicoes/ver: 404 sem ir ao banco", async () => {
    temPermissao.mockReturnValue(false);
    await expect(PaginaMedicao(params())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(carregarMedicao).not.toHaveBeenCalled();
  });

  it("id inválido: 404", async () => {
    await expect(PaginaMedicao(params("x"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(carregarMedicao).not.toHaveBeenCalled();
  });

  it("medição fora da lista de acesso: 404", async () => {
    carregarMedicao.mockResolvedValue(null);
    await expect(PaginaMedicao(params())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("aberta com editar: Fechar", async () => {
    render(await PaginaMedicao(params()));
    expect(screen.getByTestId("passos").textContent).toBe("fechar");
    expect(screen.getByTestId("lancamentos").textContent).toBe("sim");
  });

  it("enviada só com aprovar: só Aprovar", async () => {
    carregarMedicao.mockResolvedValue(medicao("enviada", { status: "enviada", fase: "antes_aprovacao", numero: 0 }));
    temPermissao.mockImplementation((_u: unknown, recurso: string, acao: string) => recurso !== "medicao.medicoes" || acao === "ver" || acao === "aprovar");
    render(await PaginaMedicao(params()));
    expect(screen.getByTestId("passos").textContent).toBe("aprovar");
    // O drawer recebe só os itens congelados da revisão enviada.
    expect(screen.getByTestId("botao-aprovar").textContent).toBe("REV00:i1=29");
    expect(revisaoItens).toHaveBeenCalledWith(ID, ["i1"]);
  });

  it("aprovada com revisão pós-aprovação enviada: o drawer usa a congelada da pendente; os itens da medição seguem os do banco", async () => {
    const m = medicao("aprovada", { status: "enviada", fase: "pos_aprovacao", numero: 2 });
    carregarMedicao.mockResolvedValue(m);
    render(await PaginaMedicao(params()));
    expect(screen.getByTestId("passos").textContent).toBe("nova_revisao,aprovar");
    expect(screen.getByTestId("botao-aprovar").textContent).toBe("REV02:i1=29");
  });

  it("sem o passo aprovar, não vai botão de aprovar; as quantidades congeladas vão para as revisões", async () => {
    render(await PaginaMedicao(params()));
    expect(screen.queryByTestId("botao-aprovar")).toBeNull();
    expect(screen.getByTestId("congelados").textContent).toBe("2");
  });

  it("aprovada sem pendente, com desaprovar: Revisar aprovada", async () => {
    carregarMedicao.mockResolvedValue(medicao("aprovada", null));
    render(await PaginaMedicao(params()));
    expect(screen.getByTestId("passos").textContent).toBe("revisar_aprovada");
  });

  it("sem medicao.lancamentos/ver, o botão de lançamentos não vai", async () => {
    temPermissao.mockImplementation((_u: unknown, recurso: string) => recurso !== "medicao.lancamentos");
    render(await PaginaMedicao(params()));
    expect(screen.getByTestId("lancamentos").textContent).toBe("não");
  });
});
