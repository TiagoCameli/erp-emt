import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import type { Creditos } from "@/modules/financeiro/relatorios/creditos";
import {
  ContratosEmprestimoTabela,
  CreditosPorMesTabela,
  CreditosTabela,
} from "@/modules/financeiro/relatorios/components/creditos-tabela";

// DataTable com idTabela: a preferência de colunas vem do servidor.
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

afterEach(cleanup);

/** Texto da célula do pé na coluna, com o espaço fixo do Intl virando espaço. */
function noPe(pe: HTMLElement, coluna: string): string {
  return (pe.querySelector(`[data-coluna="${coluna}"]`)?.textContent ?? "").replace(/\s/g, " ");
}

const CREDITOS: Creditos = {
  contratos: [
    {
      lancamentoId: "l1",
      numero: "LAN-1",
      credor: "Banco do Brasil",
      descricao: "Financiamento do caminhão",
      categoria: "Financiamentos",
      valorContratado: 120000,
      totalPago: 20000,
      saldoDevedor: 100000,
      parcelas: 12,
      parcelasPagas: 2,
      proximoVencimento: null,
    },
  ],
  proximosMeses: [{ mes: "2026-10-01", rotulo: "10/2026", valor: 10000, parcelas: 1 }],
  totalContratado: 120000,
  totalPago: 20000,
  totalSaldo: 100000,
  totalProximosMeses: 10000,
};

describe("CreditosTabela", () => {
  it("o credor leva ao lançamento e o total fica no pé, sob cada coluna", () => {
    render(<CreditosTabela creditos={CREDITOS} podeVerLancamentos />);
    expect(screen.getByRole("link", { name: "Banco do Brasil" }).getAttribute("href")).toBe(
      "/financeiro/lancamentos/l1",
    );
    expect(screen.getByText("2 de 12")).toBeTruthy();
    expect(screen.getByText("Quitado")).toBeTruthy();
    const pe = screen.getByText("Total").closest("tr")!;
    expect(noPe(pe, "valorContratado")).toBe("R$ 120.000,00");
    expect(noPe(pe, "saldoDevedor")).toBe("R$ 100.000,00");
  });

  it("sem permissão de lançamentos o credor não é link", () => {
    render(<CreditosTabela creditos={CREDITOS} podeVerLancamentos={false} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("columnheader", { name: /^Total das prestações/ })).toBeTruthy();
  });
});

describe("CreditosPorMesTabela", () => {
  it("mostra o rótulo do mês e o total no período", () => {
    render(<CreditosPorMesTabela meses={CREDITOS.proximosMeses} total={10000} />);
    expect(screen.getByText("10/2026")).toBeTruthy();
    const pe = screen.getByText("Total no período").closest("tr")!;
    expect(within(pe).getByText("R$ 10.000,00")).toBeTruthy();
  });
});

describe("ContratosEmprestimoTabela", () => {
  it("contrato com uma perna só fica com traço nos juros", () => {
    render(
      <ContratosEmprestimoTabela
        contratos={{
          contratos: [
            {
              centroCustoId: "cc1",
              contrato: "BB 123",
              tomado: 50000,
              pago: 0,
              aPagar: 0,
              jurosEmbutidos: null,
              parcelas: 0,
              parcelasPagas: 0,
              proximoVencimento: null,
            },
          ],
          totalTomado: 50000,
          totalPago: 0,
          totalAPagar: 0,
          totalJurosEmbutidos: 0,
        }}
      />,
    );
    expect(
      screen.getByTitle("Falta a entrada ou as prestações deste contrato no ERP").textContent,
    ).toBe("—");
    const pe = screen.getByText("Total").closest("tr")!;
    expect(noPe(pe, "tomado")).toBe("R$ 50.000,00");
  });
});
