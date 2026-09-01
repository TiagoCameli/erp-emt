import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { CelulaValorPaga } from "@/modules/financeiro/pagamentos/components/pagamentos-cliente";
import type { ParcelaPaga } from "@/modules/financeiro/pagamentos/queries";

function parcela(override: Partial<ParcelaPaga> = {}): ParcelaPaga {
  return {
    id: "parcela-1",
    lancamentoNumero: "LAN-2026-0001",
    numeroParcela: 1,
    descricao: "Teste",
    categoriaNome: "Teste",
    centroCustoRotulo: "BR-364 Lote 9",
    fornecedorNome: "Fornecedor",
    contaNome: "Conta",
    dataPagamento: "2026-08-18",
    valor: 1000,
    desconto: 0,
    juros: 0,
    outrasDespesas: 0,
    valorLiquido: 1000,
    // Sem filtro de centro: a coluna mostra o valor do pagamento.
    valorRecorte: null,
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
    expect(
      within(container).queryByText(/desconto|juros|líquido/),
    ).not.toBeInTheDocument();
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

  it("com filtro de centro, mostra a FATIA e não o valor do pagamento", () => {
    // A "COMPRA DE 3 CARRETAS" de R$ 100.000,00 entra com um terço na carreta
    // filtrada. Mostrar os R$ 100.000,00 aqui é o que fazia o total das quatro
    // carretas passar do total do centro pai.
    const { container } = render(
      <CelulaValorPaga
        parcela={parcela({
          valor: 100000,
          valorLiquido: 100000,
          valorRecorte: 33333.34,
        })}
      />,
    );
    expect(within(container).getByText("R$ 33.333,34")).toBeInTheDocument();
    expect(
      within(container).queryByText("R$ 100.000,00"),
    ).not.toBeInTheDocument();
  });

  it("REGRESSÃO: campo de fatia ausente não vira R$ 0,00", () => {
    /*
     * `valorRecorte` ausente (undefined) é "não há filtro de centro", e tem que
     * mostrar o valor pago. Com a guarda escrita como `!== null`, undefined caía
     * no caminho da fatia e a coluna imprimia R$ 0,00 no lugar do dinheiro --
     * silencioso, plausível e errado. Foi o que aconteceu em 01/09/2026.
     */
    const semCampo = parcela({ valor: 4989.62, valorLiquido: 4989.62 });
    delete (semCampo as { valorRecorte?: number | null }).valorRecorte;

    const { container } = render(<CelulaValorPaga parcela={semCampo} />);
    expect(within(container).getByText("R$ 4.989,62")).toBeInTheDocument();
    expect(within(container).queryByText("R$ 0,00")).not.toBeInTheDocument();
  });
});
