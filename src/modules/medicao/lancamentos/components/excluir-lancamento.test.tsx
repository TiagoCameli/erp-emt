import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Diálogo de excluir um lançamento: motivo obrigatório (o banco confere o mínimo de 3 letras), e
 * o erro do banco vira toast sem perder o motivo digitado.
 */

const excluirLancamento = vi.fn();
const toastErro = vi.fn();
const toastSucesso = vi.fn();

vi.mock("@/modules/medicao/lancamentos/actions", () => ({
  excluirLancamento: (...args: unknown[]) => excluirLancamento(...args),
}));
vi.mock("@/components/canonicos/toast", () => ({
  toast: {
    error: (...a: unknown[]) => toastErro(...a),
    success: (...a: unknown[]) => toastSucesso(...a),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import { ExcluirLancamento } from "@/modules/medicao/lancamentos/components/excluir-lancamento";
import type { LancamentoLista } from "@/modules/medicao/lancamentos/tipos";

function lancamento(over: Partial<LancamentoLista> = {}): LancamentoLista {
  return {
    id: "l1",
    contratoId: "c1",
    medicaoId: "m1",
    medicaoNumero: 11,
    medicaoStatus: "aberta",
    itemId: "item-1",
    codigo: "02.02",
    descricao: "Escavação",
    unidade: "m3",
    data: "2026-09-10",
    quantidade: "10",
    kmInicial: null,
    kmFinal: null,
    estaca: null,
    localTexto: null,
    observacao: null,
    motivoExcesso: null,
    createdAt: "2026-09-10T12:00:00Z",
    createdBy: "u1",
    anexos: 0,
    ...over,
  };
}

beforeEach(() => {
  excluirLancamento.mockReset();
  toastErro.mockReset();
  toastSucesso.mockReset();
});
afterEach(cleanup);

describe("ExcluirLancamento", () => {
  it("lancamento null: diálogo fechado", () => {
    render(<ExcluirLancamento lancamento={null} onFechar={vi.fn()} onExcluido={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("exclui com o motivo digitado e avisa sucesso", async () => {
    excluirLancamento.mockResolvedValue({ ok: true });
    const onExcluido = vi.fn();
    render(<ExcluirLancamento lancamento={lancamento()} onFechar={vi.fn()} onExcluido={onExcluido} />);

    expect(screen.getByRole("button", { name: "Excluir lançamento" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Lançado em duplicidade" } });
    fireEvent.click(screen.getByRole("button", { name: "Excluir lançamento" }));

    await waitFor(() => expect(excluirLancamento).toHaveBeenCalledWith("l1", "Lançado em duplicidade"));
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith("Lançamento excluído"));
    expect(onExcluido).toHaveBeenCalled();
  });

  it("erro do banco vira toast, sem chamar onExcluido", async () => {
    excluirLancamento.mockResolvedValue({ erro: "Informe o motivo da exclusão" });
    const onExcluido = vi.fn();
    render(<ExcluirLancamento lancamento={lancamento()} onFechar={vi.fn()} onExcluido={onExcluido} />);

    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: "Excluir lançamento" }));

    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("Informe o motivo da exclusão"));
    expect(onExcluido).not.toHaveBeenCalled();
  });
});
