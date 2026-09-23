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

vi.mock("@/components/canonicos/filtros-sessao", () => ({
  salvarQuerySessao: vi.fn(),
  lerQuerySessao: vi.fn(() => null),
  limparFiltrosSessao: vi.fn(),
  limparFiltrosDaRota: vi.fn(),
}));

const HOJE = "2026-09-23";
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
  const filtro = filtroGlobalDaUrl(new URLSearchParams(query), HOJE);
  return render(<BarraFiltrosCombustivel filtro={filtro} opcoes={opcoes} hoje={HOJE} />);
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
  it("sem filtro: mostra o período padrão e nenhum chip", () => {
    renderizar("");
    expect(screen.getByRole("button", { name: "Período" }).textContent).toContain("25/08/26 – 23/09/26");
    expect(screen.queryByText("Limpar tudo")).toBeNull();
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
    expect(screen.getByText("Período: 01/09/26 – 15/09/26")).toBeTruthy();
    expect(screen.getByText("Motorista: João")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remover Combustível: Diesel S10" }));
    expect(ultimoDestino().get("combustivel")).toBe(ARLA);

    fireEvent.click(screen.getByRole("button", { name: "Remover Período: 01/09/26 – 15/09/26" }));
    expect(ultimoDestino().has("de")).toBe(false);
    expect(ultimoDestino().get("obra")).toBe(OBRA);

    fireEvent.click(screen.getByText("Limpar tudo"));
    const limpo = ultimoDestino();
    expect(limpo.toString()).toBe("modo=carretas");
  });

  it("escolher o preset 'Últimos 30 dias' tira o período da URL (é o padrão)", () => {
    renderizar("de=2026-09-01&ate=2026-09-15");
    fireEvent.click(screen.getByRole("button", { name: "Período" }));
    fireEvent.click(screen.getByRole("button", { name: "Últimos 30 dias" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(ultimoDestino().has("de")).toBe(false);
    expect(ultimoDestino().has("ate")).toBe(false);
  });

  it("escolher 'Mês atual' grava de e ate", () => {
    renderizar("");
    fireEvent.click(screen.getByRole("button", { name: "Período" }));
    fireEvent.click(screen.getByRole("button", { name: "Mês atual" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(ultimoDestino().get("de")).toBe("2026-09-01");
    expect(ultimoDestino().get("ate")).toBe("2026-09-30");
  });
});
