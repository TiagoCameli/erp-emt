import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Tabela de Medições: número, período, selo de status, valor (texto do banco, D7) e a contagem de
 * lançamentos não excluídos. Clique na linha abre o detalhe da medição (Fase 5); o caminho para os
 * lançamentos passou a ser botão no detalhe.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/medicao/medicoes",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { MedicoesTabela } from "@/modules/medicao/medicoes/components/medicoes-tabela";
import type { MedicaoLista } from "@/modules/medicao/medicoes/tipos";

afterEach(() => {
  cleanup();
  push.mockClear();
});
afterEach(limparEstadosTabelaParaTeste);

function medicao(over: Partial<MedicaoLista> = {}): MedicaoLista {
  return {
    id: "m10",
    numero: 10,
    periodoInicio: "2026-09-01",
    periodoFim: "2026-09-30",
    status: "aprovada",
    valor: "125000.50",
    lancamentos: 7,
    ...over,
  };
}

function texto(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("MedicoesTabela", () => {
  it("mostra número, período, status, valor e lançamentos", () => {
    const { container } = render(
      <MedicoesTabela medicoes={[medicao()]} />,
    );
    expect(texto(container.querySelector('tbody [data-coluna="numero"]'))).toBe("10ª");
    expect(texto(container.querySelector('tbody [data-coluna="periodo"]'))).toBe("01/09 a 30/09/2026");
    expect(screen.getByText("Aprovada")).toBeTruthy();
    expect(texto(container.querySelector('tbody [data-coluna="valor"]'))).toBe("R$ 125.000,50");
    expect(texto(container.querySelector('tbody [data-coluna="lancamentos"]'))).toBe("7");
  });

  it("valor nulo (contrato sem regra de arredondamento): travessão, nunca R$ 0,00", () => {
    const { container } = render(
      <MedicoesTabela medicoes={[medicao({ valor: null })]} />,
    );
    expect(texto(container.querySelector('tbody [data-coluna="valor"]'))).toBe("—");
  });

  it("clique na linha abre o detalhe da medição", () => {
    render(<MedicoesTabela medicoes={[medicao({ id: "m10" })]} />);
    fireEvent.click(screen.getByText("Aprovada"));
    expect(push).toHaveBeenCalledWith("/medicao/medicoes/m10");
  });

  it("nenhuma medição: estado vazio", () => {
    render(<MedicoesTabela medicoes={[]} />);
    expect(screen.getByText("Nenhuma medição aberta")).toBeTruthy();
  });
});
