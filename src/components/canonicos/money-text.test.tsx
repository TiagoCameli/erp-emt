import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { MoneyText } from "@/components/canonicos/money-text";
import { formatarBRL } from "@/lib/formatadores";

// Sem globals: true no vitest.config, o cleanup automático da RTL não roda.
afterEach(cleanup);

describe("MoneyText", () => {
  it("renderiza o valor formatado em BRL", () => {
    const { container } = render(<MoneyText valor={1234.56} />);
    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    expect(span?.textContent).toBe(formatarBRL(1234.56));
    expect(span?.textContent).toMatch(/^R\$\s1\.234,56$/u);
  });

  it("tem a classe tabular-nums e alinhamento à direita", () => {
    const { container } = render(<MoneyText valor={10} />);
    const span = container.querySelector("span");
    expect(span).toHaveClass("tabular-nums");
    expect(span).toHaveClass("text-right");
  });

  it("valor nulo ou indefinido vira R$ 0,00", () => {
    const nulo = render(<MoneyText valor={null} />);
    expect(nulo.container.textContent).toBe(formatarBRL(null));

    const indefinido = render(<MoneyText valor={undefined} />);
    expect(indefinido.container.textContent).toBe(formatarBRL(undefined));
  });

  it("aceita valor em string vindo do NUMERIC do banco", () => {
    const { container } = render(<MoneyText valor="9876.5" />);
    expect(container.textContent).toBe(formatarBRL("9876.5"));
    expect(container.textContent).toMatch(/9\.876,50/u);
  });
});
