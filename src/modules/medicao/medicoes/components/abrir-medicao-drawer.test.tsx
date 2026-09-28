import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Drawer "Abrir próxima medição": busca a sugestão (`fn_mc_medicao_sugestao`) ao abrir, pré-preenche
 * o período, deixa editar, e grava por `fn_mc_medicao_abrir`. A recusa do banco (P0001, pt-BR)
 * aparece no toast, sem fechar o drawer nem perder o que foi digitado.
 */

const sugestaoMedicao = vi.fn();
const abrirMedicao = vi.fn();
const toastErro = vi.fn();
const toastSucesso = vi.fn();

vi.mock("@/modules/medicao/medicoes/actions", () => ({
  sugestaoMedicao: (...args: unknown[]) => sugestaoMedicao(...args),
  abrirMedicao: (...args: unknown[]) => abrirMedicao(...args),
}));
vi.mock("@/components/canonicos/toast", () => ({
  toast: {
    error: (...a: unknown[]) => toastErro(...a),
    success: (...a: unknown[]) => toastSucesso(...a),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import { AbrirMedicaoDrawer } from "@/modules/medicao/medicoes/components/abrir-medicao-drawer";

const CONTRATO = "33333333-3333-4333-8333-333333333333";
const SUGESTAO = {
  numero: 11,
  periodo_inicio: "2026-09-01",
  periodo_fim: "2026-09-30",
  versao_numero: 2,
  depois_de: "2026-08-31",
};

function renderizar(onAbertoChange = vi.fn(), onAberta = vi.fn()) {
  render(
    <AbrirMedicaoDrawer aberto contratoId={CONTRATO} onAbertoChange={onAbertoChange} onAberta={onAberta} />,
  );
  return { onAbertoChange, onAberta };
}

beforeEach(() => {
  sugestaoMedicao.mockReset().mockResolvedValue({ ok: true, sugestao: SUGESTAO });
  abrirMedicao.mockReset();
  toastErro.mockReset();
  toastSucesso.mockReset();
});
afterEach(cleanup);

describe("AbrirMedicaoDrawer", () => {
  it("abre com o período sugerido preenchido e o título com a Nª", async () => {
    renderizar();

    await waitFor(() => expect(screen.getByText("Abrir a 11ª medição")).toBeTruthy());
    expect((screen.getByLabelText(/Início do período/) as HTMLInputElement).value).toBe("2026-09-01");
    expect((screen.getByLabelText(/Fim do período/) as HTMLInputElement).value).toBe("2026-09-30");
    expect(screen.getByText(/Planilha vigente: v2/)).toBeTruthy();
    expect(sugestaoMedicao).toHaveBeenCalledWith(CONTRATO);
  });

  it("permite editar o período sugerido antes de gravar", async () => {
    abrirMedicao.mockResolvedValue({ ok: true, id: "nova-medicao" });
    renderizar();
    await waitFor(() => expect(screen.getByLabelText(/Fim do período/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/Fim do período/), { target: { value: "2026-10-05" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir medição" }));

    await waitFor(() => expect(abrirMedicao).toHaveBeenCalledTimes(1));
    expect(abrirMedicao).toHaveBeenCalledWith({ contratoId: CONTRATO, inicio: "2026-09-01", fim: "2026-10-05" });
  });

  it("mostra o erro do banco ao gravar, sem fechar o drawer", async () => {
    abrirMedicao.mockResolvedValue({ erro: "A 11ª medição tem de começar depois de 31/08/2026 (fim da 10ª)" });
    const { onAbertoChange } = renderizar();
    await waitFor(() => expect(screen.getByLabelText(/Início do período/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Abrir medição" }));

    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("A 11ª medição tem de começar depois de 31/08/2026 (fim da 10ª)"));
    expect(onAbertoChange).not.toHaveBeenCalledWith(false);
  });

  it("fecha e avisa com sucesso", async () => {
    abrirMedicao.mockResolvedValue({ ok: true, id: "nova-medicao" });
    const { onAbertoChange, onAberta } = renderizar();
    await waitFor(() => expect(screen.getByLabelText(/Início do período/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Abrir medição" }));

    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith("11ª medição aberta"));
    expect(onAbertoChange).toHaveBeenCalledWith(false);
    expect(onAberta).toHaveBeenCalled();
  });

  it("sem sugestão (banco recusou, ex.: sem planilha vigente): mostra o erro e desabilita gravar", async () => {
    sugestaoMedicao.mockResolvedValue({ erro: "O contrato L09 não tem planilha vigente. Aprove a planilha antes de abrir medição" });
    renderizar();

    await waitFor(() =>
      expect(screen.getByText("O contrato L09 não tem planilha vigente. Aprove a planilha antes de abrir medição")).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "Abrir medição" })).toBeDisabled();
    expect(abrirMedicao).not.toHaveBeenCalled();
  });
});
