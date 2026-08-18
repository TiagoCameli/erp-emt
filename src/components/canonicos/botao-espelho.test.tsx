import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BotaoEspelho } from "@/components/canonicos/botao-espelho";

// Mocka o módulo do toast (não o "sonner" diretamente): mesmo padrão de
// lote-conta-bancaria.test.tsx. Sem isto o toast.error do teste de "acima do
// limite" chamaria o sonner de verdade dentro do jsdom.
const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock("@/components/canonicos/toast", () => ({ toast: toastMock }));

// Sem isto, o DOM de um teste vaza pro próximo. Mesmo padrão de
// barra-selecao.test.tsx.
afterEach(cleanup);

describe("BotaoEspelho", () => {
  it("mostra quantos vão para o papel", () => {
    render(<BotaoEspelho rota="/espelho/lancamentos" ids={["a", "b", "c"]} />);
    expect(
      screen.getByRole("button", { name: "Imprimir espelho (3)" }),
    ).toBeInTheDocument();
  });

  it("com um só, não mostra contagem: o (1) é ruído", () => {
    render(<BotaoEspelho rota="/espelho/lancamentos" ids={["a"]} />);
    expect(
      screen.getByRole("button", { name: "Imprimir espelho" }),
    ).toBeInTheDocument();
  });

  it("abre a rota do espelho em aba nova, com os ids na query", () => {
    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    render(<BotaoEspelho rota="/espelho/lancamentos" ids={["a", "b"]} />);
    fireEvent.click(screen.getByRole("button"));
    expect(abrir).toHaveBeenCalledWith(
      "/espelho/lancamentos?ids=a%2Cb",
      "_blank",
      "noopener,noreferrer",
    );
    vi.unstubAllGlobals();
  });

  it("aba nova preserva os filtros da listagem, então não navega a página atual", () => {
    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    render(<BotaoEspelho rota="/espelho/lancamentos" ids={["a"]} />);
    fireEvent.click(screen.getByRole("button"));
    expect(abrir).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("acima do limite avisa e não abre nada", () => {
    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    const muitos = Array.from({ length: 51 }, (_, i) => String(i));
    render(<BotaoEspelho rota="/espelho/lancamentos" ids={muitos} />);
    fireEvent.click(screen.getByRole("button"));
    // Barrar aqui evita abrir aba só para mostrar recusa.
    expect(abrir).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("sem id nenhum o botão fica desabilitado", () => {
    render(<BotaoEspelho rota="/espelho/lancamentos" ids={[]} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
