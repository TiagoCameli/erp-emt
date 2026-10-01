import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * Tabela de itens da medição: números como o banco mandou (texto, `numeroExibicao`), dinheiro por
 * `MoneyText`, aprovada e glosa vazias enquanto a medição não foi aprovada, ajustes da revisão
 * corrente com sinal.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/medicao/medicoes/m1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { ItensMedicao } from "@/modules/medicao/medicoes/components/itens-medicao";
import type { ItemMedicaoDetalhe } from "@/modules/medicao/medicoes/tipos";

afterEach(cleanup);
afterEach(limparEstadosTabelaParaTeste);

function item(over: Partial<ItemMedicaoDetalhe> = {}): ItemMedicaoDetalhe {
  return {
    itemId: "i1",
    codigo: "01.01",
    descricao: "CBUQ",
    unidade: "t",
    qtdMedida: "1234.5",
    ajustes: "-2",
    qtdAprovada: "1200",
    glosa: "34.5",
    valor: "15000.50",
    ...over,
  };
}

const texto = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("ItensMedicao", () => {
  it("mostra código, descrição, unidade, medida, ajustes, aprovada, glosa e valor", () => {
    const { container } = render(<ItensMedicao itens={[item()]} valorTotal="15000.50" />);
    const celula = (c: string) => texto(container.querySelector(`tbody [data-coluna="${c}"]`));
    expect(celula("codigo")).toBe("01.01");
    expect(celula("descricao")).toBe("CBUQ");
    expect(celula("unidade")).toBe("t");
    expect(celula("qtdMedida")).toBe("1.234,5");
    expect(celula("ajustes")).toBe("-2");
    expect(celula("qtdAprovada")).toBe("1.200");
    expect(celula("glosa")).toBe("34,5");
    expect(celula("valor")).toBe("R$ 15.000,50");
  });

  it("sem aprovação, sem ajuste e sem regra de arredondamento: travessão, nunca zero inventado", () => {
    const { container } = render(
      <ItensMedicao itens={[item({ ajustes: null, qtdAprovada: null, glosa: null, valor: null })]} valorTotal={null} />,
    );
    for (const c of ["ajustes", "qtdAprovada", "glosa", "valor"]) {
      expect(container.querySelector(`tbody [data-coluna="${c}"] [aria-label="não informado"]`)).not.toBeNull();
    }
  });

  it("sem itens: estado vazio", () => {
    const { getByText } = render(<ItensMedicao itens={[]} valorTotal="0.00" />);
    expect(getByText("Nenhum item medido")).toBeTruthy();
  });
});
