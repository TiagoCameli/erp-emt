import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/** O formulário do pedido como o PedidoMaterialForm da origem: itens, subtotal e total. */

const salvarPedido = vi.fn();
const toastErro = vi.fn();

vi.mock("@/modules/frete/pedidos-material/actions", () => ({
  salvarPedido: (...args: unknown[]) => salvarPedido(...args),
}));
vi.mock("@/modules/_shared/anexos/actions", () => ({ anexosDoDocumento: vi.fn(async () => []) }));
vi.mock("@/components/canonicos/toast", () => ({
  toast: { error: (...a: unknown[]) => toastErro(...a), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/components/canonicos", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/canonicos")>();
  return {
    ...original,
    Combobox: ({
      id,
      valor,
      onValorChange,
      opcoes,
      ariaLabel,
    }: {
      id?: string;
      valor: string;
      onValorChange: (v: string) => void;
      opcoes: { valor: string; rotulo: string }[];
      ariaLabel?: string;
    }) => (
      <select id={id} aria-label={ariaLabel} value={valor} onChange={(e) => onValorChange(e.target.value)}>
        <option value="">-</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    ),
  };
});

import { PedidoFormDrawer } from "@/modules/frete/pedidos-material/components/pedido-form-drawer";

const FORN = "44444444-4444-4444-8444-444444444444";
const BRITA = "22222222-2222-4222-8222-222222222222";

function renderizar() {
  render(
    <PedidoFormDrawer
      aberto
      onAbertoChange={() => {}}
      pedido={null}
      fornecedores={[{ id: FORN, nome: "Britam", nomes: ["Britam"] }]}
      insumos={[{ id: BRITA, nome: "Brita 1", unidade: "t" }]}
    />,
  );
}

beforeEach(() => {
  salvarPedido.mockReset();
  toastErro.mockReset();
});
afterEach(cleanup);

describe("PedidoFormDrawer", () => {
  it("começa com um item, sem remover; mostra a unidade, o subtotal e o total", () => {
    renderizar();
    expect(screen.queryByLabelText(/Remover item/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Material do item 1"), { target: { value: BRITA } });
    expect(screen.getByText("t")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Quantidade do item 1"), { target: { value: "12,5" } });
    fireEvent.change(screen.getByLabelText("Valor unitário do item 1"), { target: { value: "80,1234" } });
    expect(screen.getByTestId("subtotal-0").textContent).toMatch(/1\.001,5425/);
    expect(screen.getByTestId("total-pedido").textContent).toMatch(/1\.001,54/);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar material/ }));
    expect(screen.getAllByLabelText(/Remover item/)).toHaveLength(2);
  });

  it("item incompleto não chega à action", async () => {
    renderizar();
    fireEvent.change(screen.getByLabelText(/Data do pedido/), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText(/Fornecedor/), { target: { value: FORN } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar pedido" }));
    await waitFor(() => expect(toastErro).toHaveBeenCalled());
    expect(salvarPedido).not.toHaveBeenCalled();
  });

  it("salva data, fornecedor e itens com quantidade de até 6 casas", async () => {
    salvarPedido.mockResolvedValue({ ok: true, id: "x" });
    renderizar();
    fireEvent.change(screen.getByLabelText(/Data do pedido/), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText(/Fornecedor/), { target: { value: FORN } });
    fireEvent.change(screen.getByLabelText("Material do item 1"), { target: { value: BRITA } });
    fireEvent.change(screen.getByLabelText("Quantidade do item 1"), { target: { value: "12,345678" } });
    fireEvent.change(screen.getByLabelText("Valor unitário do item 1"), { target: { value: "85,1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar pedido" }));
    await waitFor(() => expect(salvarPedido).toHaveBeenCalled());
    expect(salvarPedido).toHaveBeenCalledWith(null, {
      data: "2026-09-01",
      fornecedorId: FORN,
      observacoes: null,
      itens: [{ insumoId: BRITA, quantidade: 12.345678, valorUnitario: 85.1234 }],
    });
  });
});
