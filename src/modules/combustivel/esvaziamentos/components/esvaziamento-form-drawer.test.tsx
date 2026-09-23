import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * O EsvaziarTanqueModal da origem: os litros são o nível atual (só para
 * conferir, não se digitam), não há data, e o motivo pede 3 caracteres.
 */

vi.mock("@/components/canonicos", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/canonicos")>();
  return {
    ...real,
    Combobox: (props: {
      id?: string;
      valor: string;
      onValorChange: (valor: string) => void;
      opcoes: { valor: string; rotulo: string }[];
    }) => (
      <select id={props.id} value={props.valor} onChange={(evento) => props.onValorChange(evento.target.value)}>
        <option value="">Selecione</option>
        {props.opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </option>
        ))}
      </select>
    ),
  };
});

vi.mock("@/components/canonicos/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/modules/combustivel/esvaziamentos/actions", () => ({
  registrarEsvaziamento: vi.fn(async () => ({ ok: true })),
}));

import { registrarEsvaziamento } from "@/modules/combustivel/esvaziamentos/actions";
import { EsvaziamentoFormDrawer } from "@/modules/combustivel/esvaziamentos/components/esvaziamento-form-drawer";

const TANQUE = "11111111-1111-4111-8111-111111111111";
const TANQUES = [{ id: TANQUE, nome: "Tanque Base", nivel: 155.6, combustivelNome: "Diesel S10" }];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EsvaziamentoFormDrawer", () => {
  it("mostra o nível atual como os litros descartados, sem campo de data", () => {
    render(<EsvaziamentoFormDrawer aberto onAbertoChange={vi.fn()} tanques={TANQUES} tanqueInicialId={TANQUE} />);
    const litros = screen.getByLabelText(/Litros descartados/) as HTMLInputElement;
    expect(litros.value).toBe("155,60 L");
    expect(litros.readOnly).toBe(true);
    expect(screen.queryByLabelText(/Data/)).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Registra o descarte de 155,60 L de Diesel S10 do tanque Tanque Base");
  });

  it("escolher o tanque mostra o nível dele", () => {
    render(<EsvaziamentoFormDrawer aberto onAbertoChange={vi.fn()} tanques={TANQUES} />);
    expect((screen.getByLabelText(/Litros descartados/) as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText(/^Tanque/), { target: { value: TANQUE } });
    expect((screen.getByLabelText(/Litros descartados/) as HTMLInputElement).value).toBe("155,60 L");
  });

  it("motivo com menos de 3 caracteres não envia; com 3, envia só tanque e motivo", async () => {
    render(<EsvaziamentoFormDrawer aberto onAbertoChange={vi.fn()} tanques={TANQUES} tanqueInicialId={TANQUE} />);
    const motivo = screen.getByLabelText(/Motivo/);
    const botao = screen.getByRole("button", { name: "Esvaziar tanque" });

    fireEvent.change(motivo, { target: { value: " ab " } });
    fireEvent.click(botao);
    expect(await screen.findByText("Informe um motivo com pelo menos 3 caracteres")).toBeInTheDocument();
    expect(registrarEsvaziamento).not.toHaveBeenCalled();

    fireEvent.change(motivo, { target: { value: " abc " } });
    fireEvent.click(botao);
    await waitFor(() => expect(registrarEsvaziamento).toHaveBeenCalledWith({ tanqueId: TANQUE, motivo: "abc" }));
  });
});
