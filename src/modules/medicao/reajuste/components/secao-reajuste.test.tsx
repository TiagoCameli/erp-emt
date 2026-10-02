import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Seção Reajuste do detalhe da medição: o relatório que vale (total, situação, origem, diferença do
 * banco e, no SIAC, valor a PI do DNIT ao lado do valor da medição), as linhas com o rateio, os
 * índices recolhíveis e o histórico. Os botões dependem de `podeLancar` (editar + medição enviada ou
 * aprovada) e `podeEditar` (excluir), os dois calculados no servidor.
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
vi.mock("@/modules/_shared/anexos/actions", () => ({
  anexosDoDocumento: vi.fn(async () => []),
  removerAnexo: vi.fn(async () => ({ ok: true })),
  urlDoAnexo: vi.fn(async () => ({ url: "https://exemplo/arquivo" })),
}));
vi.mock("@/modules/_shared/anexos/enviar-do-navegador", () => ({
  enviarAnexoDoNavegador: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/modules/medicao/reajuste/actions", () => ({
  lerPdfSiac: vi.fn(),
  previaReajuste: vi.fn(),
  gravarReajuste: vi.fn(),
  lancarReajusteManual: vi.fn(),
  excluirRelatorioReajuste: vi.fn(),
}));

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { SecaoReajuste } from "@/modules/medicao/reajuste/components/secao-reajuste";
import { medicaoRecebeReajuste } from "@/modules/medicao/reajuste/formato";
import { MEDICAO, REAJUSTE_K9, SEM_REAJUSTE } from "@/modules/medicao/reajuste/components/__fixtures__/tela";
import type { ReajusteMedicao } from "@/modules/medicao/reajuste/tipos";

afterEach(cleanup);
afterEach(limparEstadosTabelaParaTeste);

const texto = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

function renderizar(reajuste: ReajusteMedicao, podeEditar: boolean, podeLancar: boolean) {
  return render(
    <SecaoReajuste
      medicaoId={MEDICAO}
      numero={1}
      valorMedicao="400.00"
      reajuste={reajuste}
      pendentes={[]}
      anexos={[]}
      podeEditar={podeEditar}
      podeLancar={podeLancar}
    />,
  );
}

describe("medicaoRecebeReajuste", () => {
  it("só enviada e aprovada recebem reajuste", () => {
    expect(medicaoRecebeReajuste("aberta")).toBe(false);
    expect(medicaoRecebeReajuste("em_conferencia")).toBe(false);
    expect(medicaoRecebeReajuste("enviada")).toBe(true);
    expect(medicaoRecebeReajuste("aprovada")).toBe(true);
  });
});

describe("SecaoReajuste", () => {
  it("sem relatório: estado vazio; com permissão e medição enviada, os dois botões", () => {
    renderizar(SEM_REAJUSTE, true, true);
    expect(screen.getByText("Nenhum reajuste registrado nesta medição")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Importar relatório SIAC" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lançar sem relatório" })).toBeTruthy();
  });

  it("sem permissão não há botões (nem importar, nem lançar, nem excluir)", () => {
    renderizar(REAJUSTE_K9, false, false);
    expect(screen.queryByRole("button", { name: "Importar relatório SIAC" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lançar sem relatório" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Excluir relatório/ })).toBeNull();
  });

  it("medição aberta (editar sem poder lançar): não mostra importar nem lançar, mas exclui", () => {
    renderizar(REAJUSTE_K9, true, false);
    expect(screen.queryByRole("button", { name: "Importar relatório SIAC" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lançar sem relatório" })).toBeNull();
    expect(screen.getByRole("button", { name: "Excluir relatório 2" })).toBeTruthy();
  });

  it("o que vale: total, Definitivo, SIAC nº 2, diferença do banco, valor a PI ao lado do valor da medição", () => {
    const { container } = renderizar(REAJUSTE_K9, false, false);
    const resumo = texto(container.querySelector('[data-secao="reajuste-vigente"]'));
    expect(resumo).toContain("R$ 8,00");
    expect(resumo).toContain("Definitivo");
    expect(resumo).toContain("SIAC nº 2");
    expect(resumo).toContain("R$ 2,99 a receber");
    expect(resumo).toContain("Valor a PI (DNIT)");
    expect(resumo).toContain("R$ 400,00");
  });

  it("linhas do que vale com os itens rateados; mais de um item vira lista; rodapé com o total", () => {
    const { container } = renderizar(REAJUSTE_K9, false, false);
    const tabela = container.querySelector('[data-secao="reajuste-linhas"]');
    const linhas = Array.from(tabela?.querySelectorAll("tbody tr") ?? []);
    const cap = linhas.find((l) => texto(l.querySelector('[data-coluna="codigo"]')) === "60112");
    expect(texto(cap?.querySelector('[data-coluna="rateio"]'))).toBe("04.03.02 · R$ -95.030,34");
    const transporte = linhas.find((l) => texto(l.querySelector('[data-coluna="codigo"]')) === "111");
    expect(transporte?.querySelectorAll('[data-coluna="rateio"] li').length).toBe(2);
    expect(texto(tabela?.querySelector("tfoot"))).toContain("R$ 8,00");
  });

  it("índices recolhíveis: aparecem ao abrir", () => {
    renderizar(REAJUSTE_K9, false, false);
    expect(screen.queryByText("-0,17626")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar índices (1)" }));
    expect(screen.getByText("CAP")).toBeTruthy();
    expect(screen.getByText("-0,17626")).toBeTruthy();
  });

  it("manual que vale não tem linhas: diz que conta só no total", () => {
    renderizar(
      { vigente: { relatorioId: "m1", sequencia: 1, origem: "manual", situacao: "provisorio", total: "-1234.56", anteriorTotal: null, diferenca: null }, relatorios: [], linhas: [], indices: [] },
      false,
      false,
    );
    expect(screen.getByText("Manual")).toBeTruthy();
    expect(screen.getByText("Provisório")).toBeTruthy();
    expect(screen.getByText(/sem rateio por item/)).toBeTruthy();
  });
});
