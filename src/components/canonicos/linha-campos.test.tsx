import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { LinhaCampos } from "@/components/canonicos";

afterEach(cleanup);

describe("LinhaCampos", () => {
  it("usa 2 colunas por padrão no desktop", () => {
    const { container } = render(
      <LinhaCampos><span>a</span><span>b</span></LinhaCampos>,
    );
    expect(container.firstChild).toHaveClass("sm:grid-cols-2");
  });

  it("aceita 3 colunas", () => {
    const { container } = render(
      <LinhaCampos colunas={3}><span>a</span></LinhaCampos>,
    );
    expect(container.firstChild).toHaveClass("sm:grid-cols-3");
  });

  it("empilha no mobile", () => {
    const { container } = render(<LinhaCampos><span>a</span></LinhaCampos>);
    expect(container.firstChild).toHaveClass("grid-cols-1");
  });
});
