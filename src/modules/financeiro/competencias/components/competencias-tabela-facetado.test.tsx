import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { chaveFiltroSessao } from "@/components/canonicos/filtros-sessao";
import { CompetenciasTabela } from "@/modules/financeiro/competencias/components/competencias-tabela";
import type { CompetenciaMes } from "@/modules/financeiro/competencias/queries";

/**
 * Filtros facetados na tela de competências (ver `_shared/filtros-facetados`):
 * com "Com incompletos" ligado, a situação só oferece o que sobra na tabela.
 *
 * O FiltroSelect vira um `<select>` nativo aqui só para dar para ler as opções
 * sem abrir o popover do Radix; a tela continua a mesma.
 */

const ROTA = "/financeiro/competencias";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => ROTA,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

vi.mock("@/modules/financeiro/competencias/actions", () => ({
  fecharCompetencia: vi.fn(),
  reabrirCompetencia: vi.fn(),
}));

vi.mock("@/components/canonicos", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("@/components/canonicos")>();
  function FiltroSelectNativo(props: {
    valor: string;
    onValorChange: (valor: string) => void;
    opcoes: { valor: string; rotulo: string }[];
    placeholder?: string;
  }) {
    return (
      <select
        aria-label={props.placeholder}
        value={props.valor}
        onChange={(evento) => props.onValorChange(evento.target.value)}
      >
        <option value="">Todos</option>
        {props.opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </option>
        ))}
      </select>
    );
  }
  return { ...real, FiltroSelect: FiltroSelectNativo };
});

function mes(sobrescrever: Partial<CompetenciaMes>): CompetenciaMes {
  return {
    mes: "2026-08-01",
    fechada: false,
    fechadoEm: null,
    fechadoPorNome: null,
    observacao: null,
    custo: 1000,
    lancamentos: 3,
    incompletos: 0,
    excecoes: 0,
    reaberturas: 0,
    ...sobrescrever,
  };
}

// Aberta com incompletos; fechada sem incompletos.
const COMPETENCIAS = [
  mes({ mes: "2026-09-01", fechada: false, incompletos: 2 }),
  mes({ mes: "2026-08-01", fechada: true, incompletos: 0 }),
];

function opcoesDe(rotulo: string): string[] {
  const select = screen.getByRole("combobox", { name: rotulo });
  return within(select)
    .getAllByRole("option")
    .map((opcao) => opcao.getAttribute("value") ?? "")
    .filter((valor) => valor !== "");
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  limparEstadosTabelaParaTeste();
  window.sessionStorage.clear();
});

describe("competências: filtros facetados", () => {
  it("sem outro filtro, a situação oferece abertas e fechadas", () => {
    render(<CompetenciasTabela competencias={COMPETENCIAS} podeFechar podeReabrir />);
    expect(opcoesDe("Situação")).toEqual(["aberta", "fechada"]);
  });

  it("com 'Com incompletos', a situação só oferece o que sobra (abertas)", () => {
    window.sessionStorage.setItem(chaveFiltroSessao(ROTA, "incompletos"), "com");
    render(<CompetenciasTabela competencias={COMPETENCIAS} podeFechar podeReabrir />);
    expect(opcoesDe("Situação")).toEqual(["aberta"]);
  });

  it("escolher a situação restringe o filtro de incompletos, e o escolhido fica", () => {
    window.sessionStorage.setItem(chaveFiltroSessao(ROTA, "incompletos"), "com");
    render(<CompetenciasTabela competencias={COMPETENCIAS} podeFechar podeReabrir />);
    fireEvent.change(screen.getByRole("combobox", { name: "Situação" }), {
      target: { value: "fechada" },
    });
    // Nenhum mês fechado tem incompleto: "com" fica (escolhido), "sem" aparece.
    expect(opcoesDe("Incompletos")).toEqual(["com", "sem"]);
  });
});
