import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { CelulaValorPaga } from "@/modules/financeiro/pagamentos/components/pagamentos-cliente";
import type { ParcelaPaga } from "@/modules/financeiro/pagamentos/queries";

function parcela(
  override: Partial<ParcelaPaga> = {},
): ParcelaPaga {
  return {
    id: "parcela-1",
    lancamentoNumero: "LAN-2026-0001",
    numeroParcela: 1,
    descricao: "Teste",
    categoriaNome: "Teste",
    fornecedorNome: "Fornecedor",
    contaNome: "Conta",
    dataPagamento: "2026-08-18",
    valor: 1000,
    desconto: 0,
    juros: 0,
    valorLiquido: 1000,
    ...override,
  };
}

describe("CelulaValorPaga", () => {
  it("sem desconto nem juros: mostra só o valor", () => {
    const { container } = render(
      <CelulaValorPaga
        parcela={parcela({
          valor: 1000,
          desconto: 0,
          juros: 0,
          valorLiquido: 1000,
        })}
      />,
    );

    expect(within(container).getByText("R$ 1.000,00")).toBeInTheDocument();
    expect(within(container).queryByText(/desconto|juros|líquido/)).not.toBeInTheDocument();
  });

  it("com desconto, sem juros: mostra desconto e líquido", () => {
    const { container } = render(
      <CelulaValorPaga
        parcela={parcela({
          valor: 1000,
          desconto: 50,
          juros: 0,
          valorLiquido: 950,
        })}
      />,
    );

    // Mostra o valor principal.
    expect(within(container).getByText("R$ 1.000,00")).toBeInTheDocument();

    // Mostra a linha de ajustes com desconto e líquido.
    expect(within(container).getByText(/desconto/)).toBeInTheDocument();
    expect(within(container).getByText("R$ 50,00")).toBeInTheDocument();
    expect(within(container).getByText(/líquido/)).toBeInTheDocument();
    expect(within(container).getByText("R$ 950,00")).toBeInTheDocument();

    // Não mostra juros.
    expect(within(container).queryByText(/juros/)).not.toBeInTheDocument();
  });

  it("com juros, sem desconto: mostra juros e líquido", () => {
    const { container } = render(
      <CelulaValorPaga
        parcela={parcela({
          valor: 1000,
          desconto: 0,
          juros: 20,
          valorLiquido: 1020,
        })}
      />,
    );

    // Mostra o valor principal.
    expect(within(container).getByText("R$ 1.000,00")).toBeInTheDocument();

    // Mostra a linha de ajustes com juros e líquido.
    expect(within(container).getByText(/juros/)).toBeInTheDocument();
    expect(within(container).getByText("R$ 20,00")).toBeInTheDocument();
    expect(within(container).getByText(/líquido/)).toBeInTheDocument();
    expect(within(container).getByText("R$ 1.020,00")).toBeInTheDocument();

    // Não mostra desconto.
    expect(within(container).queryByText(/desconto/)).not.toBeInTheDocument();
  });

  it("com desconto e juros: mostra ambos e líquido", () => {
    const { container } = render(
      <CelulaValorPaga
        parcela={parcela({
          valor: 1000,
          desconto: 50,
          juros: 20,
          valorLiquido: 970,
        })}
      />,
    );

    // Mostra o valor principal.
    expect(within(container).getByText("R$ 1.000,00")).toBeInTheDocument();

    // Mostra a linha de ajustes com desconto, juros e líquido.
    expect(within(container).getByText(/desconto/)).toBeInTheDocument();
    expect(within(container).getByText(/juros/)).toBeInTheDocument();
    expect(within(container).getByText(/líquido/)).toBeInTheDocument();

    // Mostra todos os valores.
    const valores = within(container).getAllByText(/R\$/);
    expect(valores).toHaveLength(4); // valor, desconto, juros, líquido
  });
});
