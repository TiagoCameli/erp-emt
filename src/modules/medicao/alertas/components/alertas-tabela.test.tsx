import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/medicao/alertas",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import type { AlertaLinha } from "@/modules/medicao/alertas/tipos";

import { AlertasTabela, colunasAlertas } from "./alertas-tabela";

afterEach(() => {
  cleanup();
  limparEstadosTabelaParaTeste();
});

function alerta(over: Partial<AlertaLinha> = {}): AlertaLinha {
  return {
    chave: "c1:valor_contrato_diferente::0",
    contratoId: "c1",
    codigo: "L10",
    tipo: "valor_contrato_diferente",
    gravidade: "baixa",
    itemCodigo: null,
    unidade: null,
    valor: "121590621.00",
    referencia: "121573053.78",
    data: null,
    comMotivo: false,
    ...over,
  };
}

describe("AlertasTabela", () => {
  it("mostra contrato, selo de gravidade, tipo e a frase", () => {
    render(<AlertasTabela alertas={[alerta()]} />);
    expect(screen.getByText("L10")).toBeTruthy();
    expect(screen.getByText("Baixa")).toBeTruthy();
    expect(screen.getByText("Valor do contrato diferente da planilha")).toBeTruthy();
    expect(screen.getByText(/diferença R\$ 17\.567,22/)).toBeTruthy();
  });

  it("os dois alertas do reajuste: tipo e frase", () => {
    render(
      <AlertasTabela
        alertas={[
          alerta({ chave: "a", codigo: "L09", tipo: "medicao_sem_reajuste", gravidade: "media", valor: "3", referencia: "2026-01-01", data: "2026-01-01" }),
          alerta({ chave: "b", codigo: "K9", tipo: "reajuste_provisorio", gravidade: "baixa", valor: "1", referencia: "1234.56", data: "2026-01-01" }),
        ]}
      />,
    );
    expect(screen.getByText("Medição aprovada sem reajuste")).toBeTruthy();
    expect(screen.getByText("3ª medição (início 01/01/2026) aprovada sem reajuste; aniversário da data-base em 01/01/2026")).toBeTruthy();
    expect(screen.getByText("Reajuste provisório")).toBeTruthy();
    expect(screen.getByText("O reajuste da 1ª medição está com índices provisórios: R$ 1.234,56")).toBeTruthy();
  });

  it("sem alertas, mostra o estado vazio", () => {
    render(<AlertasTabela alertas={[]} />);
    expect(screen.getByText("Nenhum alerta")).toBeTruthy();
  });
});

describe("ordenação da coluna de gravidade", () => {
  it("ordena por severidade (alta, média, baixa), não em ordem alfabética", () => {
    const col = colunasAlertas.find((c) => c.id === "gravidade");
    const rank = (g: string) => (col as unknown as { accessorFn: (a: AlertaLinha) => number }).accessorFn(alerta({ gravidade: g }));
    expect(rank("alta")).toBeLessThan(rank("media"));
    expect(rank("media")).toBeLessThan(rank("baixa"));
  });
});
