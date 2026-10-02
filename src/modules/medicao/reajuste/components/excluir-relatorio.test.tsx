import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Excluir um relatório de reajuste: motivo obrigatório com 3 letras ou mais (o banco cobra o mesmo);
 * sem motivo nada vai ao servidor; a recusa do banco vira toast e o diálogo fica aberto.
 */

const excluirRelatorioReajuste = vi.fn();
const toastErro = vi.fn();
const toastSucesso = vi.fn();

vi.mock("@/modules/medicao/reajuste/actions", () => ({
  excluirRelatorioReajuste: (...a: unknown[]) => excluirRelatorioReajuste(...a),
}));
vi.mock("@/components/canonicos/toast", () => ({
  toast: { error: (...a: unknown[]) => toastErro(...a), success: (...a: unknown[]) => toastSucesso(...a), warning: vi.fn(), info: vi.fn() },
}));

import { ExcluirRelatorio } from "@/modules/medicao/reajuste/components/excluir-relatorio";
import { MEDICAO, relatorio } from "@/modules/medicao/reajuste/components/__fixtures__/tela";

beforeEach(() => {
  excluirRelatorioReajuste.mockReset();
  toastErro.mockReset();
  toastSucesso.mockReset();
});
afterEach(cleanup);

describe("ExcluirRelatorio", () => {
  it("relatório null: diálogo fechado", () => {
    render(<ExcluirRelatorio relatorio={null} medicaoId={MEDICAO} onFechar={vi.fn()} onExcluido={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sem motivo (ou com menos de 3 letras) o botão fica desabilitado e nada vai ao servidor", () => {
    render(<ExcluirRelatorio relatorio={relatorio()} medicaoId={MEDICAO} onFechar={vi.fn()} onExcluido={vi.fn()} />);
    const botao = screen.getByRole("button", { name: "Excluir relatório" });
    expect(botao).toBeDisabled();
    fireEvent.click(botao);
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "ab" } });
    expect(botao).toBeDisabled();
    fireEvent.click(botao);
    expect(excluirRelatorioReajuste).not.toHaveBeenCalled();
  });

  it("exclui com o motivo e avisa; volta a valer o anterior", async () => {
    excluirRelatorioReajuste.mockResolvedValue({ ok: true });
    const onExcluido = vi.fn();
    render(<ExcluirRelatorio relatorio={relatorio()} medicaoId={MEDICAO} onFechar={vi.fn()} onExcluido={onExcluido} />);
    expect(screen.getByText(/Relatório 1 \(SIAC, provisório, R\$ 5,01\)/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "PDF da medição errada" } });
    fireEvent.click(screen.getByRole("button", { name: "Excluir relatório" }));
    await waitFor(() => expect(excluirRelatorioReajuste).toHaveBeenCalledWith("r1", MEDICAO, "PDF da medição errada"));
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith("Relatório de reajuste 1 excluído"));
    expect(onExcluido).toHaveBeenCalled();
  });

  it("recusa do banco aparece no toast como veio, sem chamar onExcluido", async () => {
    excluirRelatorioReajuste.mockResolvedValue({ erro: "O relatório de reajuste 1 já foi excluído" });
    const onExcluido = vi.fn();
    render(<ExcluirRelatorio relatorio={relatorio()} medicaoId={MEDICAO} onFechar={vi.fn()} onExcluido={onExcluido} />);
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Duplicado" } });
    fireEvent.click(screen.getByRole("button", { name: "Excluir relatório" }));
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("O relatório de reajuste 1 já foi excluído"));
    expect(onExcluido).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
