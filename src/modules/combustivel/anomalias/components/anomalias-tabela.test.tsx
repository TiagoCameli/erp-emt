import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { AnomaliaLista } from "@/modules/combustivel/anomalias/queries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/combustivel/anomalias",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

vi.mock("@/modules/combustivel/anomalias/actions", () => ({
  conferirAnomalia: vi.fn(async () => ({ ok: true })),
  atribuirEquipamento: vi.fn(async () => ({ ok: true, atualizadas: 1 })),
}));

import { atribuirEquipamento } from "@/modules/combustivel/anomalias/actions";
import { AnomaliasTabela, type AnomaliasTabelaProps } from "@/modules/combustivel/anomalias/components/anomalias-tabela";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SAIDA = "c4e0f922-3aec-8c72-7089-225523e04557";
const EQUIPAMENTO = "9f2b7c1d-2222-4333-8444-555566667777";

function d1(): AnomaliaLista {
  return {
    id: `D1-${SAIDA}`,
    severity: "warning",
    detector: "D1",
    title: "Saída sem equipamento identificado",
    description: "120,00 L · R$ 767,36 · obra Obra 009",
    affectedSaidaIds: [SAIDA],
    affectedObraId: "obra",
    data: "2026-09-10",
    acaoSugerida: "Atribuir o equipamento à saída",
    rotuloDetector: "Sentinel sem equipamento",
    equipamentoRotulo: null,
    conferencia: null,
    saidas: [
      { id: SAIDA, data: "2026-09-10T08:00:00", tanque: "Base", obra: "Obra 009", consumidor: "Não identificado", litros: 120, valorTotal: 767.36 },
    ],
  };
}

function d2(): AnomaliaLista {
  return {
    ...d1(),
    id: `D2-${SAIDA}`,
    detector: "D2",
    title: "R$/L acima da média para Diesel S10",
    description: "R$ 9,0000/L vs média R$ 6,4000",
    rotuloDetector: "R$/L outlier",
  };
}

function props(parcial: Partial<AnomaliasTabelaProps> = {}): AnomaliasTabelaProps {
  return {
    anomalias: [d1(), d2()],
    situacao: "pendentes",
    modo: "proprios",
    severidade: "",
    detector: "",
    de: "2026-08-25",
    ate: "2026-09-23",
    podeEditar: true,
    veAbastecimentos: true,
    equipamentos: [{ valor: EQUIPAMENTO, rotulo: "EQ-01 · Escavadeira 320" }],
    ...parcial,
  };
}

describe("AnomaliasTabela", () => {
  it("sem combustivel.anomalias/editar, nenhuma ação de atribuir nem de conferir", () => {
    render(<AnomaliasTabela {...props({ podeEditar: false })} />);
    expect(screen.getByText("Saída sem equipamento identificado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Atribuir equipamento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar como conferida" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("com editar, só a D1 oferece atribuir equipamento", () => {
    render(<AnomaliasTabela {...props()} />);
    expect(screen.getAllByRole("button", { name: "Atribuir equipamento" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Marcar como conferida" })).toHaveLength(2);
  });

  it("filtro de detector vindo da URL esconde as outras", () => {
    render(<AnomaliasTabela {...props({ detector: "D2" })} />);
    expect(screen.queryByText("Saída sem equipamento identificado")).not.toBeInTheDocument();
    expect(screen.getByText("R$/L acima da média para Diesel S10")).toBeInTheDocument();
  });

  it("atribuir sem escolher equipamento não chama a action", async () => {
    render(<AnomaliasTabela {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Atribuir equipamento" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Atribuir" }));
    await waitFor(() => expect(atribuirEquipamento).not.toHaveBeenCalled());
  });
});
