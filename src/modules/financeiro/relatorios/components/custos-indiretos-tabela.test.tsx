import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CustosIndiretosTabela } from "@/modules/financeiro/relatorios/components/custos-indiretos-tabela";
import type { CustoIndiretoLinha } from "@/modules/financeiro/relatorios/custos-indiretos";

afterEach(cleanup);

const ESCRITORIO = "11111111-1111-4111-8111-111111111111";
const ADMINISTRATIVO = "22222222-2222-4222-8222-222222222222";
const COLORADO = "33333333-3333-4333-8333-333333333333";
const ALUGUEL = "55555555-5555-4555-8555-555555555555";
const DIESEL = "66666666-6666-4666-8666-666666666666";

const linha = (parcial: Partial<CustoIndiretoLinha>): CustoIndiretoLinha => ({
  mes: "2026-01-01",
  raizId: ESCRITORIO,
  raiz: "Escritório Central",
  centroId: ESCRITORIO,
  centro: "Escritório Central",
  categoriaId: ALUGUEL,
  categoria: "Aluguel",
  total: 0,
  ...parcial,
});

const LINHAS: CustoIndiretoLinha[] = [
  linha({ total: 1000 }),
  linha({ centroId: ADMINISTRATIVO, centro: "Administrativo", mes: "2026-02-01", total: 2000 }),
  linha({
    raizId: COLORADO,
    raiz: "002 - Equipamentos Colorado 2026",
    centroId: COLORADO,
    centro: "002 - Equipamentos Colorado 2026",
    categoriaId: DIESEL,
    categoria: "Diesel",
    mes: "2026-03-01",
    total: 1000,
  }),
];

const texto = (el: HTMLElement) => (el.textContent ?? "").replace(/\s/g, " ");

describe("CustosIndiretosTabela", () => {
  it("colunas de janeiro até o mês corrente, mais o total", () => {
    render(<CustosIndiretosTabela ano={2026} linhas={LINHAS} mesCorrente="2026-04" />);
    const [porCentro] = screen.getAllByRole("table");
    const cabecalho = within(porCentro).getAllByRole("columnheader").map((c) => c.textContent);
    expect(cabecalho).toEqual(["Centro", "Jan", "Fev", "Mar", "Abr", "Total"]);
  });

  it("ano passado mostra os doze meses", () => {
    render(<CustosIndiretosTabela ano={2025} linhas={LINHAS} mesCorrente="2026-04" />);
    const [porCentro] = screen.getAllByRole("table");
    expect(within(porCentro).getAllByRole("columnheader")).toHaveLength(14);
  });

  it("agrupa pela raiz com subtotal e mostra zero como traço", () => {
    render(<CustosIndiretosTabela ano={2026} linhas={LINHAS} mesCorrente="2026-04" />);
    const [porCentro] = screen.getAllByRole("table");
    const raiz = within(porCentro).getAllByRole("row", { name: /^Escritório Central/ })[0];
    expect(texto(raiz)).toContain("R$ 1.000,00");
    expect(texto(raiz)).toContain("R$ 2.000,00");
    expect(texto(raiz)).toContain("R$ 3.000,00");
    const etapa = within(porCentro).getByRole("row", { name: /^Administrativo/ });
    expect(within(etapa).getAllByText("—")).toHaveLength(3);
  });

  it("linha de total geral", () => {
    render(<CustosIndiretosTabela ano={2026} linhas={LINHAS} mesCorrente="2026-04" />);
    const [porCentro] = screen.getAllByRole("table");
    const total = within(porCentro).getByRole("row", { name: /^Total/ });
    expect(texto(total)).toContain("R$ 4.000,00");
  });

  it("por categoria, do maior para o menor, com percentual", () => {
    render(<CustosIndiretosTabela ano={2026} linhas={LINHAS} mesCorrente="2026-04" />);
    const [, porCategoria] = screen.getAllByRole("table");
    const linhas = within(porCategoria).getAllByRole("row").slice(1);
    expect(texto(linhas[0])).toContain("Aluguel");
    expect(texto(linhas[0])).toContain("R$ 3.000,00");
    expect(texto(linhas[0])).toContain("75%");
    expect(texto(linhas[1])).toContain("Diesel");
    expect(texto(linhas[1])).toContain("25%");
  });

  it("sem linhas, estado vazio", () => {
    render(<CustosIndiretosTabela ano={2026} linhas={[]} mesCorrente="2026-04" />);
    expect(screen.getByText("Sem custo indireto em 2026")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
