import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Tabela da aba Reajuste: uma linha por medição enviada ou aprovada, com o reajuste que vale (ou
 * nenhum). Dinheiro e diferença vêm do banco como texto (`mc_v_reajuste_medicao`): a tela só formata.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/medicao/reajuste",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { ReajustesTabela, colunasReajustes } from "@/modules/medicao/reajuste/components/reajustes-tabela";
import type { LinhaListaReajuste } from "@/modules/medicao/reajuste/tipos";

afterEach(() => {
  cleanup();
  push.mockClear();
  limparEstadosTabelaParaTeste();
});

const M4 = "11111111-1111-4111-8111-111111111111";

function linha(over: Partial<LinhaListaReajuste> = {}): LinhaListaReajuste {
  return {
    medicaoId: M4,
    contratoId: "c-l09",
    contratoCodigo: "L09",
    contratoNome: "BR-364 Lote 09",
    numero: 4,
    periodoInicio: "2026-02-01",
    periodoFim: "2026-02-28",
    status: "aprovada",
    relatorioId: "r1",
    sequencia: 2,
    origem: "siac",
    situacao: "definitivo",
    total: "-40021.28",
    diferenca: "2.99",
    relatorios: 2,
    ...over,
  };
}

function texto(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("ReajustesTabela", () => {
  it("contrato, medição e período, selo, reajuste, situação, diferença e nº de relatórios", () => {
    const { container } = render(<ReajustesTabela linhas={[linha()]} />);
    const celula = (id: string) => texto(container.querySelector(`tbody [data-coluna="${id}"]`));
    expect(celula("contrato")).toContain("L09");
    expect(celula("contrato")).toContain("BR-364 Lote 09");
    expect(celula("medicao")).toContain("4ª");
    expect(celula("medicao")).toContain("01/02 a 28/02/2026");
    expect(celula("status")).toBe("Aprovada");
    expect(celula("total")).toBe("-R$ 40.021,28");
    expect(celula("situacao")).toBe("Definitivo");
    expect(celula("diferenca")).toBe("R$ 2,99 a receber");
    expect(celula("relatorios")).toBe("2");
  });

  it("medição sem relatório: Sem relatório, sem dinheiro inventado", () => {
    const { container } = render(
      <ReajustesTabela
        linhas={[linha({ status: "enviada", relatorioId: null, sequencia: null, origem: null, situacao: null, total: null, diferenca: null, relatorios: 0 })]}
      />,
    );
    const celula = (id: string) => texto(container.querySelector(`tbody [data-coluna="${id}"]`));
    expect(celula("status")).toBe("Enviada");
    expect(celula("situacao")).toBe("Sem relatório");
    expect(celula("total")).not.toContain("R$");
    expect(celula("diferenca")).toBe("");
    expect(celula("relatorios")).toBe("0");
  });

  it("só o primeiro relatório: sem diferença na célula", () => {
    const { container } = render(<ReajustesTabela linhas={[linha({ diferenca: null, relatorios: 1, situacao: "provisorio" })]} />);
    expect(texto(container.querySelector('tbody [data-coluna="diferenca"]'))).toBe("");
    expect(texto(container.querySelector('tbody [data-coluna="situacao"]'))).toBe("Provisório");
  });

  it("clique na linha abre a medição", () => {
    render(<ReajustesTabela linhas={[linha()]} />);
    fireEvent.click(screen.getByText("BR-364 Lote 09"));
    expect(push).toHaveBeenCalledWith(`/medicao/medicoes/${M4}`);
  });

  it("sem medição enviada ou aprovada: estado vazio", () => {
    render(<ReajustesTabela linhas={[]} />);
    expect(screen.getByText("Nenhuma medição enviada ou aprovada")).toBeTruthy();
  });

  it("no celular: contrato no título, reajuste no valor, selo e situação em destaque", () => {
    const chave = (c: (typeof colunasReajustes)[number]) => c.id ?? ("accessorKey" in c ? String(c.accessorKey) : "");
    const meta = (id: string) => colunasReajustes.find((c) => chave(c) === id)?.meta?.celular;
    expect(meta("contrato")).toBe("titulo");
    expect(meta("total")).toBe("valor");
    expect(meta("status")).toBe("destaque");
    expect(meta("situacao")).toBe("destaque");
  });
});
