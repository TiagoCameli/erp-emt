import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

/**
 * Quadro de alocação (v1.30): uma linha por pessoa, edição pela grade, um lote só ao salvar, e a
 * máquina para duas pessoas barrada antes de chegar ao banco.
 */

const erro = vi.fn();
vi.mock("@/components/canonicos/toast", () => ({
  toast: { error: (m: string) => erro(m), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { QuadroAlocacao } from "@/modules/mapa/components/quadro-alocacao";
import type { EquipamentoMapa, PessoaMapa } from "@/modules/mapa/tipos";

afterEach(() => {
  cleanup();
  erro.mockClear();
});

const pessoa = (id: string, nome: string, extra: Partial<PessoaMapa> = {}) =>
  ({
    id,
    nome,
    funcao: "Servente",
    obraId: null,
    obraMapaId: null,
    localidadeId: null,
    equipamentoId: null,
    areaId: null,
    centroCustoId: null,
    centroCustoNome: "",
    ...extra,
  }) as unknown as PessoaMapa;
const PESSOAS = [
  pessoa("a", "Ana"),
  pessoa("b", "Bruno"),
  pessoa("c", "Caio", { localidadeId: "silo" }),
  pessoa("d", "Davi"),
  pessoa("e", "Edu"),
];
const MAQUINAS = [
  {
    id: "m1",
    codigo: "CB-001",
    descricao: "Escavadeira",
    obraId: null,
    obraNome: "",
    localidadeNome: "",
    operadorId: null,
    operadorNome: "",
  } as unknown as EquipamentoMapa,
];

function abrir(pedido: Parameters<typeof QuadroAlocacao>[0]["pedido"]) {
  const onSalvar = vi.fn(async () => true);
  render(
    <QuadroAlocacao
      pedido={pedido}
      onFechar={vi.fn()}
      telaLarga
      pessoas={PESSOAS}
      maquinas={MAQUINAS}
      localidades={[{ id: "silo", nome: "Silo" } as never]}
      obras={[]}
      centrosCusto={[{ id: "cc1", nome: "Obra BR-364" }]}
      salvando={false}
      onSalvar={onSalvar}
    />,
  );
  return onSalvar;
}

function editar(nome: string, colunas: number, rotuloCampo: string, valor: string) {
  const grade = screen.getByRole("grid");
  fireEvent.click(within(grade).getByText(nome));
  for (let i = 0; i < colunas; i++) fireEvent.keyDown(grade, { key: "ArrowRight" });
  fireEvent.keyDown(grade, { key: "x" });
  const lista = screen.getByRole("combobox", { name: rotuloCampo });
  fireEvent.change(lista, { target: { value: valor } });
  fireEvent.keyDown(lista, { key: "Enter" });
}

describe("QuadroAlocacao", () => {
  it("mostra as 5 pessoas; 'Alocar' da seleção mostra só as escolhidas", () => {
    abrir({});
    for (const p of PESSOAS) expect(screen.getByText(p.nome)).toBeTruthy();
    cleanup();
    abrir({ idsPessoas: ["a", "d"] });
    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.queryByText("Bruno")).toBeNull();
    expect(screen.getByText("2 da seleção")).toBeTruthy();
  });

  it("'sem alocação' esconde quem já tem local", () => {
    abrir({ soSemAlocacao: true });
    expect(screen.queryByText("Caio")).toBeNull();
    expect(screen.getByText("Ana")).toBeTruthy();
  });

  it("edições viram um lote só, uma linha por pessoa", async () => {
    const onSalvar = abrir({});
    editar("Ana", 4, "Centro de custo, linha 1", "cc1");
    editar("Ana", 2, "Máquina, linha 1", "m1");
    expect(screen.getByText("1 pessoa alterada")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salvar alocação" }));
    expect(onSalvar).toHaveBeenCalledWith([
      { colaboradorId: "a", centroCustoId: "cc1", equipamentoId: "m1" },
    ]);
  });

  it("a mesma máquina para duas pessoas não vai para o banco", () => {
    const onSalvar = abrir({});
    editar("Ana", 2, "Máquina, linha 1", "m1");
    editar("Bruno", 2, "Máquina, linha 2", "m1");
    fireEvent.click(screen.getByRole("button", { name: "Salvar alocação" }));
    expect(onSalvar).not.toHaveBeenCalled();
    expect(erro).toHaveBeenCalledWith(
      "CB-001 ficou com duas pessoas: um operador por máquina.",
    );
  });
});
