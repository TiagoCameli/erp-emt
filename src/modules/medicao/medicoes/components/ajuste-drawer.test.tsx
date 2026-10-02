import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Drawer de ajuste: serviço da versão da medição, quantidade (pode ser negativa) e motivo. O que foi
 * digitado vai para a action como está; quem converte para o banco é o schema do servidor. A recusa
 * do banco aparece no toast sem fechar o drawer.
 */

const lancarAjuste = vi.fn();
const toastErro = vi.fn();
const toastSucesso = vi.fn();

vi.mock("@/modules/medicao/medicoes/ciclo-actions", () => ({
  lancarAjuste: (...a: unknown[]) => lancarAjuste(...a),
}));
vi.mock("@/components/canonicos/toast", () => ({
  toast: {
    error: (...a: unknown[]) => toastErro(...a),
    success: (...a: unknown[]) => toastSucesso(...a),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import { instalarLayoutDeLista } from "@/components/canonicos/combobox-jsdom-teste";
import { AjusteDrawer } from "@/modules/medicao/medicoes/components/ajuste-drawer";

const MEDICAO = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";
const SERVICOS = [{ itemId: ITEM, codigo: "01.01", descricao: "CBUQ", unidade: "t" }];

function renderizar(onAbertoChange = vi.fn(), onLancado = vi.fn()) {
  render(
    <AjusteDrawer aberto onAbertoChange={onAbertoChange} medicaoId={MEDICAO} revisaoRotulo="REV00" servicos={SERVICOS} onLancado={onLancado} />,
  );
  return { onAbertoChange, onLancado };
}

function preencher(quantidade: string, motivo: string) {
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: /01\.01/ }));
  fireEvent.change(screen.getByLabelText(/Quantidade/), { target: { value: quantidade } });
  fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: motivo } });
}

beforeAll(() => instalarLayoutDeLista());
beforeEach(() => {
  lancarAjuste.mockReset();
  toastErro.mockReset();
  toastSucesso.mockReset();
});
afterEach(cleanup);

describe("AjusteDrawer", () => {
  it("ajuste negativo vai como -2", async () => {
    lancarAjuste.mockResolvedValue({ ok: true });
    const { onAbertoChange, onLancado } = renderizar();
    preencher("-2", "Medido em dobro");
    fireEvent.click(screen.getByRole("button", { name: "Lançar ajuste" }));

    await waitFor(() =>
      expect(lancarAjuste).toHaveBeenCalledWith({ medicaoId: MEDICAO, itemId: ITEM, quantidade: "-2", motivo: "Medido em dobro" }),
    );
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith("Ajuste lançado na REV00"));
    expect(onAbertoChange).toHaveBeenCalledWith(false);
    expect(onLancado).toHaveBeenCalled();
  });

  it("quantidade zero e motivo curto não vão ao servidor", async () => {
    renderizar();
    preencher("0", "ab");
    fireEvent.click(screen.getByRole("button", { name: "Lançar ajuste" }));
    await waitFor(() => expect(screen.getByText("Informe a quantidade do ajuste, positiva ou negativa, até 4 casas")).toBeTruthy());
    expect(screen.getByText("Informe o motivo, com ao menos 3 letras")).toBeTruthy();
    expect(lancarAjuste).not.toHaveBeenCalled();
  });

  it("recusa do banco aparece no toast e o drawer fica aberto", async () => {
    lancarAjuste.mockResolvedValue({ erro: "A 3ª medição não está recebendo ajuste: feche a medição ou abra a revisão pós-aprovação" });
    const { onAbertoChange } = renderizar();
    preencher("1,5", "Conferência");
    fireEvent.click(screen.getByRole("button", { name: "Lançar ajuste" }));
    await waitFor(() =>
      expect(toastErro).toHaveBeenCalledWith("A 3ª medição não está recebendo ajuste: feche a medição ou abra a revisão pós-aprovação"),
    );
    expect(onAbertoChange).not.toHaveBeenCalledWith(false);
  });
});
