import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CustoGrupoTabela } from "@/modules/financeiro/relatorios/components/custo-grupo-tabela";
import type { CustoPorGrupo } from "@/modules/financeiro/relatorios/queries";

/**
 * O nível de insumo é uma Server Action chamada ao abrir a subcategoria. Fora de
 * uma requisição ela não existe, então aqui ela devolve a linha de diesel: 1.250
 * litros por R$ 8.000,00, num mês de R$ 40.000,00.
 *
 * Os números foram escolhidos para o defeito não poder passar por acidente: a
 * QUANTIDADE (1.250) e o PERCENTUAL (20,0%) são visivelmente diferentes, então
 * uma célula com o número errado não se confunde com a certa.
 */
vi.mock("@/modules/financeiro/relatorios/actions", () => ({
  insumosDaSubcategoria: vi.fn(async () => ({
    insumos: [{ nome: "Óleo diesel S10", quantidade: 1250, valor: 8000 }],
  })),
}));

const CUSTO: CustoPorGrupo = {
  total: 40000,
  grupos: [
    {
      grupoId: "grupo-material",
      nome: "Material",
      cor: "ambar",
      valor: 30000,
      subcategorias: [
        { categoriaId: "cat-combustivel", nome: "Combustível", valor: 12000 },
      ],
    },
  ],
};

/** Abre os dois níveis e espera a linha do insumo chegar. */
async function abrirAteOInsumo() {
  render(<CustoGrupoTabela custo={CUSTO} mes="2026-08" podeVerLancamentos />);
  fireEvent.click(screen.getByLabelText("Abrir Material"));
  fireEvent.click(screen.getByLabelText("Abrir Combustível"));
  await waitFor(() => {
    expect(screen.getByText("Óleo diesel S10")).toBeTruthy();
  });
}

/** As células de uma linha, pelo texto da primeira coluna. */
function celulasDaLinha(rotulo: string): string[] {
  const celula = screen.getByText(rotulo).closest("td");
  const linha = celula?.closest("tr");
  return [...(linha?.querySelectorAll("td") ?? [])].map(
    (td) => td.textContent ?? "",
  );
}

/** A ordem dos cabeçalhos, que é quem dá nome a cada célula acima. */
function cabecalhos(): string[] {
  return [...document.querySelectorAll("th")].map((th) => th.textContent ?? "");
}

afterEach(() => cleanup());

describe("CustoGrupoTabela: cada número embaixo do cabeçalho dele", () => {
  it("o insumo põe a quantidade em Quantidade e o percentual em % do mês", async () => {
    // O defeito: a linha de insumo escrevia `formatarQuantidade(quantidade)`
    // debaixo do cabeçalho "% do mês", onde grupo e subcategoria mostravam
    // percentual. Litros de diesel lidos como participação no mês.
    await abrirAteOInsumo();

    const colunas = cabecalhos();
    const quantidade = colunas.indexOf("Quantidade");
    const percentual = colunas.indexOf("% do mês");
    const custo = colunas.indexOf("Custo");

    const linha = celulasDaLinha("Óleo diesel S10");
    expect(linha[quantidade]).toBe("1.250");
    // 8.000 de 40.000 = 20%. É o mesmo denominador dos dois níveis de cima.
    expect(linha[percentual]).toBe("20,0%");
    expect(linha[custo]).toContain("8.000,00");
  });

  it("grupo e subcategoria não inventam quantidade", async () => {
    // Somar litro de diesel com hora de máquina daria um número que não existe.
    // A célula diz "não informado" (a CelulaVazia canônica) em vez de somar.
    await abrirAteOInsumo();

    const quantidade = cabecalhos().indexOf("Quantidade");
    expect(celulasDaLinha("Material")[quantidade]).toBe("—");
    expect(celulasDaLinha("Combustível")[quantidade]).toBe("—");
  });

  it("o percentual existe nos três níveis, com o total do mês no denominador", async () => {
    await abrirAteOInsumo();

    const percentual = cabecalhos().indexOf("% do mês");
    expect(celulasDaLinha("Material")[percentual]).toBe("75,0%");
    expect(celulasDaLinha("Combustível")[percentual]).toBe("30,0%");
    expect(celulasDaLinha("Óleo diesel S10")[percentual]).toBe("20,0%");
  });

  it("a tabela rola em vez de cortar", () => {
    // Era a única das nove feita com `<table>` cru, dentro de um
    // `overflow-hidden`: com o recuo do terceiro nível e nome de insumo
    // comprido, o conteúdo era clipado sem barra para chegar nele. O contêiner
    // do `Table` canônico é quem traz o `overflow-x-auto`.
    const { container } = render(
      <CustoGrupoTabela custo={CUSTO} mes="2026-08" podeVerLancamentos />,
    );

    const tabela = container.querySelector("table");
    expect(tabela).not.toBeNull();
    // O canônico se identifica pelo data-slot; o contêiner dele é o pai direto.
    expect(tabela?.getAttribute("data-slot")).toBe("table");
    const contorno = tabela?.parentElement;
    expect(contorno?.getAttribute("data-slot")).toBe("table-container");
    expect(contorno?.className).toContain("overflow-x-auto");
    // E nenhum ancestral pode voltar a esconder o transbordo.
    expect(contorno?.parentElement?.className).not.toContain("overflow-hidden");
  });
});
