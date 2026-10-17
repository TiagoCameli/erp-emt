import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { editarDiaria } from "@/modules/rh/diaristas/actions";
import { DiariaFormDrawer } from "@/modules/rh/diaristas/components/diaria-form-drawer";
import type {
  CentroDiaria,
  DiariaLista,
  FuncaoDiaria,
} from "@/modules/rh/diaristas/queries";

vi.mock("@/modules/rh/diaristas/actions", () => ({
  criarDiaria: vi.fn(async () => ({ ok: true as const })),
  editarDiaria: vi.fn(async () => ({ ok: true as const })),
  criarFuncaoDiaria: vi.fn(async () => ({
    ok: true as const,
    id: "33333333-3333-4333-8333-333333333333",
    nome: "VIGIA",
  })),
}));

vi.mock("@/components/canonicos/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const COLAB = "11111111-1111-4111-8111-111111111111";
const FUNCAO = "22222222-2222-4222-8222-222222222222";
const C007 = "55555555-5555-4555-8555-555555555555";
const C009 = "66666666-6666-4666-8666-666666666666";

const CENTROS: CentroDiaria[] = [
  { id: C007, nome: "007 - AC 405", tipo: "obra", obraId: null, ativo: true },
  { id: C009, nome: "009 - BR-364", tipo: "obra", obraId: null, ativo: true },
];

const FUNCOES: FuncaoDiaria[] = [
  {
    id: FUNCAO,
    nome: "OPERADOR DE MESA",
    valor: 120,
    atualizadoEm: null,
    diariaId: null,
  },
];

function diaria(parcial: Partial<DiariaLista> = {}): DiariaLista {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    colaboradorId: COLAB,
    colaboradorNome: "LOZADO",
    obraId: null,
    obraNome: null,
    obraLote: null,
    rateio: [{ centroCustoId: C007, nome: "007 - AC 405", percentual: 100 }],
    data: "2026-10-01",
    dataFim: "2026-10-05",
    funcaoId: FUNCAO,
    funcaoNome: "OPERADOR DE MESA",
    valorDiaria: 120,
    qtdDiarias: 4.5,
    diasMeia: ["2026-10-02"],
    diasFalta: ["2026-10-03"],
    competencia: "2026-10-01",
    valor: 540,
    observacao: null,
    lancamentoId: null,
    fechada: false,
    situacao: "aberto",
    alteravel: true,
    ...parcial,
  };
}

