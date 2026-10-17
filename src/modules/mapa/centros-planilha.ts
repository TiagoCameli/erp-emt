import ExcelJS from "exceljs";

import {
  escreverCabecalhoMarca,
  estilizarCabecalhoColunas,
} from "@/lib/planilha-marca";
import { rotuloPropriedadeRelatorio, type RelDiasCentro } from "@/modules/mapa/centros";
import type { RelDiasPessoa } from "@/modules/mapa/centros-pessoa";

/**
 * Planilha do relatório "Dias por centro de custo": uma linha por máquina, uma coluna por centro
 * (na ordem da tela), o total da máquina e a linha de totais por centro.
 */
export function montarPlanilhaDiasCentro(
  rel: RelDiasCentro,
  mesRotulo: string,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Dias por centro");
  const colunas = 3 + rel.centros.length + 1;
  const linhaCabecalho = escreverCabecalhoMarca(wb, ws, {
    titulo: `Dias de equipamento por centro de custo · ${mesRotulo}`,
    colunas,
  });

  const cabecalho = ws.getRow(linhaCabecalho);
  cabecalho.values = [
    "Código",
    "Equipamento",
    "Propriedade",
    ...rel.centros.map((c) => c.nome),
    "Total",
  ];
  estilizarCabecalhoColunas(cabecalho);

  let n = linhaCabecalho;
  for (const e of rel.equipamentos) {
    n += 1;
    ws.getRow(n).values = [
      e.codigo,
      e.descricao,
      rotuloPropriedadeRelatorio(e.propriedade),
      ...rel.centros.map((c) => e.dias[c.id] ?? 0),
      e.total,
    ];
  }
  n += 1;
  const totais = ws.getRow(n);
  totais.values = ["Total", "", "", ...rel.centros.map((c) => c.total), rel.total];
  totais.font = { bold: true };

  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 36;
  ws.getColumn(3).width = 20;
  for (let i = 4; i <= colunas; i += 1) ws.getColumn(i).width = 18;
  ws.views = [{ state: "frozen", ySplit: linhaCabecalho, xSplit: 2 }];
  return wb;
}

/**
 * Planilha do relatório "Dias de pessoa por centro": uma linha por pessoa, uma coluna por centro
 * (na ordem da tela), dias trabalhados, parados e o total.
 */
export function montarPlanilhaDiasPessoa(
  rel: RelDiasPessoa,
  mesRotulo: string,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Dias de pessoa");
  const colunas = 2 + rel.centros.length + 3;
  const linhaCabecalho = escreverCabecalhoMarca(wb, ws, {
    titulo: `Dias de pessoa por centro de custo · ${mesRotulo}`,
    colunas,
  });

  const cabecalho = ws.getRow(linhaCabecalho);
  cabecalho.values = [
    "Pessoa",
    "Função",
    ...rel.centros.map((c) => c.nome),
    "Trabalhados",
    "Parados",
    "Total",
  ];
  estilizarCabecalhoColunas(cabecalho);

  let n = linhaCabecalho;
  for (const p of rel.pessoas) {
    n += 1;
    ws.getRow(n).values = [
      p.nome,
      p.funcao,
      ...rel.centros.map((c) => p.dias[c.id] ?? 0),
      p.trabalhados,
      p.parados,
      p.total,
    ];
  }
  n += 1;
  const totais = ws.getRow(n);
  totais.values = [
    "Total",
    "",
    ...rel.centros.map((c) => c.total),
    rel.trabalhados,
    rel.parados,
    rel.total,
  ];
  totais.font = { bold: true };

  ws.getColumn(1).width = 36;
  ws.getColumn(2).width = 24;
  for (let i = 3; i <= colunas; i += 1) ws.getColumn(i).width = 16;
  ws.views = [{ state: "frozen", ySplit: linhaCabecalho, xSplit: 1 }];
  return wb;
}
