import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { FormDrawer } from "@/components/canonicos";

afterEach(cleanup);

/** O Esc chega no Radix pelo documento, não pelo elemento do drawer. */
function apertarEsc() {
  fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
}

/**
 * O guard de alterações não salvas é opt-in por prop, e é essa a razão destes
 * testes: sem `temAlteracoesNaoSalvas`, o drawer fecha calado e leva junto o
 * formulário preenchido. A linha de controle (drawer limpo) existe para provar
 * que o teste do drawer sujo não passaria de qualquer jeito.
 */
describe("FormDrawer, aviso de alterações não salvas", () => {
  it("CONTROLE: sem alteração, o Esc fecha direto e não pergunta nada", async () => {
    const aoTrocarAberto = vi.fn();

    render(
      <FormDrawer
        aberto
        onAbertoChange={aoTrocarAberto}
        titulo="Nova obra"
        temAlteracoesNaoSalvas={false}
      >
        <p>campos</p>
      </FormDrawer>,
    );

    apertarEsc();

    await waitFor(() => expect(aoTrocarAberto).toHaveBeenCalledWith(false));
    expect(
      screen.queryByText("Descartar as alterações?"),
    ).not.toBeInTheDocument();
  });

  it("com alteração, o Esc pergunta antes e NÃO fecha sozinho", async () => {
    const aoTrocarAberto = vi.fn();

    render(
      <FormDrawer
        aberto
        onAbertoChange={aoTrocarAberto}
        titulo="Nova obra"
        temAlteracoesNaoSalvas
      >
        <p>campos</p>
      </FormDrawer>,
    );

    apertarEsc();

    await screen.findByText("Descartar as alterações?");
    // O ponto do guard: o trabalho continua na tela até alguém decidir.
    expect(aoTrocarAberto).not.toHaveBeenCalledWith(false);
  });

  it("confirmar o descarte é o que fecha o drawer", async () => {
    const aoTrocarAberto = vi.fn();

    render(
      <FormDrawer
        aberto
        onAbertoChange={aoTrocarAberto}
        titulo="Nova obra"
        temAlteracoesNaoSalvas
      >
        <p>campos</p>
      </FormDrawer>,
    );

    apertarEsc();
    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));

    await waitFor(() => expect(aoTrocarAberto).toHaveBeenCalledWith(false));
  });
});
