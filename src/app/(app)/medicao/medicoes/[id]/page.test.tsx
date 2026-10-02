import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Página do detalhe da medição: guarda `medicao.medicoes/ver`, 404 para id inválido e para medição
 * fora da lista de acesso (RLS devolve null), e os passos do ciclo calculados no servidor pelo status
 * e pelas permissões (editar, aprovar, desaprovar). Reajuste (Fase 6): seção e dados só com
 * `medicao.reajuste/ver`; importar e lançar com editar e medição enviada ou aprovada; excluir com editar.
 */

const getUsuarioLogado = vi.fn();
const temPermissao = vi.fn();
const carregarMedicao = vi.fn();
const revisaoItens = vi.fn();
const carregarReajusteMedicao = vi.fn();
const pdfsPendentes = vi.fn();
const listarAnexosDoDocumento = vi.fn();
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
vi.mock("@/modules/medicao/reajuste/queries", () => ({
  carregarReajusteMedicao: (...a: unknown[]) => carregarReajusteMedicao(...a),
  pdfsPendentes: (...a: unknown[]) => pdfsPendentes(...a),
}));
vi.mock("@/modules/_shared/anexos/queries", () => ({
  listarAnexosDoDocumento: (...a: unknown[]) => listarAnexosDoDocumento(...a),
}));
vi.mock("@/modules/medicao/reajuste/components/secao-reajuste", () => ({
  SecaoReajuste: ({ podeEditar, podeLancar, pendentes }: { podeEditar: boolean; podeLancar: boolean; pendentes: unknown[] }) => (
    <span data-testid="reajuste">{`editar=${podeEditar} lancar=${podeLancar} pendentes=${pendentes.length}`}</span>
  ),
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
    secaoReajuste,
  }: {
    passos: string[];
    podeVerLancamentos: boolean;
    botaoAprovar?: ReactNode;
    congelados: unknown[];
    secaoReajuste?: ReactNode;
  }) => (
    <div>
      {secaoReajuste ?? <span data-testid="sem-reajuste" />}
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
  carregarReajusteMedicao.mockReset().mockResolvedValue({ vigente: null, relatorios: [], linhas: [], indices: [] });
  pdfsPendentes.mockReset().mockResolvedValue([{ arquivoId: "a1", nome: "siac.pdf", criadoEm: "" }]);
  listarAnexosDoDocumento.mockReset().mockResolvedValue([]);
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

  it("sem medicao.reajuste/ver: nem a seção nem os dados do reajuste", async () => {
    temPermissao.mockImplementation((_u: unknown, recurso: string) => recurso !== "medicao.reajuste");
    render(await PaginaMedicao(params()));
    expect(screen.getByTestId("sem-reajuste")).toBeTruthy();
    expect(carregarReajusteMedicao).not.toHaveBeenCalled();
    expect(pdfsPendentes).not.toHaveBeenCalled();
    expect(listarAnexosDoDocumento).not.toHaveBeenCalled();
  });

  it("medição aberta com editar o reajuste: a seção vem, mas sem importar nem lançar", async () => {
    render(await PaginaMedicao(params()));
    expect(screen.getByTestId("reajuste").textContent).toBe("editar=true lancar=false pendentes=1");
    expect(carregarReajusteMedicao).toHaveBeenCalledWith(ID);
    expect(listarAnexosDoDocumento).toHaveBeenCalledWith("mc_reajuste", ID);
  });

  it("enviada ou aprovada com editar: importar e lançar; só ver: nenhum botão", async () => {
    carregarMedicao.mockResolvedValue(medicao("enviada", { status: "enviada", fase: "antes_aprovacao", numero: 0 }));
    const { unmount } = render(await PaginaMedicao(params()));
    expect(screen.getByTestId("reajuste").textContent).toBe("editar=true lancar=true pendentes=1");
    unmount();

    carregarMedicao.mockResolvedValue(medicao("aprovada", null));
    temPermissao.mockImplementation((_u: unknown, recurso: string, acao: string) => recurso !== "medicao.reajuste" || acao === "ver");
    render(await PaginaMedicao(params()));
    expect(screen.getByTestId("reajuste").textContent).toBe("editar=false lancar=false pendentes=1");
  });
});
