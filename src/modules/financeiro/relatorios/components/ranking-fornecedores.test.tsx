import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { RankingFornecedores } from "@/modules/financeiro/relatorios/components/ranking-fornecedores";
import type { FornecedorRankingLinha } from "@/modules/financeiro/relatorios/fornecedores-ranking";

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

// jsdom não tem IntersectionObserver, que o `whileInView` do motion usa.
class SemObservar {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver ??= SemObservar as unknown as typeof IntersectionObserver;

afterEach(() => {
  cleanup();
  limparEstadosTabelaParaTeste();
});

const PACCAR = "11111111-1111-4111-8111-111111111111";
const VIBRA = "22222222-2222-4222-8222-222222222222";

const LINHAS: FornecedorRankingLinha[] = [
  { fornecedorId: PACCAR, nome: "BANCO PACCAR S. A.", lancamentos: 3, lancado: 5000, pago: 1000, emAberto: 4000, vencido: 0, proximos30: 500 },
  { fornecedorId: VIBRA, nome: "VIBRA ENERGIA", lancamentos: 40, lancado: 9000, pago: 8500, emAberto: 500, vencido: 100, proximos30: 400 },
  { fornecedorId: null, nome: "Sem fornecedor", lancamentos: 2, lancado: 300, pago: 300, emAberto: 0, vencido: 0, proximos30: 0 },
];

const texto = (el: HTMLElement) => (el.textContent ?? "").replace(/\s/g, " ");

describe("RankingFornecedores", () => {
  it("abre com a frase de quanto se deve, o vencido e o período", () => {
    render(<RankingFornecedores linhas={LINHAS} descricaoPeriodo="De jan/2026 a out/2026" />);
    const corpo = texto(document.body);
    expect(corpo).toContain("Hoje a EMT deve R$ 4.500,00 a 2 fornecedores, R$ 100,00 já vencidos, e R$ 900,00 vencem nos próximos 30 dias");
    expect(corpo).toContain("De jan/2026 a out/2026: R$ 14.300,00 lançados e R$ 9.800,00 pagos");
    expect(corpo).toContain("2 lançamento(s) do período estão sem fornecedor");
  });

  it("os maiores credores vêm em ordem, e o nome abre o extrato do fornecedor", () => {
    render(<RankingFornecedores linhas={LINHAS} descricaoPeriodo="x" />);
    const credores = screen.getByRole("region", { name: /Maiores credores/ });
    const itens = within(credores).getAllByRole("listitem");
    expect(itens).toHaveLength(2);
    expect(texto(itens[0])).toContain("BANCO PACCAR");
    const link = within(itens[0]).getByRole("link");
    expect(link.getAttribute("href")).toBe(`/financeiro/relatorios?rel=extrato-fornecedor&fornecedor=${PACCAR}`);
  });
});
