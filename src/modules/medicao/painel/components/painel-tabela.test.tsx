import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Tabela do painel com 2 contratos. O rodapé é o `total` que a RPC devolveu, e ele NÃO é a soma
 * das linhas de propósito: a tela não pode "corrigir" o banco (D7).
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/medicao/painel",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { PainelTabela } from "@/modules/medicao/painel/components/painel-tabela";
import type { ContratoPainel, Painel } from "@/modules/medicao/painel/tipos";

afterEach(() => {
  cleanup();
  push.mockClear();
});
afterEach(limparEstadosTabelaParaTeste);

function contrato(over: Partial<ContratoPainel> = {}): ContratoPainel {
  return {
    id: "c1",
    codigo: "001/2026",
    nome_obra: "Obra Um",
    contratante_nome: "DER",
    contratante_tipo: "estadual",
    status: "ativo",
    versao_numero: 1,
    previsto: "1000.00",
    acumulado: "400.00",
    saldo: "600.00",
    pct_executado: "0.4000",
    reajuste_acumulado: "0",
    medicoes: 4,
    corrente: {
      numero: 4,
      status: "aprovada",
      periodo_inicio: "2026-04-01",
      periodo_fim: "2026-04-30",
      valor: "100.00",
    },
    ...over,
  };
}

function painel(contratos: ContratoPainel[], totalOver: Partial<Painel["total"]> = {}): Painel {
  return {
    contratos,
    // De propósito diferente da soma das linhas: prova que a tela mostra o total da RPC.
    total: { previsto: "999.00", acumulado: "999.00", saldo: "999.00", pct_executado: "0.9999", corrente: "999.00", reajuste_acumulado: "0", ...totalOver },
  };
}

