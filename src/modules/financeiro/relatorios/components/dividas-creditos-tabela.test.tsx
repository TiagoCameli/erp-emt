import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import type { ConsorcioRelatorio, ContratoRelatorio } from "@/modules/financeiro/dividas/relatorio";
import {
  ConsorciosCreditosTabela,
  DividasContratosTabela,
} from "@/modules/financeiro/relatorios/components/dividas-creditos-tabela";

/**
 * A seção "Contratos" de Créditos: uma linha por contrato com saldo devedor de
 * principal, juros e CET; total somado em centavos; a seta abre as próximas
 * parcelas; sem cronograma, traço no CET.
 */

function contrato(parcial: Partial<ContratoRelatorio> = {}): ContratoRelatorio {
  return {
    contratoId: "c1",
    credor: "Banco do Brasil",
    numero: "123/2026",
    tipo: "emprestimo",
    status: "ativo",
    centroCustoId: "e1",
    centro: "BB 123",
    valorLiberado: 100000,
    dataLiberacao: "2026-01-15",
    taxaAm: 2,
    sistema: "price",
    temCronograma: true,
    principalPago: 7455.96,
    saldoDevedor: 92544.04,
    jurosPagos: 2000,
    jurosAPagar: 11471.52,
    proximas: [
      { numero: 2, vencimento: "2026-03-15", principal: 7605.08, juros: 1850.88, encargos: 0, total: 9455.96 },
      { numero: 3, vencimento: "2026-04-15", principal: 7757.18, juros: 1698.78, encargos: 0, total: 9455.96 },
    ],
    cet: { mensal: 0.02, anual: Math.pow(1.02, 12) - 1 },
    ...parcial,
  };
}

// A tabela é o DataTable canônico com idTabela: a preferência de colunas vem
// do servidor, que aqui não existe.
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

afterEach(cleanup);

describe("DividasContratosTabela", () => {
  it("mostra saldo devedor, juros e CET mensal e anual", () => {
    render(<DividasContratosTabela contratos={[contrato()]} podeVerDividas />);
    expect(screen.getByRole("link", { name: "Banco do Brasil" }).getAttribute("href")).toBe(
      "/financeiro/dividas/contratos/c1",
    );
    expect(screen.getByText("2% a.m. · 26,82% a.a.")).toBeTruthy();
    expect(screen.getAllByText("R$ 92.544,04").length).toBeGreaterThan(0);
    expect(screen.getByText("Ativo")).toBeTruthy();
  });

  it("a seta abre e fecha as próximas parcelas", () => {
    render(<DividasContratosTabela contratos={[contrato()]} podeVerDividas />);
    expect(screen.queryByText(/Próximas 2 parcelas/)).toBeNull();
    const seta = screen.getByRole("button", { name: "Expandir detalhes" });
    fireEvent.click(seta);
    expect(screen.getByText(/Próximas 2 parcelas/)).toBeTruthy();
    expect(screen.getByText("15/04/2026")).toBeTruthy();
    expect(seta.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(seta);
    expect(screen.queryByText(/Próximas 2 parcelas/)).toBeNull();
  });

  it("sem cronograma: traço no CET, aviso na linha e sem seta", () => {
    render(
      <DividasContratosTabela
        contratos={[contrato({ temCronograma: false, cet: null, proximas: [] })]}
        podeVerDividas={false}
      />,
    );
    expect(screen.getByText(/sem cronograma/)).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    // A barra do DataTable tem os próprios botões (Altura, Colunas): o que não
    // pode existir é a seta de abrir parcelas.
    expect(screen.queryByRole("button", { name: /Expandir detalhes/ })).toBeNull();
    // Sem a permissão de Dívidas o credor não é link.
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("só o contrato com parcela pela frente ganha a seta", () => {
    render(
      <DividasContratosTabela
        contratos={[contrato({ contratoId: "a" }), contrato({ contratoId: "b", proximas: [] })]}
        podeVerDividas
      />,
    );
    expect(screen.getAllByRole("button", { name: "Expandir detalhes" })).toHaveLength(1);
  });

  it("o total soma em centavos", () => {
    render(
      <DividasContratosTabela
        contratos={[
          contrato({ contratoId: "a", saldoDevedor: 0.1 }),
          contrato({ contratoId: "b", saldoDevedor: 0.2 }),
        ]}
        podeVerDividas
      />,
    );
    const total = screen.getByText("Total").closest("tr")!;
    expect(within(total).getByText("R$ 0,30")).toBeTruthy();
  });
});

describe("ConsorciosCreditosTabela", () => {
  const cota: ConsorcioRelatorio = {
    cotaId: "q1",
    administradora: "Porto Seguro",
    grupo: "1234",
    cota: "56",
    bem: "Caminhão",
    status: "contemplada",
    valorCredito: 300000,
    prazo: 72,
    parcelasPagas: 10,
    fundoComumPago: 41666.7,
    taxaPaga: 7500,
    aPagar: 306833.3,
    divida: 306833.3,
    contemplacaoData: "2026-09-10",
    contemplacaoForma: "sorteio",
    valorCarta: 300000,
    proximas: [],
  };

  it("mostra pagas de prazo, dívida e carta", () => {
    render(<ConsorciosCreditosTabela cotas={[cota]} podeVerDividas />);
    expect(screen.getByText("10 de 72")).toBeTruthy();
    expect(screen.getByText("Contemplada")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Porto Seguro" }).getAttribute("href")).toBe(
      "/financeiro/dividas/consorcios/q1",
    );
  });

  it("cota não contemplada fica com traço na carta", () => {
    render(
      <ConsorciosCreditosTabela
        cotas={[{ ...cota, status: "ativa", divida: 0, valorCarta: null, contemplacaoData: null }]}
        podeVerDividas
      />,
    );
    expect(screen.getByText("—")).toBeTruthy();
  });
});
