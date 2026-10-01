import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * ConfirmDialog canônico: `minMotivo` exige um tamanho mínimo do motivo (padrão 1, o de sempre) e
 * `onConfirmar` que devolve `false` mantém o diálogo aberto com o motivo digitado (a ação recusou).
 */

import { ConfirmDialog } from "@/components/canonicos/confirm-dialog";

afterEach(cleanup);

function renderizar(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onAbertoChange = vi.fn();
  const onConfirmar = vi.fn();
  render(
    <ConfirmDialog
      aberto
      onAbertoChange={onAbertoChange}
      titulo="Confirmar"
      descricao="Descrição"
      textoConfirmar="Confirmar ação"
      exigeMotivo
      onConfirmar={onConfirmar}
      {...props}
    />,
  );
  return { onAbertoChange, onConfirmar };
}

describe("ConfirmDialog", () => {
  it("sem minMotivo, uma letra já libera o confirmar (padrão de sempre)", () => {
    renderizar();
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "a" } });
    expect(screen.getByRole("button", { name: "Confirmar ação" })).not.toBeDisabled();
  });

  it("com minMotivo 3, só libera com 3 letras sem contar os espaços das pontas", () => {
    renderizar({ minMotivo: 3 });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: " ab " } });
    expect(screen.getByRole("button", { name: "Confirmar ação" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "abc" } });
    expect(screen.getByRole("button", { name: "Confirmar ação" })).not.toBeDisabled();
  });

  it("onConfirmar que devolve false mantém aberto e o motivo fica", async () => {
    const onConfirmar = vi.fn(async () => false);
    const { onAbertoChange } = renderizar({ onConfirmar });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "motivo" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar ação" }));
    await waitFor(() => expect(onConfirmar).toHaveBeenCalledWith("motivo"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar ação" })).not.toBeDisabled());
    expect(onAbertoChange).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Motivo") as HTMLTextAreaElement).value).toBe("motivo");
  });

  it("onConfirmar que passa fecha e limpa", async () => {
    const { onAbertoChange, onConfirmar } = renderizar();
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "motivo" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar ação" }));
    await waitFor(() => expect(onAbertoChange).toHaveBeenCalledWith(false));
    expect(onConfirmar).toHaveBeenCalledWith("motivo");
  });
});
