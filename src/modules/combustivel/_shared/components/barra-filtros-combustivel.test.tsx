import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { filtroGlobalDaUrl, type OpcoesFiltroGlobal } from "@/modules/combustivel/_shared/filtro-global";

import { BarraFiltrosCombustivel } from "./barra-filtros-combustivel";

/** URL de mentira: o que a barra lê e para onde manda navegar. */
const navegador = vi.hoisted(() => ({ query: "", destinos: [] as string[] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: (destino: string) => {
      navegador.destinos.push(destino);
      navegador.query = destino.split("?")[1] ?? "";
    },
    push: vi.fn(),
  }),
  usePathname: () => "/combustivel",
  useSearchParams: () => new URLSearchParams(navegador.query),
}));

vi.mock("@/lib/formatadores", async (original) => ({
  ...(await original<typeof import("@/lib/formatadores")>()),
  // Hoje fixo para o atalho "Este mês" da régua.
  dataHojeISO: () => "2026-09-23",
}));

vi.mock("@/components/canonicos/filtros-sessao", () => ({
  salvarQuerySessao: vi.fn(),
  lerQuerySessao: vi.fn(() => null),
  limparFiltrosSessao: vi.fn(),
  limparFiltrosDaRota: vi.fn(),
}));

const S10 = "66666666-6666-4666-8666-666666666666";
const ARLA = "77777777-7777-4777-8777-777777777777";
const OBRA = "11111111-1111-4111-8111-111111111111";

const opcoes: OpcoesFiltroGlobal = {
  obras: [{ valor: OBRA, rotulo: "Lote 9" }],
  equipamentos: [],
  transportadoras: [],
  placas: [],
  tanques: [],
  combustiveis: [
    { valor: ARLA, rotulo: "Arla 32" },
    { valor: S10, rotulo: "Diesel S10" },
  ],
  fornecedores: [],
  operadores: [{ valor: "João", rotulo: "João" }],
};

function renderizar(query: string) {
  navegador.query = query;
  const filtro = filtroGlobalDaUrl(new URLSearchParams(query));
  return render(<BarraFiltrosCombustivel filtro={filtro} opcoes={opcoes} />);
}

function ultimoDestino(): URLSearchParams {
  const destino = navegador.destinos.at(-1) ?? "";
  return new URLSearchParams(destino.split("?")[1] ?? "");
}

beforeEach(() => {
  navegador.query = "";
  navegador.destinos = [];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BarraFiltrosCombustivel", () => {
  it("sem filtro: QUALQUER data e nenhum chip (os 30 dias não voltam sozinhos)", () => {
    // O conserto de 24/09/2026: antes o botão mostrava "25/08/26 – 23/09/26" mesmo
    // com a URL limpa, e não havia como desligar o período.
    renderizar("");
    expect(screen.getByRole("button", { name: "Período" }).textContent).toContain("Qualquer data");
    expect(screen.queryByRole("button", { name: "Limpar período" })).toBeNull();
    expect(screen.queryByText("Limpar tudo")).toBeNull();
  });

  it("o período é o FiltroPeriodo do ERP: resumo no botão e X que limpa de verdade", () => {
    renderizar(`de=2026-09-01&ate=2026-09-15&obra=${OBRA}`);
    expect(screen.getByRole("button", { name: "Período" }).textContent).toContain("01/09/2026 - 15/09/2026");

    fireEvent.click(screen.getByRole("button", { name: "Limpar período" }));
    const destino = ultimoDestino();
    expect(destino.has("de")).toBe(false);
    expect(destino.has("ate")).toBe(false);
    expect(destino.get("obra")).toBe(OBRA);
  });

  it("escolher 'Este mês' na régua grava de e ate", () => {
    renderizar("");
    fireEvent.click(screen.getByRole("button", { name: "Período" }));
    fireEvent.click(screen.getByRole("button", { name: "Este mês" }));
    expect(ultimoDestino().get("de")).toBe("2026-09-01");
    expect(ultimoDestino().get("ate")).toBe("2026-09-30");
  });

  it("período de uma ponta só mostra só aquela ponta", () => {
    renderizar("de=2026-09-01");
    expect(screen.getByRole("button", { name: "Período" }).textContent).toContain("a partir de 01/09/2026");
  });

  it("o chip de combustível liga o filtro na URL, e dois cliques rápidos somam", () => {
    renderizar("modo=carretas");
    fireEvent.click(screen.getByRole("button", { name: "Diesel S10" }));
    fireEvent.click(screen.getByRole("button", { name: "Arla 32" }));
    const destino = ultimoDestino();
    expect(destino.get("combustivel")).toBe(`${S10},${ARLA}`);
    expect(destino.get("modo")).toBe("carretas");
  });

  it("chips ativos com ✕ tiram só aquele valor; 'Limpar tudo' apaga o recorte e mantém o modo", () => {
    renderizar(`modo=carretas&de=2026-09-01&ate=2026-09-15&obra=${OBRA}&combustivel=${S10},${ARLA}&operador=João`);
    expect(screen.getByText("Motorista: João")).toBeTruthy();
    // O período não duplica como chip: já tem o resumo e o X no próprio filtro.
    expect(screen.queryByText(/^Período:/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remover Combustível: Diesel S10" }));
    expect(ultimoDestino().get("combustivel")).toBe(ARLA);

    fireEvent.click(screen.getByText("Limpar tudo"));
    const limpo = ultimoDestino();
    expect(limpo.toString()).toBe("modo=carretas");
  });
});