/** Normaliza o espaço fino/inseparável que o Intl põe no dinheiro. */
function texto(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("PainelTabela", () => {
  it("uma linha por contrato: contrato, contratante, status e medição corrente", () => {
    const { container } = render(<PainelTabela painel={painel([contrato()])} podeAbrirBoletim />);
    expect(texto(container.querySelector('tbody [data-coluna="contrato"]'))).toContain("001/2026");
    expect(texto(container.querySelector('tbody [data-coluna="contrato"]'))).toContain("Obra Um");
    expect(texto(container.querySelector('tbody [data-coluna="contratante"]'))).toContain("DER");
    expect(texto(container.querySelector('tbody [data-coluna="contratante"]'))).toContain("Estadual");
    expect(screen.getByText("Ativo")).toBeTruthy();
    expect(texto(container.querySelector('tbody [data-coluna="previsto"]'))).toBe("R$ 1.000,00");
    expect(texto(container.querySelector('tbody [data-coluna="acumulado"]'))).toBe("R$ 400,00");
    expect(texto(container.querySelector('tbody [data-coluna="pct_executado"]'))).toMatch(/^40,00 ?%$/);
    expect(texto(container.querySelector('tbody [data-coluna="saldo"]'))).toBe("R$ 600,00");
    expect(texto(container.querySelector('tbody [data-coluna="corrente"]'))).toContain("4ª");
    expect(texto(container.querySelector('tbody [data-coluna="corrente"]'))).toContain("R$ 100,00");
    expect(screen.getByText("Aprovada")).toBeTruthy();
  });

  it("rodapé é o total consolidado da RPC, não a soma das linhas (D7)", () => {
    const dois = [
      contrato({ id: "c1", previsto: "1000.00", acumulado: "400.00" }),
      contrato({ id: "c2", codigo: "002/2026", nome_obra: "Obra Dois", previsto: "500.00", acumulado: "200.00" }),
    ];
    // Soma das linhas seria 1.500,00 / 600,00; o rodapé mostra o total da RPC (999,00), sem "corrigir".
    const { container } = render(<PainelTabela painel={painel(dois, { previsto: "999.00", acumulado: "999.00" })} podeAbrirBoletim />);
    const pe = container.querySelector("tfoot")!;
    expect(texto(pe.querySelector('[data-coluna="contrato"]'))).toBe("Total consolidado");
    expect(texto(pe.querySelector('[data-coluna="previsto"]'))).toBe("R$ 999,00");
    expect(texto(pe.querySelector('[data-coluna="acumulado"]'))).toBe("R$ 999,00");
  });

  it("reajuste acumulado: L09 -R$ 40.021,28, L10 R$ 0,00 e o rodapé do total da RPC", () => {
    const dois = [
      contrato({ id: "l09", codigo: "L09", nome_obra: "Lote 09", reajuste_acumulado: "-40021.28" }),
      contrato({ id: "l10", codigo: "L10", nome_obra: "Lote 10", reajuste_acumulado: "0" }),
    ];
    const { container } = render(<PainelTabela painel={painel(dois, { reajuste_acumulado: "-40021.28" })} podeAbrirBoletim />);
    expect(texto(container.querySelector('thead th[data-coluna="reajuste_acumulado"]'))).toBe("Reajuste acumulado");
    const celulas = [...container.querySelectorAll('tbody [data-coluna="reajuste_acumulado"]')].map((td) => texto(td));
    expect(celulas).toEqual(["-R$ 40.021,28", "R$ 0,00"]);
    expect(texto(container.querySelector('tfoot [data-coluna="reajuste_acumulado"]'))).toBe("-R$ 40.021,28");
  });

  it("reajuste de contrato sem regra de arredondamento fica em traço", () => {
    const c = contrato({ previsto: null, acumulado: null, saldo: null, pct_executado: null, reajuste_acumulado: null });
    const { container } = render(<PainelTabela painel={painel([c])} podeAbrirBoletim />);
    expect(texto(container.querySelector('tbody [data-coluna="reajuste_acumulado"]'))).toBe("—");
  });

  it("clique na linha navega para o boletim do contrato", () => {
    render(<PainelTabela painel={painel([contrato({ id: "abc" })])} podeAbrirBoletim />);
    fireEvent.click(screen.getByText("Obra Um"));
    expect(push).toHaveBeenCalledWith("/medicao/boletim?contrato=abc");
  });

  it("sem medicao.boletim/ver, a linha não é clicável (o boletim daria 404)", () => {
    const { container } = render(
      <PainelTabela painel={painel([contrato({ id: "abc" })])} podeAbrirBoletim={false} />,
    );
    fireEvent.click(screen.getByText("Obra Um"));
    expect(push).not.toHaveBeenCalled();
    expect(container.querySelector("tbody tr")?.getAttribute("tabindex")).toBeNull();
  });

  it("contrato sem regra de arredondamento: dinheiro em traço e nota no contrato", () => {
    const c = contrato({ previsto: null, acumulado: null, saldo: null, pct_executado: null });
    const { container } = render(<PainelTabela painel={painel([c])} podeAbrirBoletim />);
    expect(texto(container.querySelector('tbody [data-coluna="previsto"]'))).toBe("—");
    expect(texto(container.querySelector('tbody [data-coluna="acumulado"]'))).toBe("—");
    expect(texto(container.querySelector('tbody [data-coluna="saldo"]'))).toBe("—");
    expect(texto(container.querySelector('tbody [data-coluna="pct_executado"]'))).toBe("");
    expect(texto(container.querySelector('tbody [data-coluna="contrato"]'))).toContain("Sem regra de arredondamento");
  });

  it("contrato sem medição nenhuma", () => {
    const c = contrato({ corrente: null });
    render(<PainelTabela painel={painel([c])} podeAbrirBoletim />);
    expect(screen.getByText("Nenhuma medição")).toBeTruthy();
  });

  it("nenhum contrato: estado vazio, sem quebrar no rodapé", () => {
    render(<PainelTabela painel={painel([])} podeAbrirBoletim />);
    expect(screen.getByText("Nenhum contrato encontrado")).toBeTruthy();
  });
});
