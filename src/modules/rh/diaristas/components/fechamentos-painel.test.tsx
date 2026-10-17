import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  diariasDoFechamento,
  FechamentosPainel,
} from "@/modules/rh/diaristas/components/fechamentos-painel";
import type {
  DiariaLista,
  FechamentoPendente,
} from "@/modules/rh/diaristas/queries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/modules/rh/diaristas/actions", () => ({
  fecharDiarias: vi.fn(async () => ({ ok: true as const })),
  criarDiaria: vi.fn(async () => ({ ok: true as const })),
  editarDiaria: vi.fn(async () => ({ ok: true as const })),
  criarFuncaoDiaria: vi.fn(),
}));

vi.mock("@/components/canonicos/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const KELVIN = "11111111-1111-4111-8111-111111111111";
const WILLIAM = "55555555-5555-4555-8555-555555555555";
const FUNCAO = "22222222-2222-4222-8222-222222222222";

function diaria(parcial: Partial<DiariaLista> = {}): DiariaLista {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    colaboradorId: KELVIN,
    colaboradorNome: "KELVIN COELHO TEIXEIRA",
    obraId: null,
    obraNome: null,
    rateio: [],
    obraLote: null,
    data: "2026-10-01",
    dataFim: "2026-10-01",
    funcaoId: FUNCAO,
    funcaoNome: "OPERADOR",
    valorDiaria: 650,
    qtdDiarias: 1,
    diasMeia: [],
    diasFalta: [],
    competencia: "2026-10-01",
    valor: 650,
    observacao: null,
    lancamentoId: null,
    fechada: false,
    situacao: "aberto",
    alteravel: true,
    ...parcial,
  };
}

const FECHAMENTO: FechamentoPendente = {
  colaboradorId: KELVIN,
  colaboradorNome: "KELVIN COELHO TEIXEIRA",
  competencia: "2026-10-01",
  qtdDiarias: 2,
  total: 1300,
};

const DIARIAS: DiariaLista[] = [
  diaria({
    id: "a0000000-0000-4000-8000-000000000002",
    data: "2026-10-08",
    dataFim: "2026-10-08",
  }),
  diaria({ id: "a0000000-0000-4000-8000-000000000001" }),
  // Controles: outro diarista, outro mês, e uma já fechada do mesmo mês.
  diaria({
    id: "b0000000-0000-4000-8000-000000000001",
    colaboradorId: WILLIAM,
  }),
  diaria({
    id: "b0000000-0000-4000-8000-000000000002",
    competencia: "2026-09-01",
    data: "2026-09-10",
    dataFim: "2026-09-10",
  }),
  diaria({
    id: "b0000000-0000-4000-8000-000000000003",
    data: "2026-10-03",
    dataFim: "2026-10-03",
    lancamentoId: "c0000000-0000-4000-8000-000000000001",
    fechada: true,
    situacao: "fechada",
  }),
];

afterEach(cleanup);

describe("diariasDoFechamento", () => {
  it("pega só as em aberto do mesmo diarista e mês, por data", () => {
    const itens = diariasDoFechamento(DIARIAS, FECHAMENTO);
    expect(itens.map((d) => d.id)).toEqual([
      "a0000000-0000-4000-8000-000000000001",
      "a0000000-0000-4000-8000-000000000002",
    ]);
    // A soma bate com o total da linha.
    expect(itens.reduce((s, d) => s + d.valor, 0)).toBe(FECHAMENTO.total);
  });
});

describe("FechamentosPainel", () => {
  function renderizar(podeEditar: boolean) {
    render(
      <FechamentosPainel
        fechamentos={[FECHAMENTO]}
        formasPagamento={[]}
        diarias={DIARIAS}
        diaristas={[]}
        centros={[]}
        funcoes={[]}
        podeEditar={podeEditar}
      />,
    );
  }

  it("expande a linha e abre o drawer de edição da diária", () => {
    renderizar(true);
    expect(screen.queryByRole("button", { name: /Editar diária/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /KELVIN/ }));

    const editar = screen.getAllByRole("button", { name: /Editar diária/ });
    expect(editar).toHaveLength(2);

    fireEvent.click(editar[0]!);
    expect(screen.getByText("Editar diária")).toBeTruthy();
  });

  it("sem permissão de editar, lista as diárias sem o botão", () => {
    renderizar(false);
    fireEvent.click(screen.getByRole("button", { name: /KELVIN/ }));
    expect(screen.getByText("01/10/2026")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Editar diária/ })).toBeNull();
  });
});
