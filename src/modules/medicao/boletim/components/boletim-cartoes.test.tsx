import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { BoletimCartoes } from "@/modules/medicao/boletim/components/boletim-cartoes";
import type { Boletim } from "@/modules/medicao/boletim/tipos";

afterEach(cleanup);

function boletim(over: Partial<Boletim> = {}): Boletim {
  return {
    contrato: { id: "k", codigo: "K", nome_obra: "Obra K", numero_contrato: null, contratante_nome: null, regra_arredondamento: "sem_arredondar" },
    versao: { id: "v0", numero: 0, vigente_desde: "2026-01-01" },
    ate: 2,
    medicoes: [
      { id: "m1", numero: 1, periodo_inicio: "2026-01-01", periodo_fim: "2026-01-31", status: "aprovada", valor: "50.51" },
      { id: "m2", numero: 2, periodo_inicio: "2026-02-01", periodo_fim: "2026-02-28", status: "em_conferencia", valor: "10.51" },
    ],
    linhas: [],
    fora_da_versao: [],
    total: { previsto: "123.02", valor_medicao: "10.51", acumulado: "61.01", saldo: "62.01", pct_executado: "0.4959356", pct_a_medir: "0.5040644" },
    ...over,
  };
}

function texto(): string {
  return (document.body.textContent ?? "").replace(/\s+/g, " ");
}

describe("BoletimCartoes", () => {
  it("cartões do total da RPC, com a Nª, o período e o status", () => {
    render(<BoletimCartoes boletim={boletim()} />);
    const t = texto();
    expect(t).toContain("R$ 123,02");
    expect(t).toContain("Acumulado até a 2ª");
    expect(t).toContain("R$ 61,01");
    expect(t).toMatch(/49,59 ?%/);
    expect(t).toContain("R$ 62,01");
    expect(t).toContain("2ª medição");
    expect(t).toContain("R$ 10,51");
    expect(t).toContain("01/02 a 28/02/2026");
    expect(screen.getByText("Em conferência")).toBeTruthy();
    expect(t).toContain("Versão v0 da planilha");
  });

  it("sem regra de arredondamento não vira R$ 0,00", () => {
    render(
      <BoletimCartoes
        boletim={boletim({
          total: { previsto: null, valor_medicao: null, acumulado: null, saldo: null, pct_executado: null, pct_a_medir: null },
        })}
      />,
    );
    expect(texto()).not.toContain("R$");
    expect(screen.getAllByText("Sem regra de arredondamento").length).toBeGreaterThanOrEqual(3);
  });

  it("contrato sem medição", () => {
    render(<BoletimCartoes boletim={boletim({ ate: null, medicoes: [] })} />);
    expect(texto()).toContain("Nenhuma medição");
    expect(texto()).toContain("Acumulado");
  });
});
