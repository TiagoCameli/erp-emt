// @vitest-environment node
import { describe, expect, it } from "vitest";

import { FILTROS_VAZIOS } from "@/modules/frete/fretes/filtros";
import { frete } from "@/modules/frete/fretes/fixture-frete";
import {
  agruparFretes,
  COLUNAS_DETALHAMENTO,
  filtrosDescritos,
  linhasMiniTabela,
  montarPlanilhaFretes,
  nomeArquivoFretes,
  precoUnitarioPlanilha,
} from "@/modules/frete/fretes/planilha";

describe("exportação de fretes (utils/freteExport.ts)", () => {
  const fretes = [
    frete({ id: "a", transportadoraNome: "Alfa", pesoToneladas: 10, valorTotal: 100 }),
    frete({ id: "b", transportadoraNome: "Beta", pesoToneladas: 30, valorTotal: 300 }),
    frete({ id: "c", transportadoraNome: "Alfa", pesoToneladas: 20, valorTotal: 50 }),
  ];

  it("agrupa por chave e ordena por valor desc", () => {
    expect(agruparFretes(fretes, (f) => f.transportadoraNome)).toEqual([
      { chave: "Beta", registros: 1, peso: 30, valor: 300 },
      { chave: "Alfa", registros: 2, peso: 30, valor: 150 },
    ]);
  });

  it("mini-tabela: % sobre o grupo inteiro, total só do que aparece (TOP N)", () => {
    const ags = agruparFretes(fretes, (f) => f.id);
    const { linhas, total } = linhasMiniTabela(ags, 1);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ chave: "b", pctPeso: 30 / 60, pctValor: 300 / 450 });
    expect(total).toEqual({ registros: 1, peso: 30, valor: 300 });
  });

  it("preço unit. do material com 4 casas, zero sem os dois", () => {
    expect(precoUnitarioPlanilha(1000, 3)).toBe(333.3333);
    expect(precoUnitarioPlanilha(0, 3)).toBe(0);
    expect(precoUnitarioPlanilha(10, 0)).toBe(0);
  });

  it("colunas do Detalhamento como a origem", () => {
    expect(COLUNAS_DETALHAMENTO.map((c) => c.cabecalho)).toEqual([
      "Saída",
      "Chegada",
      "Tipo",
      "Origem",
      "Destino",
      "Transportadora",
      "Motorista",
      "Placa",
      "Material",
      "Peso (t)",
      "KM",
      "R$/TKM",
      "Valor Total",
      "Preço Material",
      "Preço Unit. Material (R$/t)",
      "NF",
      "NF 2",
      "ID",
      "Observações",
    ]);
  });

  it("filtros descritos com os nomes", () => {
    expect(
      filtrosDescritos({ ...FILTROS_VAZIOS, tipo: "material", transportadoraId: "t1", de: "2026-09-01" }, [frete()]),
    ).toEqual([
      ["Tipo", "Material"],
      ["Transportadora", "Transp 1"],
      ["Data início", "01/09/2026"],
    ]);
  });

  it("workbook com Resumo e Detalhamento; o TOTAL soma peso, valor e material", () => {
    const wb = montarPlanilhaFretes(fretes, FILTROS_VAZIOS, "2026-09-24");
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumo", "Detalhamento"]);
    const det = wb.getWorksheet("Detalhamento");
    const ultima = det?.getRow(det.rowCount);
    expect(ultima?.getCell(5).value).toBe("TOTAL (3 registros)");
    expect(ultima?.getCell(10).value).toBe(60);
    expect(ultima?.getCell(13).value).toBe(450);
    expect(ultima?.getCell(14).value).toBe(2400);
    expect(nomeArquivoFretes("2026-09-24")).toBe("fretes-2026-09-24.xlsx");
  });
});
