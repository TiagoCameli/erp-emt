import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Quem opera uma máquina acompanha a máquina: a ficha não oferece local de trabalho (Tiago,
 * 17/10/2026). Sem máquina, o seletor de local continua.
 */

vi.mock("@/modules/mapa/components/centros-pessoa", () => ({
  useDiasPessoa: () => ({ resultado: null, recarregar: () => {} }),
  HistoricoLocal: () => <p>Sem local desde 14/10/2026</p>,
  CentrosPessoa: () => null,
}));

import { FichaPessoa } from "@/modules/mapa/components/ficha-pessoa";
import type { PessoaMapa } from "@/modules/mapa/tipos";

afterEach(cleanup);

function renderizar(
  equipamentoId: string | null,
  maquina: string | null,
  podeEditar = true,
) {
  const pessoa = {
    id: "p1",
    nome: "Jacson",
    equipamentoId,
    localidadeId: null,
    obraId: null,
    centroCustoId: null,
    centroCustoNome: "",
    pos: null,
  } as unknown as PessoaMapa;
  render(
    <FichaPessoa
      pessoa={pessoa}
      maquina={maquina}
      maquinas={[]}
      localidades={[]}
      obras={[]}
      centrosCusto={[]}
      podeEditar={podeEditar}
      salvando={false}
      posicionando={false}
      onFechar={vi.fn()}
      onFocar={vi.fn()}
      onTrocarLocal={vi.fn()}
      onTrocarObra={vi.fn()}
      onOperar={vi.fn()}
      onPosicionar={vi.fn()}
      onTrocarCentro={vi.fn()}
    />,
  );
}

describe("FichaPessoa: local de trabalho", () => {
  it("quem opera uma máquina acompanha a máquina, sem escolher local", () => {
    renderizar("e1", "CS-003");
    expect(screen.getByText("Acompanha CS-003")).toBeTruthy();
    expect(screen.queryByLabelText("Local de trabalho")).toBeNull();
    expect(screen.queryByText(/Sem local desde/)).toBeNull();
    expect(screen.getByText(/tire da máquina/)).toBeTruthy();
  });

  it("sem o código da máquina à mão, diz 'a máquina'", () => {
    renderizar("e1", null, false);
    expect(screen.getByText("Acompanha a máquina")).toBeTruthy();
    expect(screen.queryByText(/tire da máquina/)).toBeNull();
  });

  it("sem máquina, oferece o local de trabalho", () => {
    renderizar(null, null);
    expect(screen.getByLabelText("Local de trabalho")).toBeTruthy();
    expect(screen.queryByText(/^Acompanha/)).toBeNull();
  });
});
