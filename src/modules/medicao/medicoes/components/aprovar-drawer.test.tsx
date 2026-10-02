import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Drawer de aprovação: cada item da revisão enviada com a medida congelada e o campo da aprovada;
 * "Aprovar tudo como medido" preenche com a medida e manda `tudoComoMedido: true`; campo vazio vai
 * como 0 e aparece no aviso antes de confirmar, com a glosa de cada item (só exibida). O confirmar
 * fica desabilitado enquanto aprova (duplo clique manda um pedido só); a recusa do banco aparece no
 * toast e o drawer continua aberto.
 */

const aprovarMedicao = vi.fn();
const toastErro = vi.fn();
const toastSucesso = vi.fn();

vi.mock("@/modules/medicao/medicoes/ciclo-actions", () => ({
  aprovarMedicao: (...a: unknown[]) => aprovarMedicao(...a),
}));
vi.mock("@/components/canonicos/toast", () => ({
  toast: {
    error: (...a: unknown[]) => toastErro(...a),
    success: (...a: unknown[]) => toastSucesso(...a),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { AprovarDrawer } from "@/modules/medicao/medicoes/components/aprovar-drawer";

const MEDICAO = "33333333-3333-4333-8333-333333333333";
const I1 = "44444444-4444-4444-8444-444444444444";
const I2 = "55555555-5555-4555-8555-555555555555";
const LINHAS = [
  { itemId: I1, codigo: "01.01", descricao: "CBUQ", unidade: "t", medida: "29.0000" },
  { itemId: I2, codigo: "01.02", descricao: "Pintura de ligação", unidade: "m²", medida: "2.5000" },
];

function renderizar() {
  const onAbertoChange = vi.fn();
  const onAprovado = vi.fn();
  render(
    <AprovarDrawer aberto onAbertoChange={onAbertoChange} medicaoId={MEDICAO} revisaoRotulo="REV01" linhas={LINHAS} onAprovado={onAprovado} />,
  );
  return { onAbertoChange, onAprovado };
}

const campo = (codigo: string) => screen.getByLabelText(`Aprovada do item ${codigo}`) as HTMLInputElement;

beforeEach(() => {
  aprovarMedicao.mockReset();
  toastErro.mockReset();
  toastSucesso.mockReset();
});
afterEach(cleanup);
afterEach(limparEstadosTabelaParaTeste);

describe("AprovarDrawer", () => {
  it("mostra a medida congelada de cada item", () => {
    renderizar();
    const linha = screen.getByText("CBUQ").closest("tr") as HTMLElement;
    // Medida e, com o campo ainda vazio (vai 0), a glosa igual à medida.
    expect(within(linha).getAllByText("29")).toHaveLength(2);
    const linha2 = screen.getByText("Pintura de ligação").closest("tr") as HTMLElement;
    expect(within(linha2).getAllByText("2,5")).toHaveLength(2);
  });

  it("aprovar tudo como medido preenche com a medida e manda tudoComoMedido: true", async () => {
    aprovarMedicao.mockResolvedValue({ ok: true });
    const { onAbertoChange, onAprovado } = renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Aprovar tudo como medido" }));
    expect(campo("01.01").value).toBe("29");
    expect(campo("01.02").value).toBe("2,5");

    fireEvent.click(screen.getByRole("button", { name: "Revisar e aprovar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Confirmar a aprovação da REV01" });
    expect(within(dialogo).getByText(/sem glosa/)).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Aprovar REV01" }));

    await waitFor(() => expect(aprovarMedicao).toHaveBeenCalledWith({ id: MEDICAO, itens: [], tudoComoMedido: true }));
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith("REV01 aprovada"));
    expect(onAbertoChange).toHaveBeenCalledWith(false);
    expect(onAprovado).toHaveBeenCalled();
  });

  it("mexer num campo depois de aprovar tudo volta para a aprovação por item", async () => {
    aprovarMedicao.mockResolvedValue({ ok: true });
    renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Aprovar tudo como medido" }));
    fireEvent.change(campo("01.01"), { target: { value: "27" } });
    fireEvent.click(screen.getByRole("button", { name: "Revisar e aprovar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Confirmar a aprovação da REV01" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Aprovar REV01" }));
    await waitFor(() =>
      expect(aprovarMedicao).toHaveBeenCalledWith({
        id: MEDICAO,
        itens: [
          { itemId: I1, quantidade: "27" },
          { itemId: I2, quantidade: "2,5" },
        ],
        tudoComoMedido: false,
      }),
    );
  });

  it("campo vazio vai como 0 e aparece no aviso, com a glosa por item", async () => {
    aprovarMedicao.mockResolvedValue({ ok: true });
    renderizar();
    fireEvent.change(campo("01.01"), { target: { value: "27" } });

    // A glosa da tela é só exibição (o banco recalcula): 29 - 27 = 2.
    const linha = screen.getByText("CBUQ").closest("tr") as HTMLElement;
    expect(within(linha).getByText("2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Revisar e aprovar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Confirmar a aprovação da REV01" });
    const zerados = within(dialogo).getByRole("list", { name: "Itens que vão com aprovada 0" });
    expect(within(zerados).getByText(/01\.02/)).toBeTruthy();
    expect(within(zerados).queryByText(/01\.01/)).toBeNull();
    const glosas = within(dialogo).getByRole("list", { name: "Glosa por item" });
    expect(within(glosas).getByText(/01\.01 · CBUQ: 2 t/)).toBeTruthy();
    expect(within(glosas).getByText(/01\.02 · Pintura de ligação: 2,5 m²/)).toBeTruthy();

    fireEvent.click(within(dialogo).getByRole("button", { name: "Aprovar REV01" }));
    await waitFor(() =>
      expect(aprovarMedicao).toHaveBeenCalledWith({
        id: MEDICAO,
        itens: [
          { itemId: I1, quantidade: "27" },
          { itemId: I2, quantidade: "0" },
        ],
        tudoComoMedido: false,
      }),
    );
  });

  it("aprovada acima da medida bloqueia: a lista aparece no drawer e o botão fica desabilitado", async () => {
    renderizar();
    fireEvent.change(campo("01.01"), { target: { value: "30" } });
    fireEvent.change(campo("01.02"), { target: { value: "2,5" } });
    const acima = screen.getByRole("list", { name: "Itens com aprovada acima da medida" });
    expect(within(acima).getByText(/01\.01 · CBUQ: aprovada 30 t, 1 t acima da medida/)).toBeTruthy();
    const revisarBotao = screen.getByRole("button", { name: "Revisar e aprovar" });
    expect(revisarBotao).toBeDisabled();
    fireEvent.click(revisarBotao);
    expect(screen.queryByRole("dialog", { name: "Confirmar a aprovação da REV01" })).toBeNull();
    // Corrigida a quantidade, o bloqueio sai.
    fireEvent.change(campo("01.01"), { target: { value: "29" } });
    expect(screen.queryByRole("list", { name: "Itens com aprovada acima da medida" })).toBeNull();
    expect(screen.getByRole("button", { name: "Revisar e aprovar" })).not.toBeDisabled();
    expect(aprovarMedicao).not.toHaveBeenCalled();
  });

  it("revisão sem item medido aprova com valor zero, como tudoComoMedido", async () => {
    aprovarMedicao.mockResolvedValue({ ok: true });
    const onAbertoChange = vi.fn();
    render(<AprovarDrawer aberto onAbertoChange={onAbertoChange} medicaoId={MEDICAO} revisaoRotulo="REV00" linhas={[]} />);
    expect(screen.getByText("Nenhum item medido nesta revisão; a medição é aprovada com valor zero")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Revisar e aprovar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Confirmar a aprovação da REV00" });
    expect(within(dialogo).getByText("Nenhum item medido nesta revisão; a medição é aprovada com valor zero")).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Aprovar REV00" }));
    await waitFor(() => expect(aprovarMedicao).toHaveBeenCalledWith({ id: MEDICAO, itens: [], tudoComoMedido: true }));
    await waitFor(() => expect(onAbertoChange).toHaveBeenCalledWith(false));
  });

  it("valor inválido fica no campo e não abre a confirmação", async () => {
    renderizar();
    fireEvent.change(campo("01.01"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Revisar e aprovar" }));
    expect(await screen.findByText(/Informe zero ou mais, até 4 casas/)).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Confirmar a aprovação da REV01" })).toBeNull();
    expect(aprovarMedicao).not.toHaveBeenCalled();
  });

  it("confirmar desabilita enquanto aprova; duplo clique manda um pedido só", async () => {
    let terminar: (v: unknown) => void = () => {};
    aprovarMedicao.mockReturnValue(new Promise((r) => (terminar = r)));
    renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Aprovar tudo como medido" }));
    fireEvent.click(screen.getByRole("button", { name: "Revisar e aprovar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Confirmar a aprovação da REV01" });
    const confirmar = within(dialogo).getByRole("button", { name: "Aprovar REV01" });
    fireEvent.click(confirmar);
    await waitFor(() => expect(confirmar).toBeDisabled());
    fireEvent.click(confirmar);
    expect(aprovarMedicao).toHaveBeenCalledTimes(1);
    terminar({ ok: true });
    await waitFor(() => expect(toastSucesso).toHaveBeenCalled());
  });

  it("recusa do banco aparece no toast e o drawer fica aberto", async () => {
    aprovarMedicao.mockResolvedValue({ erro: "A 2ª medição não tem revisão enviada para aprovar" });
    const { onAbertoChange } = renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Aprovar tudo como medido" }));
    fireEvent.click(screen.getByRole("button", { name: "Revisar e aprovar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Confirmar a aprovação da REV01" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Aprovar REV01" }));
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("A 2ª medição não tem revisão enviada para aprovar"));
    expect(onAbertoChange).not.toHaveBeenCalledWith(false);
  });
});
