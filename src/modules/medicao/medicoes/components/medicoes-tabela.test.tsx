import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Tabela de Medições: número, período, selo de status, valor (texto do banco, D7) e a contagem de
 * lançamentos não excluídos. Clique na linha só navega para os lançamentos de quem tem
 * `medicao.lancamentos/ver` (senão a tela de lançamentos daria 404).
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
      <MedicoesTabela medicoes={[medicao()]} contratoId="c1" podeVerLancamentos />,
    );
    expect(texto(container.querySelector('tbody [data-coluna="numero"]'))).toBe("10ª");
    expect(texto(container.querySelector('tbody [data-coluna="periodo"]'))).toBe("01/09 a 30/09/2026");
    expect(screen.getByText("Aprovada")).toBeTruthy();
    expect(texto(container.querySelector('tbody [data-coluna="valor"]'))).toBe("R$ 125.000,50");
    expect(texto(container.querySelector('tbody [data-coluna="lancamentos"]'))).toBe("7");
  });

  it("valor nulo (contrato sem regra de arredondamento): travessão, nunca R$ 0,00", () => {
    const { container } = render(
      <MedicoesTabela medicoes={[medicao({ valor: null })]} contratoId="c1" podeVerLancamentos />,
    );
    expect(texto(container.querySelector('tbody [data-coluna="valor"]'))).toBe("—");
  });

  it("clique na linha navega para os lançamentos da medição, com o número (não o id)", () => {
    render(<MedicoesTabela medicoes={[medicao({ numero: 10 })]} contratoId="c1" podeVerLancamentos />);
    fireEvent.click(screen.getByText("Aprovada"));
    expect(push).toHaveBeenCalledWith("/medicao/lancamentos?contrato=c1&medicao=10");
  });

  it("sem medicao.lancamentos/ver, a linha não é clicável", () => {
    const { container } = render(
      <MedicoesTabela medicoes={[medicao()]} contratoId="c1" podeVerLancamentos={false} />,
    );
    fireEvent.click(screen.getByText("Aprovada"));
    expect(push).not.toHaveBeenCalled();
    expect(container.querySelector("tbody tr")?.getAttribute("tabindex")).toBeNull();
  });

  it("nenhuma medição: estado vazio", () => {
    render(<MedicoesTabela medicoes={[]} contratoId="c1" podeVerLancamentos />);
    expect(screen.getByText("Nenhuma medição aberta")).toBeTruthy();
  });
});
