import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BarraSelecao } from "@/components/canonicos/barra-selecao";

// Sem isso, o DOM de um teste vaza pro próximo (nada aqui limpa sozinho) e um
// "getByRole" que devia achar um só elemento acha dois, quebrando teste que
// não tem nada de errado. Mesmo padrão de combobox.test.tsx e afins.
afterEach(cleanup);

describe("BarraSelecao", () => {
  it("com zero selecionado não aparece, porque barra vazia é ruído", () => {
    const { container } = render(
      <BarraSelecao quantidade={0} onLimpar={() => {}}>
        <button type="button">Ação</button>
      </BarraSelecao>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("concorda o singular com o plural", () => {
    const { rerender } = render(
      <BarraSelecao quantidade={1} onLimpar={() => {}}>
        <button type="button">Ação</button>
      </BarraSelecao>,
    );
    expect(screen.getByText("1 selecionado")).toBeInTheDocument();

    rerender(
      <BarraSelecao quantidade={3} onLimpar={() => {}}>
        <button type="button">Ação</button>
      </BarraSelecao>,
    );
    expect(screen.getByText("3 selecionados")).toBeInTheDocument();
  });

  it("mostra as ações que recebe", () => {
    render(
      <BarraSelecao quantidade={2} onLimpar={() => {}}>
        <button type="button">Imprimir espelho</button>
      </BarraSelecao>,
    );
    expect(
      screen.getByRole("button", { name: "Imprimir espelho" }),
    ).toBeInTheDocument();
  });

  it("mostra o resumo quando ele vem", () => {
    render(
      <BarraSelecao quantidade={2} onLimpar={() => {}} resumo="R$ 1.000,00">
        <button type="button">Ação</button>
      </BarraSelecao>,
    );
    expect(screen.getByText("R$ 1.000,00")).toBeInTheDocument();
  });

  it("limpar seleção chama quem cuida disso", async () => {
    const onLimpar = vi.fn();
    render(
      <BarraSelecao quantidade={2} onLimpar={onLimpar}>
        <button type="button">Ação</button>
      </BarraSelecao>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Limpar seleção" }),
    );
    expect(onLimpar).toHaveBeenCalledOnce();
  });
});
