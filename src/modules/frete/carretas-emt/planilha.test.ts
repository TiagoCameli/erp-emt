// @vitest-environment node
import type ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { LINHAS_CABECALHO_MARCA } from "@/lib/planilha-marca";
import { montarPainel } from "@/modules/frete/carretas-emt/calculo";
import { montarPlanilhaCarretas } from "@/modules/frete/carretas-emt/planilha";

import { base } from "./fixture-carretas";

describe("montarPlanilhaCarretas", () => {
  const painel = montarPainel(base(), { de: "2026-08", ate: "2026-09", placa: "" }, "2026-09");
  const workbook = montarPlanilhaCarretas(painel);

  it("tem as quatro abas da tela", () => {
    expect(workbook.worksheets.map((w) => w.name)).toEqual(["Desempenho", "Mês a mês", "Financiamentos", "Gastos por categoria"]);
  });

  it("escreve os mesmos números do painel, com o formato de reais", () => {
    const ws = workbook.getWorksheet("Desempenho")!;
    const cabecalho = ws.getRow(LINHAS_CABECALHO_MARCA + 1);
    expect(cabecalho.getCell(1).value).toBe("Indicador");
    expect(cabecalho.getCell(2).value).toBe("SQS7E01");
    const colunaTotal = painel.desempenhos.length + 2;
    expect(cabecalho.getCell(colunaTotal).value).toBe("Total");
    let final: ExcelJS.Row | undefined;
    ws.eachRow((linha) => {
      if (linha.getCell(1).value === "Resultado final") final = linha;
    });
    expect(final?.getCell(colunaTotal).value).toBe(painel.total.resultadoFinal);
    expect(final?.getCell(2).numFmt).toContain("R$");

    const mensal = workbook.getWorksheet("Mês a mês")!;
    expect(mensal.getRow(LINHAS_CABECALHO_MARCA + 2).getCell(1).value).toBe("ago/26");
  });

  it("gera o arquivo", async () => {
    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });
});
