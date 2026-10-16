import ExcelJS from "exceljs";

import {
  escreverCabecalhoMarca,
  estilizarCabecalhoColunas,
} from "@/lib/planilha-marca";
import type { RelDiasCentro } from "@/modules/mapa/centros";
import { ROTULO_PROPRIEDADE, type Propriedade } from "@/modules/mapa/tipos";

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
      ROTULO_PROPRIEDADE[e.propriedade as Propriedade] ?? e.propriedade,
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
  ws.getColumn(3).width = 12;
  for (let i = 4; i <= colunas; i += 1) ws.getColumn(i).width = 18;
  ws.views = [{ state: "frozen", ySplit: linhaCabecalho, xSplit: 2 }];
  return wb;
}
