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

import { AlertasTabela } from "./alertas-tabela";

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

  it("sem alertas, mostra o estado vazio", () => {
    render(<AlertasTabela alertas={[]} />);
    expect(screen.getByText("Nenhum alerta")).toBeTruthy();
  });
});
