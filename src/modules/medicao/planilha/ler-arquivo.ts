import "server-only";

import ExcelJS from "exceljs";

import { lerCelula } from "./leitor";
import type { LinhaBruta } from "./montagem";

/**
 * Lê o xlsx oficial DEPOIS que ele está no Storage (o servidor baixa, spec 6.1). O navegador só
 * escolhe aba e colunas; os números saem daqui.
 */

export interface Mapeamento {
  aba: string;
  linhaCabecalho: number;
  colunas: { codigo: number; descricao: number; unidade: number; preco: number; quantidade: number; valor: number | null };
}

export interface AbaPrevia {
  nome: string;
  linhas: { numero: number; celulas: string[] }[];
  sugestao: Mapeamento | null;
}

/** Colunas mostradas na prévia de cada aba (e oferecidas no mapeamento). */
export const COLUNAS_DA_PREVIA = 30;

export async function abrirPlanilha(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

function textoDaCelula(valor: ExcelJS.CellValue): string {
  const c = lerCelula(valor);
  if (c.tipo === "numero") return c.texto;
  if (c.tipo === "texto" || c.tipo === "erro" || c.tipo === "numero_fora_da_faixa") return c.bruto;
  if (c.tipo === "formula_sem_valor") return "(fórmula sem valor)";
  return "";
}

export function previaDasAbas(wb: ExcelJS.Workbook, linhasPorAba = 40): AbaPrevia[] {
  return wb.worksheets.map((ws) => {
    const linhas: AbaPrevia["linhas"] = [];
    for (let n = 1; n <= Math.min(ws.rowCount, linhasPorAba); n++) {
      const row = ws.getRow(n);
      const celulas: string[] = [];
      for (let c = 1; c <= Math.min(ws.columnCount, COLUNAS_DA_PREVIA); c++) celulas.push(textoDaCelula(row.getCell(c).value));
      linhas.push({ numero: n, celulas });
    }
    return { nome: ws.name, linhas, sugestao: sugerirMapeamento(ws.name, linhas) };
  });
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

const PADROES: Record<keyof Mapeamento["colunas"], RegExp> = {
  codigo: /^(item|codigo|cod\.?)$/,
  descricao: /^(discriminacao|descricao|servico|servicos)/,
  unidade: /^(unid\.?|unidade|und\.?|un\.?)$/,
  preco: /preco\s*unit/,
  quantidade: /^(quant|qtd)/,
  valor: /^valor\s*(previsto|total|contratual)?/,
};

export function sugerirMapeamento(aba: string, linhas: { numero: number; celulas: string[] }[]): Mapeamento | null {
  for (const linha of linhas) {
    const achou = (padrao: RegExp) => linha.celulas.findIndex((c) => padrao.test(norm(c))) + 1;
    const colunas = {
      codigo: achou(PADROES.codigo), descricao: achou(PADROES.descricao), unidade: achou(PADROES.unidade),
      preco: achou(PADROES.preco), quantidade: achou(PADROES.quantidade), valor: achou(PADROES.valor) || null,
    };
    if (colunas.codigo && colunas.descricao && colunas.unidade && colunas.preco && colunas.quantidade) {
      return { aba, linhaCabecalho: linha.numero, colunas };
    }
  }
  return null;
}

export function lerLinhasBrutas(wb: ExcelJS.Workbook, mapa: Mapeamento): LinhaBruta[] {
  const ws = wb.getWorksheet(mapa.aba);
  if (!ws) throw new Error(`A aba ${mapa.aba} não existe no arquivo`);
  const linhas: LinhaBruta[] = [];
  for (let n = mapa.linhaCabecalho + 1; n <= ws.rowCount; n++) {
    const row = ws.getRow(n);
    const cel = (coluna: number) => lerCelula(row.getCell(coluna).value);
    linhas.push({
      linhaOrigem: n,
      oculta: row.hidden === true,
      codigo: cel(mapa.colunas.codigo),
      descricao: cel(mapa.colunas.descricao),
      unidade: cel(mapa.colunas.unidade),
      preco: cel(mapa.colunas.preco),
      quantidade: cel(mapa.colunas.quantidade),
      valor: mapa.colunas.valor ? cel(mapa.colunas.valor) : null,
      colunas: { codigo: mapa.colunas.codigo, preco: mapa.colunas.preco, quantidade: mapa.colunas.quantidade, valor: mapa.colunas.valor },
    });
  }
  return linhas;
}
