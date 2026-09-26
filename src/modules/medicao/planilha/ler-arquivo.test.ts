// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { abrirPlanilha, lerLinhasBrutas, previaDasAbas, sugerirMapeamento } from "./ler-arquivo";

async function arquivo(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Planilha");
  ws.addRow(["CONSÓRCIO EMT-COLORADO I"]);
  ws.addRow([]);
  ws.addRow(["ITEM", "DISCRIMINAÇÃO", "UNID.", "PREÇO UNITÁRIO", "QUANTIDADE PREVISTA", "VALOR PREVISTO"]);
  ws.addRow(["02.07", "Pavimentação"]);
  ws.addRow(["02.07.04", "CBUQ", "t", 580.8642996, 17057.717, { formula: "D5*E5", result: 9908218.84 }]);
  ws.addRow(["02.07.05", "Imprimação", "m2 ", 4.5, 100, { formula: "D6*E6" }]);
  ws.getRow(6).hidden = true;
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

describe("ler-arquivo", () => {
  it("sugere o mapeamento pela linha de cabeçalho", async () => {
    const wb = await abrirPlanilha(await arquivo());
    const [aba] = previaDasAbas(wb);
    expect(aba.nome).toBe("Planilha");
    expect(aba.sugestao).toEqual({ aba: "Planilha", linhaCabecalho: 3,
      colunas: { codigo: 1, descricao: 2, unidade: 3, preco: 4, quantidade: 5, valor: 6 } });
  });

  it("lê do cabeçalho para baixo, com a casa escondida, a linha oculta e a fórmula sem valor", async () => {
    const wb = await abrirPlanilha(await arquivo());
    const mapa = sugerirMapeamento("Planilha", previaDasAbas(wb)[0].linhas);
    const linhas = lerLinhasBrutas(wb, mapa!);
    expect(linhas.map((l) => l.linhaOrigem)).toEqual([4, 5, 6]);
    expect(linhas[1].preco).toEqual({ tipo: "numero", texto: "580.8642996" });
    expect(linhas[1].valor).toEqual({ tipo: "numero", texto: "9908218.84" });
    expect(linhas[2]).toMatchObject({ oculta: true, unidade: { tipo: "texto", bruto: "m2 " }, valor: { tipo: "formula_sem_valor" } });
  });

  it("leva a coluna do código para o endereço do alerta", async () => {
    const wb = await abrirPlanilha(await arquivo());
    const linhas = lerLinhasBrutas(wb, sugerirMapeamento("Planilha", previaDasAbas(wb)[0].linhas)!);
    expect(linhas[0].colunas).toEqual({ codigo: 1, preco: 4, quantidade: 5, valor: 6 });
  });

  it("sem cabeçalho reconhecível não sugere nada", () => {
    expect(sugerirMapeamento("X", [{ numero: 1, celulas: ["a", "b"] }])).toBeNull();
  });
});