function abrir(d: DiariaLista) {
  render(
    <DiariaFormDrawer
      aberto
      onAbertoChange={() => {}}
      diaristas={[
        { id: COLAB, nome: "LOZADO", valorDiaria: 100, funcaoId: FUNCAO },
      ]}
      centros={CENTROS}
      funcoes={FUNCOES}
      diaria={d}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DiariaFormDrawer (período)", () => {
  it("mostra os dias do período e o resumo calculado", () => {
    abrir(diaria());
    expect(
      screen.getByRole("button", { name: "Dia 2: Meia diária" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Dia 3: Não trabalhou" }),
    ).toBeTruthy();
    // 5 dias: 3 integrais + 1 meia + 1 sem trabalho = 3,5 diárias × 120 = 420
    expect(screen.getByText(/3,5 diárias/)).toBeTruthy();
    expect(screen.getByText(/420,00/)).toBeTruthy();
  });

  it("clicar no dia alterna integral → meia → não trabalhou e o resumo acompanha", () => {
    abrir(diaria());
    fireEvent.click(screen.getByRole("button", { name: "Dia 4: Integral" }));
    expect(
      screen.getByRole("button", { name: "Dia 4: Meia diária" }),
    ).toBeTruthy();
    expect(screen.getByText(/3 diárias/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dia 4: Meia diária" }));
    expect(
      screen.getByRole("button", { name: "Dia 4: Não trabalhou" }),
    ).toBeTruthy();
    expect(screen.getByText(/2,5 diárias/)).toBeTruthy();
  });

  it("salvar manda período, meias e faltas para a action", async () => {
    abrir(diaria());
    fireEvent.click(screen.getByRole("button", { name: "Salvar diária" }));
    await waitFor(() => expect(editarDiaria).toHaveBeenCalled());
    expect(vi.mocked(editarDiaria).mock.calls[0][1]).toMatchObject({
      inicio: "2026-10-01",
      fim: "2026-10-05",
      meias: ["2026-10-02"],
      faltas: ["2026-10-03"],
      valorDiaria: 120,
      funcaoId: FUNCAO,
    });
  });

  it("período que cruza o mês aparece no resumo e não salva", async () => {
    abrir(diaria({ dataFim: null, diasMeia: [], diasFalta: [] }));
    fireEvent.change(screen.getByLabelText("Fim do período"), {
      target: { value: "2026-11-02" },
    });
    expect(screen.getAllByText(/cruza o mês/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Salvar diária" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(editarDiaria).not.toHaveBeenCalled();
  });

  it("diária antiga (sem período) abre como um dia com o valor inteiro", () => {
    abrir(
      diaria({
        dataFim: null,
        funcaoId: null,
        funcaoNome: null,
        valorDiaria: null,
        qtdDiarias: null,
        diasMeia: [],
        diasFalta: [],
        valor: 3850,
      }),
    );
    expect(screen.getByText(/1 diária/)).toBeTruthy();
    // Aparece duas vezes: valor da diária e total (1 × 3.850 = 3.850).
    expect(screen.getAllByText(/3\.850,00/)).toHaveLength(2);
  });

  it("salvar manda o rateio da obra", async () => {
    abrir(diaria());
    fireEvent.click(screen.getByRole("button", { name: "Salvar diária" }));
    await waitFor(() => expect(editarDiaria).toHaveBeenCalled());
    expect(vi.mocked(editarDiaria).mock.calls[0][1].rateio).toEqual([
      { centroCustoId: C007, percentual: 100 },
    ]);
  });

  it("sem obra não salva e avisa", async () => {
    abrir(diaria({ rateio: [] }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar diária" }));
    expect(await screen.findByText("Escolha a obra de cada linha")).toBeTruthy();
    expect(editarDiaria).not.toHaveBeenCalled();
  });

  it("rateio 70/30 mostra o R$ de cada obra e manda os percentuais", async () => {
    abrir(
      diaria({
        rateio: [
          { centroCustoId: C007, nome: "007 - AC 405", percentual: 70 },
          { centroCustoId: C009, nome: "009 - BR-364", percentual: 30 },
        ],
      }),
    );
    // 3,5 diárias × 120 = 420 -> 294 + 126.
    expect(screen.getByText(/294,00/)).toBeTruthy();
    expect(screen.getByText(/126,00/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salvar diária" }));
    await waitFor(() => expect(editarDiaria).toHaveBeenCalled());
    expect(vi.mocked(editarDiaria).mock.calls[0][1].rateio).toEqual([
      { centroCustoId: C007, percentual: 70 },
      { centroCustoId: C009, percentual: 30 },
    ]);
  });

  it("rateio que não soma 100 não salva", async () => {
    abrir(
      diaria({
        rateio: [
          { centroCustoId: C007, nome: "007 - AC 405", percentual: 70 },
          { centroCustoId: C009, nome: "009 - BR-364", percentual: 30 },
        ],
      }),
    );
    fireEvent.change(screen.getByLabelText("Percentual da obra 2"), {
      target: { value: "20" },
    });
    expect(screen.getByText(/falta 10% para 100%/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salvar diária" }));
    expect(
      await screen.findByText("O rateio tem que somar 100% (está somando 90%)"),
    ).toBeTruthy();
    expect(editarDiaria).not.toHaveBeenCalled();
  });

  it("remover a segunda obra devolve 100% para a que fica", async () => {
    abrir(
      diaria({
        rateio: [
          { centroCustoId: C007, nome: "007 - AC 405", percentual: 70 },
          { centroCustoId: C009, nome: "009 - BR-364", percentual: 30 },
        ],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remover obra 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar diária" }));
    await waitFor(() => expect(editarDiaria).toHaveBeenCalled());
    expect(vi.mocked(editarDiaria).mock.calls[0][1].rateio).toEqual([
      { centroCustoId: C007, percentual: 100 },
    ]);
  });
});
