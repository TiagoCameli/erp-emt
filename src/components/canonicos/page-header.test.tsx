import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { PageHeader } from "@/components/canonicos";

afterEach(cleanup);

describe("PageHeader", () => {
  it("mostra a sobrancelha do módulo quando recebe modulo", () => {
    render(<PageHeader titulo="Lançamentos" modulo="Financeiro" />);
    expect(screen.getByText("Financeiro")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Lançamentos" }),
    ).toBeInTheDocument();
  });

  it("não mostra sobrancelha sem modulo", () => {
    render(<PageHeader titulo="Lançamentos" descricao="Contas a pagar" />);
    expect(screen.queryByText("Financeiro")).not.toBeInTheDocument();
    expect(screen.getByText("Contas a pagar")).toBeInTheDocument();
  });

  it("mantém o módulo fora do título para não sujar o heading", () => {
    render(<PageHeader titulo="Alertas" modulo="RH" />);
    expect(screen.getByRole("heading", { name: "Alertas" })).toBeInTheDocument();
  });
});
