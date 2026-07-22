import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SecaoFormulario } from "@/components/canonicos";

afterEach(cleanup);

describe("SecaoFormulario", () => {
  it("mostra o título e o conteúdo", () => {
    render(
      <SecaoFormulario titulo="Itens">
        <p>conteúdo</p>
      </SecaoFormulario>,
    );
    expect(screen.getByRole("heading", { name: "Itens" })).toBeInTheDocument();
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
  });

  it("renderiza a ação quando passada", () => {
    render(
      <SecaoFormulario titulo="Itens" acao={<button>Adicionar</button>}>
        <p>x</p>
      </SecaoFormulario>,
    );
    expect(screen.getByRole("button", { name: "Adicionar" })).toBeInTheDocument();
  });
});
