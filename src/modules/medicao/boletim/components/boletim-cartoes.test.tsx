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
      { id: "m1", numero: 1, periodo_inicio: "2026-01-01", periodo_fim: "2026-01-31", status: "aprovada", valor: "50.51", reajuste: null, reajuste_situacao: null },
      { id: "m2", numero: 2, periodo_inicio: "2026-02-01", periodo_fim: "2026-02-28", status: "em_conferencia", valor: "10.51", reajuste: null, reajuste_situacao: null },
    ],
    linhas: [],
    fora_da_versao: [],
    total: { previsto: "123.02", valor_medicao: "10.51", acumulado: "61.01", saldo: "62.01", pct_executado: "0.4959356", pct_a_medir: "0.5040644", reajuste_medicao: "0", reajuste_acumulado: "0" },
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
          total: { previsto: null, valor_medicao: null, acumulado: null, saldo: null, pct_executado: null, pct_a_medir: null, reajuste_medicao: null, reajuste_acumulado: null },
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

  it("Reajuste acumulado do L09 até a 4ª: -R$ 40.021,28 e, embaixo, o da 4ª", () => {
    render(
      <BoletimCartoes
        boletim={boletim({
          ate: 4,
          medicoes: [
            { id: "m4", numero: 4, periodo_inicio: "2026-02-01", periodo_fim: "2026-02-28", status: "aprovada", valor: "2615053.13", reajuste: "-40021.28", reajuste_situacao: "definitivo" },
          ],
          total: { ...boletim().total, reajuste_medicao: "-40021.28", reajuste_acumulado: "-40021.28" },
        })}
      />,
    );
    const cartao = screen.getByText("Reajuste acumulado").closest("[data-kpi]")!;
    const t = (cartao.textContent ?? "").replace(/\s+/g, " ");
    expect(t).toContain("-R$ 40.021,28");
    expect(t).toContain("na 4ª: -R$ 40.021,28");
    // Definitivo não ganha selo: só o provisório pede atenção.
    expect(t).not.toContain("Provisório");
  });

  it("até a 10ª com reajuste só na 4ª: acumulado do total e na 10ª R$ 0,00, com o selo quando provisório", () => {
    render(
      <BoletimCartoes
        boletim={boletim({
          ate: 10,
          medicoes: [
            { id: "m10", numero: 10, periodo_inicio: "2026-08-01", periodo_fim: "2026-08-31", status: "aprovada", valor: "680738.27", reajuste: "12.34", reajuste_situacao: "provisorio" },
          ],
          total: { ...boletim().total, reajuste_medicao: "0", reajuste_acumulado: "-40021.28" },
        })}
      />,
    );
    const cartao = screen.getByText("Reajuste acumulado").closest("[data-kpi]")!;
    const t = (cartao.textContent ?? "").replace(/\s+/g, " ");
    expect(t).toContain("-R$ 40.021,28");
    expect(t).toContain("na 10ª: R$ 0,00");
    expect(t).toContain("Provisório");
  });

  it("sem regra de arredondamento o reajuste não vira R$ 0,00", () => {
    render(
      <BoletimCartoes
        boletim={boletim({
          total: { previsto: null, valor_medicao: null, acumulado: null, saldo: null, pct_executado: null, pct_a_medir: null, reajuste_medicao: null, reajuste_acumulado: null },
        })}
      />,
    );
    const cartao = screen.getByText("Reajuste acumulado").closest("[data-kpi]")!;
    expect(cartao.textContent).not.toContain("R$");
  });
});
