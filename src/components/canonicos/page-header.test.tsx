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

describe("PageHeader em tela de detalhe", () => {
  it("CONTROLE: sem voltarPara não existe botão de voltar", () => {
    render(<PageHeader titulo="Lançamentos" modulo="Financeiro" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("o voltar é um link de verdade, para abrir a lista em outra aba", () => {
    render(
      <PageHeader
        titulo="OC-2026-0001"
        modulo="Compras"
        voltarPara={{ rota: "/compras/ordens", rotulo: "Voltar para as ordens" }}
      />,
    );
    const voltar = screen.getByRole("link", { name: "Voltar para as ordens" });
    expect(voltar).toHaveAttribute("href", "/compras/ordens");
  });

  it("o rotulo do voltar vira nome acessível, já que o botão é só de ícone", () => {
    render(
      <PageHeader
        titulo="OC-2026-0001"
        voltarPara={{ rota: "/compras/ordens", rotulo: "Voltar para as ordens" }}
      />,
    );
    // Sem o aria-label o leitor de tela anunciaria só "link".
    expect(
      screen.getByRole("link", { name: "Voltar para as ordens" }),
    ).toBeInTheDocument();
  });

  it("os selos ficam fora do heading, para o título continuar sendo o título", () => {
    render(
      <PageHeader
        titulo="OC-2026-0001"
        selos={<span>Aprovada</span>}
        voltarPara={{ rota: "/compras/ordens", rotulo: "Voltar" }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "OC-2026-0001" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Aprovada")).toBeInTheDocument();
  });

  it("tituloMono marca o título como código de documento", () => {
    render(<PageHeader titulo="OC-2026-0001" tituloMono />);
    expect(screen.getByRole("heading", { name: "OC-2026-0001" })).toHaveClass(
      "codigo-doc",
    );
  });

  it("CONTROLE: sem tituloMono o título não leva a classe de código", () => {
    render(<PageHeader titulo="Ordens de compra" />);
    expect(
      screen.getByRole("heading", { name: "Ordens de compra" }),
    ).not.toHaveClass("codigo-doc");
  });
});
