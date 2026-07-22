import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { CampoFormulario } from "@/components/canonicos";

afterEach(cleanup);

describe("CampoFormulario", () => {
  it("mostra o rótulo e associa ao controle pelo id", () => {
    render(
      <CampoFormulario id="nome" rotulo="Nome">
        <input id="nome" />
      </CampoFormulario>,
    );
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
  });

  it("marca obrigatório com asterisco", () => {
    render(
      <CampoFormulario id="nome" rotulo="Nome" obrigatorio>
        <input id="nome" />
      </CampoFormulario>,
    );
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("exibe erro e esconde a ajuda quando há erro", () => {
    render(
      <CampoFormulario id="nome" rotulo="Nome" ajuda="dica" erro="obrigatório">
        <input id="nome" />
      </CampoFormulario>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("obrigatório");
    expect(screen.queryByText("dica")).not.toBeInTheDocument();
  });
});
