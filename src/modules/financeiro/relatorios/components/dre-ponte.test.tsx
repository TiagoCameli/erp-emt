import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { agruparDrePorNatureza } from "@/modules/financeiro/relatorios/calculo";
import { DrePonte } from "@/modules/financeiro/relatorios/components/dre-ponte";
import { ponteDoResultado } from "@/modules/financeiro/relatorios/ponte-do-resultado";

afterEach(cleanup);

// jsdom não tem IntersectionObserver, que o `whileInView` do motion usa.
class SemObservar {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver ??= SemObservar as unknown as typeof IntersectionObserver;

const dre = agruparDrePorNatureza([
  { tipo: "a_receber", natureza: "operacional", categoria: "Medições de obra", categoria_id: "m", total: "1000.00", retencao: "100.00" },
  { tipo: "a_pagar", natureza: "operacional", categoria: "Materiais", categoria_id: "d", total: "600.00" },
  { tipo: "a_pagar", natureza: "financeira", categoria: "Tarifa Bancária", categoria_id: "t", total: "50.00" },
  { tipo: "a_pagar", natureza: "distribuicao", categoria: "Distribuição a sócio", categoria_id: "s", total: "200.00" },
]);

describe("DrePonte", () => {
  it("conta a história e mostra cada degrau com o valor", () => {
    render(<DrePonte ponte={ponteDoResultado(dre)} />);
    expect(screen.getByText(/^Da receita líquida de/)).toBeTruthy();
    const ponte = screen.getByRole("figure", { name: "Ponte do resultado" });
    const degraus = within(ponte).getAllByRole("listitem").filter((li) => li.title);
    expect(degraus.map((li) => li.title.split(":")[0])).toEqual([
      "Receita bruta",
      "Retenções na fonte",
      "Receita líquida",
      "Materiais",
      "Resultado operacional",
      "Resultado financeiro",
      "Resultado do período",
      "Distribuições a sócios",
      "Sobra depois de investir e retirar",
    ]);
    expect(screen.getByText("Para onde foi o resultado")).toBeTruthy();
  });

  it("sem investimento, sócio nem mútuo, não abre a parte do destino", () => {
    const soObra = agruparDrePorNatureza([
      { tipo: "a_receber", natureza: "operacional", categoria: "Medições de obra", categoria_id: "m", total: "1000.00" },
    ]);
    render(<DrePonte ponte={ponteDoResultado(soObra)} />);
    expect(screen.queryByText("Para onde foi o resultado")).toBeNull();
  });
});
