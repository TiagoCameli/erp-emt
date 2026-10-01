import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Página do detalhe da medição: guarda `medicao.medicoes/ver`, 404 para id inválido e para medição
 * fora da lista de acesso (RLS devolve null), e os passos do ciclo calculados no servidor pelo status
 * e pelas permissões (editar, aprovar, desaprovar).
 */

const getUsuarioLogado = vi.fn();
const temPermissao = vi.fn();
const carregarMedicao = vi.fn();
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
}));
vi.mock("@/modules/medicao/medicoes/components/medicao-detalhe", () => ({
  MedicaoDetalhe: ({ passos, podeVerLancamentos }: { passos: string[]; podeVerLancamentos: boolean }) => (
    <div>
      <span data-testid="passos">{passos.join(",")}</span>
      <span data-testid="lancamentos">{podeVerLancamentos ? "sim" : "não"}</span>
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
  };
}

afterEach(cleanup);

beforeEach(() => {
  getUsuarioLogado.mockReset().mockResolvedValue({ id: "u" });
  temPermissao.mockReset().mockReturnValue(true);
  carregarMedicao.mockReset().mockResolvedValue(medicao("aberta", { status: "em_aberto", fase: "antes_aprovacao", numero: 0 }));
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
