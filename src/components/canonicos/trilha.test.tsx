import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { EVENTOS_TRILHA_RECOLHIDA, Trilha, type EventoTrilha } from "@/components/canonicos/trilha";

afterEach(() => cleanup());

function eventos(qtd: number): EventoTrilha[] {
  return Array.from({ length: qtd }, (_, i) => ({
    id: String(i),
    data: `2026-10-0${i + 1}T12:00:00Z`,
    titulo: `Evento ${i + 1}`,
    tipo: "edicao" as const,
  }));
}

/**
 * Trilha longa nasce recolhida: só os eventos mais recentes, com um botão para
 * ver o resto e outro para voltar. Trilha curta não ganha botão nenhum.
 */
describe("Trilha", () => {
  it("trilha curta mostra tudo e não tem botão", () => {
    render(<Trilha eventos={eventos(EVENTOS_TRILHA_RECOLHIDA)} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(EVENTOS_TRILHA_RECOLHIDA);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("trilha longa nasce recolhida com os mais recentes, expande e recolhe", () => {
    render(<Trilha eventos={eventos(6)} />);
    const itens = screen.getAllByRole("listitem");
    expect(itens).toHaveLength(EVENTOS_TRILHA_RECOLHIDA);
    expect(itens[0].textContent).toContain("Evento 6");
    expect(screen.queryByText("Evento 1")).toBeNull();

    const botao = screen.getByRole("button", { name: /ver trilha completa \(6 eventos\)/i });
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(botao);
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByText("Evento 1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /recolher trilha/i }));
    expect(screen.getAllByRole("listitem")).toHaveLength(EVENTOS_TRILHA_RECOLHIDA);
  });
});
