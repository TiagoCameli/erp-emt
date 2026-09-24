import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { RecursoDef } from "@/config/recursos";
import { TabNav } from "./tab-nav";

afterEach(cleanup);

const ABAS = [
  { id: "frete.painel", nome: "Painel", modulo: "frete", rota: "/frete", acoes: ["ver"] },
  { id: "frete.fretes", nome: "Fretes", modulo: "frete", rota: "/frete/fretes", acoes: ["ver"] },
  { id: "frete.pagamentos", nome: "Pagamentos de frete", modulo: "frete", rota: "/frete/pagamentos", acoes: ["ver"] },
] as unknown as RecursoDef[];

/** A aba da raiz do módulo ("/frete") não pode ficar acesa junto com a aba de verdade. */
describe("TabNav, aba ativa", () => {
  it("acende só a rota mais específica", () => {
    render(<TabNav recursos={ABAS} pathname="/frete/fretes/123" />);
    expect(screen.getByRole("link", { name: "Fretes" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Painel" })).not.toHaveAttribute("aria-current");
  });

  it("na raiz do módulo, acende o Painel", () => {
    render(<TabNav recursos={ABAS} pathname="/frete" />);
    expect(screen.getByRole("link", { name: "Painel" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Fretes" })).not.toHaveAttribute("aria-current");
  });
});
