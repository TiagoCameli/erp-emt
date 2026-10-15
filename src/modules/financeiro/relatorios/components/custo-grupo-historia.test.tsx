import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CustoGrupoHistoria } from "@/modules/financeiro/relatorios/components/custo-grupo-historia";
import type { CustoPorGrupo } from "@/modules/financeiro/relatorios/queries";

afterEach(cleanup);

// jsdom não tem IntersectionObserver, que o `whileInView` do motion usa.
class SemObservar {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver ??= SemObservar as unknown as typeof IntersectionObserver;

const custo = (combustivel: number, folha: number, material: number): CustoPorGrupo => ({
  total: combustivel + folha + material,
  grupos: [
    { grupoId: "m", nome: "Material", cor: "ambar", valor: material, subcategorias: [] },
    {
      grupoId: null,
      nome: "Sem insumo (lançamento avulso)",
      cor: "neutro",
      valor: combustivel + folha,
      subcategorias: [],
      categorias: [
        { categoriaId: "c", nome: "Combustível", valor: combustivel },
        { categoriaId: "f", nome: "Folha", valor: folha },
      ],
    },
  ],
});

const texto = (el: HTMLElement) => (el.textContent ?? "").replace(/\s/g, " ");

describe("CustoGrupoHistoria", () => {
  it("conta o total, a variação contra o anterior e quanto é sem insumo", () => {
    render(
      <CustoGrupoHistoria
        custo={custo(600, 300, 100)}
        anterior={custo(200, 400, 200)}
        descricaoPeriodo="Mês de referência 09/2026"
        descricaoAnterior="Mês de referência 08/2026"
        serie={[]}
      />,
    );
    const corpo = texto(document.body);
    expect(corpo).toContain("Mês de referência 09/2026: custo de R$ 1.000,00, 25% acima do período anterior");
    expect(corpo).toContain("90% é lançamento avulso");
  });

  it("o que mais subiu: só altas, por categoria do sem insumo e por grupo", () => {
    render(
      <CustoGrupoHistoria
        custo={custo(600, 300, 100)}
        anterior={custo(200, 400, 200)}
        descricaoPeriodo="x"
        descricaoAnterior="y"
        serie={[
          { mes: "2026-08", total: 10 },
          { mes: "2026-09", total: 20 },
        ]}
      />,
    );
    const subiu = screen.getByRole("region", { name: /O que mais subiu/ });
    const itens = within(subiu).getAllByRole("listitem");
    expect(itens).toHaveLength(1);
    expect(texto(itens[0])).toContain("Combustível");
    expect(texto(itens[0])).toContain("+R$ 400,00");
    expect(screen.getByRole("region", { name: /Mês a mês/ })).toBeTruthy();
  });
});
