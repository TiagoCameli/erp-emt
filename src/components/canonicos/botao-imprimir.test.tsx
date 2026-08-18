import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BotaoImprimir } from "@/components/canonicos/botao-imprimir";

/**
 * Espera dois quadros de animação: os mesmos dois que o componente agenda
 * antes de chamar `window.print()` (ver comentário em `botao-imprimir.tsx`).
 */
function esperarDoisQuadros() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

describe("BotaoImprimir", () => {
  let imprimir: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    imprimir = vi.fn();
    vi.stubGlobal("print", imprimir);
  });

  afterEach(() => {
    // Sem cleanup automático nesta configuração (vitest sem `globals: true`):
    // cada render ficaria no DOM e "Imprimir" viraria ambíguo entre testes.
    cleanup();
    vi.unstubAllGlobals();
  });

  it("dispara a impressão automática exatamente uma vez, mesmo sob StrictMode", async () => {
    // O StrictMode (sempre ligado em dev no App Router) roda montagem ->
    // desmontagem -> montagem antes de qualquer quadro de animação passar.
    // Foi esse ciclo que expôs o bug: uma ref "já disparou" travava o segundo
    // efeito, que é o único que sobrevive, e window.print() nunca saía.
    render(
      <React.StrictMode>
        <BotaoImprimir />
      </React.StrictMode>,
    );

    await act(async () => {
      await esperarDoisQuadros();
    });

    expect(imprimir).toHaveBeenCalledTimes(1);
  });

  it("com auto={false} não dispara sozinho", async () => {
    render(
      <React.StrictMode>
        <BotaoImprimir auto={false} />
      </React.StrictMode>,
    );

    await act(async () => {
      await esperarDoisQuadros();
    });

    expect(imprimir).not.toHaveBeenCalled();
  });

  it("clicar no botão imprime", () => {
    render(<BotaoImprimir auto={false} />);

    fireEvent.click(screen.getByRole("button", { name: /imprimir/i }));

    expect(imprimir).toHaveBeenCalledTimes(1);
  });
});
