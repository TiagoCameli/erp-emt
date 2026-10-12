import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";

import { CustoCcTabela } from "@/modules/financeiro/relatorios/components/custo-cc-tabela";
import { ID_NAO_RATEADO } from "@/modules/financeiro/relatorios/indireto-nos-relatorios";

// O DataTable com `idTabela` lê e grava a preferência do usuário por Server
// Action e usa o router; no teste, os dois ficam no lugar.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/financeiro/relatorios",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

afterEach(() => {
  cleanup();
  limparEstadosTabelaParaTeste();
});

const OBRA = "11111111-1111-4111-8111-111111111111";
const FILTROS = {
  categoriaIds: [],
  fornecedorIds: [],
  formaIds: [],
  semForma: false,
  status: [],
  excluirPrevisto: false,
  incluirInvestimento: false,
};
const texto = (el: HTMLElement) => (el.textContent ?? "").replace(/\s/g, " ");

describe("CustoCcTabela com indireto", () => {
  it("sem indireto, não há colunas Direto e Indireto", () => {
    render(
      <CustoCcTabela
        custo={{ centros: [{ centroCustoId: OBRA, nome: "Obra A", codigo: "100", valor: 10 }], total: 10 }}
        periodo={{ mes: "2026-04" }}
        filtros={FILTROS}
        podeVerLancamentos
      />,
    );
    expect(screen.queryByText("Direto")).toBeNull();
    expect(screen.queryByText("Indireto")).toBeNull();
  });

  it("com indireto, mostra Direto e Indireto e o não rateado sem link", () => {
    render(
      <CustoCcTabela
        custo={{
          centros: [
            { centroCustoId: OBRA, nome: "Obra A", codigo: "100", direto: 1000, indireto: 250.5, valor: 1250.5 },
            { centroCustoId: ID_NAO_RATEADO, nome: "Indireto não rateado", codigo: null, direto: 0, indireto: 9.5, valor: 9.5 },
          ],
          total: 1260,
        }}
        periodo={{ mes: "2026-04" }}
        filtros={FILTROS}
        podeVerLancamentos
      />,
    );
    expect(screen.getByText("Direto")).toBeTruthy();
    expect(screen.getByText("Indireto")).toBeTruthy();
    const obra = screen.getByRole("row", { name: /Obra A/ });
    expect(texto(obra)).toContain("R$ 1.000,00");
    expect(texto(obra)).toContain("R$ 250,50");
    expect(texto(obra)).toContain("R$ 1.250,50");
    expect(screen.queryByRole("link", { name: /Indireto não rateado/ })).toBeNull();
    const total = screen.getByRole("row", { name: /^Total/ });
    expect(texto(total)).toContain("R$ 1.000,00");
    expect(texto(total)).toContain("R$ 260,00");
    expect(texto(total)).toContain("R$ 1.260,00");
  });
});
