import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { Boletim } from "@/modules/medicao/boletim/tipos";

/**
 * Página do boletim: o "Exportar Excel" exporta a Nª que a tela mostra (não o `?ate=` da URL, que
 * é nulo em "Última" e deixaria o xlsx sair até uma medição aberta depois de a tela carregar), fica
 * desabilitado quando o boletim não montou, e o contrato só vira link com `medicao.contratos/ver`.
 */

const getUsuarioLogado = vi.fn();
const temPermissao = vi.fn();
const carregarBoletim = vi.fn();
const gerarPlanilhaBoletim = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/medicao/boletim",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/permissoes", () => ({
  getUsuarioLogado: () => getUsuarioLogado(),
  temPermissao: (...args: unknown[]) => temPermissao(...args),
}));
vi.mock("@/lib/download", () => ({ baixarBase64: vi.fn() }));
vi.mock("@/modules/medicao/boletim/actions", () => ({
  gerarPlanilhaBoletim: (...args: unknown[]) => gerarPlanilhaBoletim(...args),
}));
vi.mock("@/modules/medicao/boletim/queries", () => ({
  carregarBoletim: (...args: unknown[]) => carregarBoletim(...args),
}));
vi.mock("@/modules/medicao/contratos/queries", () => ({
  listarContratos: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/modules/medicao/boletim/components/seletor-boletim", () => ({
  SeletorBoletim: () => <div data-testid="seletor" />,
}));
vi.mock("@/modules/medicao/boletim/components/boletim-cartoes", () => ({
  BoletimCartoes: () => <div data-testid="cartoes" />,
}));
vi.mock("@/modules/medicao/boletim/components/boletim-tabela", () => ({
  BoletimTabela: () => <div data-testid="tabela" />,
}));

import PaginaBoletim from "./page";

const CONTRATO = "11111111-1111-4111-8111-111111111111";

function boletim(over: Partial<Boletim> = {}): Boletim {
  return {
    contrato: {
      id: CONTRATO,
      codigo: "L09/2026",
      nome_obra: "BR-364 Lote 09",
      numero_contrato: null,
      contratante_nome: "DNIT",
      regra_arredondamento: "item_por_medicao",
    },
    versao: { id: "v", numero: 1, vigente_desde: "2026-01-01" },
    ate: 10,
    medicoes: [],
    linhas: [],
    fora_da_versao: [],
    total: { previsto: "1.00", valor_medicao: "1.00", acumulado: "1.00", saldo: "0.00", pct_executado: "1", pct_a_medir: "0", reajuste_medicao: "0", reajuste_acumulado: "0" },
    ...over,
  };
}

const busca = (params: Record<string, string>) => Promise.resolve(params);

afterEach(cleanup);

describe("PaginaBoletim", () => {
  beforeEach(() => {
    getUsuarioLogado.mockReset().mockResolvedValue({ id: "u" });
    temPermissao.mockReset().mockReturnValue(true);
    carregarBoletim.mockReset();
    gerarPlanilhaBoletim.mockReset().mockResolvedValue({ base64: "", nomeArquivo: "b.xlsx" });
  });

  it("em \"Última\" (sem ?ate=), exporta a Nª que a tela mostra, não a última de quando clicar", async () => {
    carregarBoletim.mockResolvedValue({ boletim: boletim({ ate: 10 }), erro: null });
    render(await PaginaBoletim({ searchParams: busca({ contrato: CONTRATO }) }));
    fireEvent.click(screen.getByRole("button", { name: /Exportar Excel/ }));
    await waitFor(() => expect(gerarPlanilhaBoletim).toHaveBeenCalledWith(CONTRATO, 10));
  });

  it("boletim que não montou: o botão fica desabilitado (só repetiria o erro da RPC)", async () => {
    carregarBoletim.mockResolvedValue({ boletim: null, erro: "A 11ª medição não existe neste contrato" });
    render(await PaginaBoletim({ searchParams: busca({ contrato: CONTRATO, ate: "11" }) }));
    const botao = screen.getByRole("button", { name: /Exportar Excel/ }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    fireEvent.click(botao);
    expect(gerarPlanilhaBoletim).not.toHaveBeenCalled();
  });

  it("com medicao.contratos/ver, o contrato é link para a página do contrato", async () => {
    carregarBoletim.mockResolvedValue({ boletim: boletim(), erro: null });
    render(await PaginaBoletim({ searchParams: busca({ contrato: CONTRATO }) }));
    const link = screen.getByRole("link", { name: /L09\/2026/ });
    expect(link.getAttribute("href")).toBe(`/medicao/contratos/${CONTRATO}`);
  });

  it("sem medicao.contratos/ver, o contrato é texto (o link daria 404)", async () => {
    temPermissao.mockImplementation((_u: unknown, recurso: string) => recurso !== "medicao.contratos");
    carregarBoletim.mockResolvedValue({ boletim: boletim(), erro: null });
    render(await PaginaBoletim({ searchParams: busca({ contrato: CONTRATO }) }));
    expect(screen.getByText("L09/2026")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /L09\/2026/ })).toBeNull();
    expect(temPermissao).toHaveBeenCalledWith(expect.anything(), "medicao.contratos", "ver");
  });
});
