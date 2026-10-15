import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";

import { AquisicoesTabela } from "@/modules/financeiro/relatorios/components/aquisicoes-tabela";
import type { AquisicaoLinha } from "@/modules/financeiro/relatorios/aquisicoes";

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

const CARRETA_A = "11111111-1111-4111-8111-111111111111";
const CARRETA_B = "22222222-2222-4222-8222-222222222222";
const ESCAVADEIRA = "33333333-3333-4333-8333-333333333333";
const CONSORCIOS = "44444444-4444-4444-8444-444444444444";
const COTA = "55555555-5555-4555-8555-555555555555";

const equipamento = (
  grupo: string,
  centroId: string,
  centro: string,
  valor: number,
  pago: number,
): AquisicaoLinha => ({
  tipo: "equipamento",
  grupo,
  centroId,
  centro,
  lancamentoId: null,
  numero: null,
  descricao: null,
  fornecedor: "Randon",
  primeiraCompetencia: "2026-03-01",
  lancamentos: 2,
  parcelas: null,
  parcelasPagas: null,
  valor,
  pago,
  aPagar: valor - pago,
  parcelasAbertas: valor > pago ? 12 : 0,
  proximoVencimento: valor > pago ? "2026-11-10" : null,
  ultimoVencimento: valor > pago ? "2027-10-10" : null,
  divida: null,
});

const LINHAS: AquisicaoLinha[] = [
  equipamento("001 - Carretas EMT", CARRETA_A, "Carreta A", 100000, 40000),
  equipamento("001 - Carretas EMT", CARRETA_B, "Carreta B", 50000, 50000),
  equipamento("Aquisição de Equipamentos", ESCAVADEIRA, "Escavadeira 320", 800000, 0),
  {
    tipo: "consorcio",
    grupo: "Aquisição de Equipamentos",
    centroId: CONSORCIOS,
    centro: "Consórcios a contemplar",
    lancamentoId: COTA,
    numero: "LAN-0042",
    descricao: "Cota 123 grupo 45",
    fornecedor: "Rodobens",
    primeiraCompetencia: "2026-01-01",
    lancamentos: 1,
    parcelas: 60,
    parcelasPagas: 9,
    valor: 300000,
    pago: 45000,
    aPagar: 255000,
    parcelasAbertas: 51,
    proximoVencimento: "2026-11-15",
    ultimoVencimento: "2031-01-15",
    divida: "cota",
  },
];

const texto = (el: HTMLElement) => (el.textContent ?? "").replace(/\s/g, " ");

describe("AquisicoesTabela", () => {
  it("agrupa os equipamentos pelo centro raiz, com subtotal", () => {
    render(<AquisicoesTabela linhas={LINHAS} podeVerLancamentos />);
    const grupo = screen.getByRole("row", { name: /^001 - Carretas EMT/ });
    // 100.000 + 50.000 de valor; 40.000 + 50.000 pagos; 60.000 a pagar.
    expect(texto(grupo)).toContain("R$ 150.000,00");
    expect(texto(grupo)).toContain("R$ 90.000,00");
    expect(texto(grupo)).toContain("R$ 60.000,00");
    const carreta = screen.getByRole("row", { name: /Carreta A/ });
    expect(texto(carreta)).toContain("03/2026");
    expect(within(carreta).getByText("Randon")).toBeTruthy();
  });

  it("o nome do bem abre os lançamentos do centro", () => {
    render(<AquisicoesTabela linhas={LINHAS} podeVerLancamentos />);
    const link = screen.getByRole("link", { name: /Escavadeira 320/ });
    expect(link.getAttribute("href")).toContain(`centro=${ESCAVADEIRA}`);
  });

  it("fecha cada seção com total", () => {
    render(<AquisicoesTabela linhas={LINHAS} podeVerLancamentos />);
    const [equipamentos, consorcios] = screen.getAllByRole("row", { name: /^Total/ });
    expect(texto(equipamentos)).toContain("R$ 950.000,00");
    expect(texto(consorcios)).toContain("R$ 255.000,00");
  });

  it("a cota mostra parcelas pagas e liga no lançamento", () => {
    render(<AquisicoesTabela linhas={LINHAS} podeVerLancamentos />);
    const cota = screen.getByRole("row", { name: /LAN-0042/ });
    expect(texto(cota)).toContain("9/60");
    expect(within(cota).getByText("Rodobens")).toBeTruthy();
    expect(screen.getByRole("link", { name: /LAN-0042/ }).getAttribute("href")).toBe(
      `/financeiro/lancamentos/${COTA}`,
    );
    expect(screen.getByText(/Consórcios a contemplar; contemplada/)).toBeTruthy();
  });

  it("sem permissão de lançamentos, sem link", () => {
    render(<AquisicoesTabela linhas={LINHAS} podeVerLancamentos={false} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("sem linhas, estado vazio", () => {
    render(<AquisicoesTabela linhas={[]} podeVerLancamentos />);
    expect(screen.getByText("Nenhuma aquisição lançada")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("AquisicoesTabela — quanto falta e até quando", () => {
  it("abre com a frase da quitação e aponta o que não está em Dívidas", () => {
    render(<AquisicoesTabela linhas={LINHAS} podeVerLancamentos />);
    const corpo = texto(document.body);
    // Carreta A 60.000 + Escavadeira 800.000 = 860.000; cota 255.000.
    expect(corpo).toContain(
      "Faltam R$ 1.115.000,00 para quitar máquinas e consórcios: R$ 860.000,00 em 2 bens até 10/2027 e R$ 255.000,00 em 1 cota de consórcio até 01/2031",
    );
    expect(corpo).toContain("R$ 860.000,00 são de 2 bens financiados que ainda não estão em Financeiro › Dívidas");
  });

  it("a cota mostra quantas parcelas restam e a quitação", () => {
    render(<AquisicoesTabela linhas={LINHAS} podeVerLancamentos />);
    const cota = screen.getByRole("row", { name: /LAN-0042/ });
    expect(texto(cota)).toContain("51");
    expect(texto(cota)).toContain("01/2031");
    const quitada = screen.getByRole("row", { name: /Carreta B/ });
    expect(texto(quitada)).toContain("quitado");
  });
});
