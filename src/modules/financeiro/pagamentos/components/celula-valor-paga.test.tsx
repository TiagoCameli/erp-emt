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
    outrasDespesas: 0,
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
          outrasDespesas: 0,
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
          outrasDespesas: 0,
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
          outrasDespesas: 0,
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

  it("com desconto e juros: mostra ambos e líquido na ordem correta", () => {
    const { container } = render(
      <CelulaValorPaga
        parcela={parcela({
          valor: 1000,
          desconto: 50,
          juros: 20,
          outrasDespesas: 0,
          valorLiquido: 970,
        })}
      />,
    );

    // Mostra o valor principal.
    expect(within(container).getByText("R$ 1.000,00")).toBeInTheDocument();

    // Mostra a linha de ajustes com valores exatos: desconto X, juros Z, líquido Y
    expect(within(container).getByText("R$ 50,00")).toBeInTheDocument();
    expect(within(container).getByText("R$ 20,00")).toBeInTheDocument();
    expect(within(container).getByText("R$ 970,00")).toBeInTheDocument();

    // Verifica a ordem: desconto antes de juros, juros antes de líquido
    const ajustes = within(container).getByText(/desconto.*juros.*líquido/);
    expect(ajustes).toBeInTheDocument();
  });

  it("com outras despesas: entram na linha e no líquido", () => {
    const { container } = render(
      <CelulaValorPaga
        parcela={parcela({
          valor: 1000,
          desconto: 0,
          juros: 0,
          outrasDespesas: 35.4,
          // 1000 + 35,40. Escrito à mão, e não calculado no teste: se a
          // aritmética do líquido mudar, é este número que tem que ser
          // reescrito à mão também.
          valorLiquido: 1035.4,
        })}
      />,
    );

    expect(within(container).getByText("R$ 1.000,00")).toBeInTheDocument();
    expect(within(container).getByText(/despesas/)).toBeInTheDocument();
    expect(within(container).getByText("R$ 35,40")).toBeInTheDocument();
    expect(within(container).getByText("R$ 1.035,40")).toBeInTheDocument();
    // Tarifa não é juros: rotular como juros mandaria o contador para a conta
    // errada.
    expect(within(container).queryByText(/juros/)).not.toBeInTheDocument();
  });

  it("os três ajustes juntos saem na ordem desconto, juros, despesas, líquido", () => {
    const { container } = render(
      <CelulaValorPaga
        parcela={parcela({
          valor: 1000,
          desconto: 50,
          juros: 20,
          outrasDespesas: 5,
          // 1000 - 50 + 20 + 5.
          valorLiquido: 975,
        })}
      />,
    );

    const ajustes = within(container).getByText(
      /desconto.*juros.*despesas.*líquido/,
    );
    expect(ajustes).toBeInTheDocument();
    expect(within(container).getByText("R$ 975,00")).toBeInTheDocument();
  });
});
