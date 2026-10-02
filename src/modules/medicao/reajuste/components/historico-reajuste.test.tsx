import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Histórico dos relatórios de reajuste da medição: todos, inclusive os excluídos (riscados, com o
 * motivo). A diferença para o anterior vem pronta do banco e só existe no relatório que vale
 * (`mc_v_reajuste_medicao`): as outras linhas não mostram diferença nenhuma (nada é somado aqui).
 */

const urlDoAnexo = vi.fn(async (vinculoId: string) => ({ url: vinculoId ? "https://exemplo/siac.pdf" : "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/medicao/medicoes/m1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));
vi.mock("@/modules/_shared/anexos/actions", () => ({
  urlDoAnexo: (id: string) => urlDoAnexo(id),
}));
vi.mock("@/modules/medicao/reajuste/actions", () => ({
  excluirRelatorioReajuste: vi.fn(),
}));

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { HistoricoReajuste } from "@/modules/medicao/reajuste/components/historico-reajuste";
import { anexo, ARQUIVO_USADO, MEDICAO, REAJUSTE_K9 } from "@/modules/medicao/reajuste/components/__fixtures__/tela";

afterEach(cleanup);
afterEach(limparEstadosTabelaParaTeste);
afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const texto = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

function linhas(container: HTMLElement) {
  return Array.from(container.querySelectorAll("tbody tr"));
}

function celula(linha: Element, coluna: string) {
  return texto(linha.querySelector(`[data-coluna="${coluna}"]`));
}

function renderizar(podeEditar = true) {
  return render(
    <HistoricoReajuste
      medicaoId={MEDICAO}
      relatorios={REAJUSTE_K9.relatorios}
      vigente={REAJUSTE_K9.vigente}
      anexos={[anexo(ARQUIVO_USADO, "siac-def.pdf")]}
      podeEditar={podeEditar}
      onExcluido={vi.fn()}
    />,
  );
}

describe("HistoricoReajuste", () => {
  it("o que vale mostra a diferença do banco, R$ 2,99 a receber; os outros, nenhuma", () => {
    const { container } = renderizar();
    const [primeiro, segundo, terceiro] = linhas(container);
    expect(celula(segundo, "diferenca")).toBe("R$ 2,99 a receber");
    expect(celula(primeiro, "diferenca")).toBe("");
    expect(celula(terceiro, "diferenca")).toBe("");
    expect(celula(segundo, "situacao")).toContain("Definitivo");
    expect(celula(segundo, "situacao")).toContain("Vale");
    expect(celula(primeiro, "origem")).toBe("SIAC");
    expect(celula(terceiro, "origem")).toBe("Manual");
    expect(celula(segundo, "quem")).toBe("Tiago");
  });

  it("excluído: total riscado, selo Excluído e o motivo", () => {
    const { container } = renderizar();
    const terceiro = linhas(container)[2];
    expect(celula(terceiro, "situacao")).toContain("Excluído");
    expect(texto(terceiro)).toContain("Lançado na medição errada");
    expect(terceiro.querySelector('[data-coluna="total"] .line-through')).not.toBeNull();
  });

  it("PDF abre pelo vínculo do anexo (urlDoAnexo)", async () => {
    const abrir = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = renderizar();
    const segundo = linhas(container)[1];
    fireEvent.click(within(segundo as HTMLElement).getByRole("button", { name: "Abrir siac-def.pdf" }));
    await waitFor(() => expect(urlDoAnexo).toHaveBeenCalledWith(`v-${ARQUIVO_USADO}`));
    await waitFor(() => expect(abrir).toHaveBeenCalledWith("https://exemplo/siac.pdf", "_blank", "noopener,noreferrer"));
    abrir.mockRestore();
  });

  it("Excluir só com permissão e só nos não excluídos; abre o diálogo com motivo", () => {
    const { container, unmount } = renderizar(true);
    const [primeiro, segundo, terceiro] = linhas(container);
    expect(within(primeiro as HTMLElement).queryByRole("button", { name: "Excluir relatório 1" })).not.toBeNull();
    expect(within(segundo as HTMLElement).queryByRole("button", { name: "Excluir relatório 2" })).not.toBeNull();
    expect(within(terceiro as HTMLElement).queryByRole("button", { name: /Excluir relatório/ })).toBeNull();
    fireEvent.click(within(segundo as HTMLElement).getByRole("button", { name: "Excluir relatório 2" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByLabelText("Motivo")).toBeTruthy();
    unmount();

    renderizar(false);
    expect(screen.queryByRole("button", { name: /Excluir relatório/ })).toBeNull();
  });

  it("no celular, o Excluir fica no canto do card (coluna acoes), não em Mais campos", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (consulta: string) => ({ matches: true, media: consulta, addEventListener: () => {}, removeEventListener: () => {} }),
    });
    renderizar(true);
    expect(document.body.querySelector("[data-cartao]")).not.toBeNull();
    const botao = screen.getByRole("button", { name: "Excluir relatório 1" });
    expect(botao.closest("dl")).toBeNull();
    expect(screen.queryByText("acao")).toBeNull();
  });
});
