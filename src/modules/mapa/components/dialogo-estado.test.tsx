import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * v1.28: a mudança de estado pede a data efetiva. Nasce com hoje, não passa de hoje e manda a
 * data escolhida; uma data passada avisa que os dias desde ela passam a contar com o estado novo.
 */

import { DialogoEstado } from "@/modules/mapa/components/dialogo-estado";
import type { EquipamentoMapa } from "@/modules/mapa/tipos";

afterEach(cleanup);

const equipamento = { id: "e1", codigo: "CB-005" } as unknown as EquipamentoMapa;

function renderizar() {
  const onConfirmar = vi.fn(async () => true);
  render(
    <DialogoEstado
      pedido={{ equipamento, estado: "parado" }}
      hoje="2026-10-17"
      onCancelar={vi.fn()}
      onConfirmar={onConfirmar}
    />,
  );
  return { onConfirmar };
}

describe("DialogoEstado", () => {
  it("nasce com a data de hoje, sem passar dela, e manda hoje", async () => {
    const { onConfirmar } = renderizar();
    const campo = screen.getByLabelText("Data efetiva") as HTMLInputElement;
    expect(campo.value).toBe("2026-10-17");
    expect(campo.max).toBe("2026-10-17");
    expect(screen.queryByText(/passam a contar/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Marcar como parado" }));
    await waitFor(() =>
      expect(onConfirmar).toHaveBeenCalledWith(
        expect.objectContaining({ data: "2026-10-17" }),
      ),
    );
  });

  it("data passada avisa e vai para a ação", async () => {
    const { onConfirmar } = renderizar();
    fireEvent.change(screen.getByLabelText("Data efetiva"), {
      target: { value: "2026-10-15" },
    });
    expect(screen.getByText(/passam a contar com este estado/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Marcar como parado" }));
    await waitFor(() =>
      expect(onConfirmar).toHaveBeenCalledWith(
        expect.objectContaining({ data: "2026-10-15" }),
      ),
    );
  });
});
