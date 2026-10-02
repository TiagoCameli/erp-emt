import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Reajuste sem relatório SIAC: valor digitado (sem sinal) + sentido, situação, observação e o PDF
 * pendente opcional. O que foi digitado vai como está; quem converte para o banco é o schema do
 * servidor (`manualSchema`), e a RPC confere de novo.
 */

const lancarReajusteManual = vi.fn();
const toastErro = vi.fn();
const toastSucesso = vi.fn();

vi.mock("@/modules/medicao/reajuste/actions", () => ({
  lancarReajusteManual: (...a: unknown[]) => lancarReajusteManual(...a),
}));
vi.mock("@/components/canonicos/toast", () => ({
  toast: { error: (...a: unknown[]) => toastErro(...a), success: (...a: unknown[]) => toastSucesso(...a), warning: vi.fn(), info: vi.fn() },
}));

import { instalarLayoutDeLista } from "@/components/canonicos/combobox-jsdom-teste";
import { ReajusteManualDrawer } from "@/modules/medicao/reajuste/components/reajuste-manual-drawer";
import { ARQUIVO, MEDICAO } from "@/modules/medicao/reajuste/components/__fixtures__/tela";

beforeAll(() => instalarLayoutDeLista());
beforeEach(() => {
  lancarReajusteManual.mockReset();
  toastErro.mockReset();
  toastSucesso.mockReset();
});
afterEach(cleanup);

function renderizar() {
  const onAbertoChange = vi.fn();
  const onLancado = vi.fn();
  render(
    <ReajusteManualDrawer
      aberto
      onAbertoChange={onAbertoChange}
      medicaoId={MEDICAO}
      numero={2}
      pendentes={[{ arquivoId: ARQUIVO, nome: "oficio-reajuste.pdf", criadoEm: "2026-10-02T12:00:00Z" }]}
      onLancado={onLancado}
    />,
  );
  return { onAbertoChange, onLancado };
}

function escolher(rotulo: string, opcao: string) {
  fireEvent.click(screen.getByRole("combobox", { name: rotulo }));
  fireEvent.click(screen.getByRole("option", { name: opcao }));
}

describe("ReajusteManualDrawer", () => {
  it("manual negativo provisório com o PDF pendente vai como foi digitado", async () => {
    lancarReajusteManual.mockResolvedValue({ ok: true, relatorioId: "r5" });
    const { onAbertoChange, onLancado } = renderizar();
    fireEvent.change(screen.getByLabelText(/Valor/), { target: { value: "1234,56" } });
    escolher("Sentido", "Negativo (a devolver)");
    escolher("Situação dos índices", "Provisório");
    escolher("Anexo", "oficio-reajuste.pdf");
    fireEvent.change(screen.getByLabelText(/Observação/), { target: { value: "Ofício 12/2026 da Prefeitura" } });
    fireEvent.click(screen.getByRole("button", { name: "Lançar reajuste" }));

    await waitFor(() =>
      expect(lancarReajusteManual).toHaveBeenCalledWith(MEDICAO, {
        valor: "1234,56",
        sentido: "negativo",
        situacao: "provisorio",
        observacao: "Ofício 12/2026 da Prefeitura",
        arquivoId: ARQUIVO,
      }),
    );
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith("Reajuste lançado na 2ª medição"));
    expect(onAbertoChange).toHaveBeenCalledWith(false);
    expect(onLancado).toHaveBeenCalled();
  });

  it("sem valor, sentido e situação não vai ao servidor e diz o que falta", async () => {
    renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Lançar reajuste" }));
    expect(await screen.findByText("Informe o valor do reajuste, até 2 casas")).toBeTruthy();
    expect(screen.getByText("Escolha se o reajuste é positivo ou negativo")).toBeTruthy();
    expect(screen.getByText("Escolha a situação dos índices: provisório ou definitivo")).toBeTruthy();
    expect(lancarReajusteManual).not.toHaveBeenCalled();
  });

  it("recusa do banco aparece no toast como veio e o drawer fica aberto", async () => {
    lancarReajusteManual.mockResolvedValue({ erro: "A 2ª medição está aberta: o reajuste entra só em medição enviada ou aprovada" });
    const { onAbertoChange } = renderizar();
    fireEvent.change(screen.getByLabelText(/Valor/), { target: { value: "10" } });
    escolher("Sentido", "Positivo (a receber)");
    escolher("Situação dos índices", "Definitivo");
    fireEvent.click(screen.getByRole("button", { name: "Lançar reajuste" }));
    await waitFor(() =>
      expect(toastErro).toHaveBeenCalledWith("A 2ª medição está aberta: o reajuste entra só em medição enviada ou aprovada"),
    );
    expect(lancarReajusteManual).toHaveBeenCalledWith(MEDICAO, expect.objectContaining({ valor: "10", sentido: "positivo", situacao: "definitivo", arquivoId: null }));
    expect(onAbertoChange).not.toHaveBeenCalledWith(false);
  });
});
