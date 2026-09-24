import ExcelJS from "exceljs";

import { escreverCabecalhoMarca, estilizarCabecalhoColunas } from "@/lib/planilha-marca";
import {
  percentual,
  type Agregado,
  type DadosRelatorioPedidos,
} from "@/modules/frete/pedidos-material/relatorio";

/**
 * O Excel "Relatório de Pedidos de Material" da origem (pedidosMaterialExport.ts): aba
 * "Resumo" com filtros, KPIs (Pedidos, Itens, Qtd. Total, Valor Total) e as tabelas POR
 * FORNECEDOR e POR MATERIAL; aba "Detalhamento" com Data, Fornecedor, Material, Quantidade,
 * Valor Unit. (4 casas), Subtotal e Observações, e o rodapé TOTAL (N itens). A moldura é a
 * do ERP (cabeçalho de marca em cada aba).
 *
 * **Módulo de servidor**: puxa o exceljs. A action o carrega por `await import`.
 */

const FORMATO = {
  inteiro: "0",
  quantidade: "#,##0.00",
  dinheiro: '"R$" #,##0.00',
  preco: '"R$" #,##0.0000',
  percentual: "0.0%",
  data: "dd/mm/yyyy",
} as const;

function diaParaCelula(dia: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function negrito(linha: ExcelJS.Row): void {
  linha.eachCell((c) => {
    c.font = { ...(c.font ?? {}), bold: true };
  });
}

function miniTabela(ws: ExcelJS.Worksheet, titulo: string, rotulo: string, agregados: Agregado[]): void {
  ws.addRow([]);
  negrito(ws.addRow([titulo]));
  const cabecalho = ws.addRow([rotulo, "Itens", "Quantidade", "Valor Total", "% Qtd", "% Valor"]);
  estilizarCabecalhoColunas(cabecalho);
  const totalQtd = agregados.reduce((s, a) => s + a.quantidade, 0);
  const totalValor = agregados.reduce((s, a) => s + a.valor, 0);
  for (const a of agregados) {
    const linha = ws.addRow([
      a.chave,
      a.registros,
      a.quantidade,
      a.valor,
      percentual(a.quantidade, totalQtd),
      percentual(a.valor, totalValor),
    ]);
    linha.getCell(2).numFmt = FORMATO.inteiro;
    linha.getCell(3).numFmt = FORMATO.quantidade;
    linha.getCell(4).numFmt = FORMATO.dinheiro;
    linha.getCell(5).numFmt = FORMATO.percentual;
    linha.getCell(6).numFmt = FORMATO.percentual;
  }
  const total = ws.addRow(["Total", agregados.reduce((s, a) => s + a.registros, 0), totalQtd, totalValor, "", ""]);
  total.getCell(2).numFmt = FORMATO.inteiro;
  total.getCell(3).numFmt = FORMATO.quantidade;
  total.getCell(4).numFmt = FORMATO.dinheiro;
  negrito(total);
}

export function montarPlanilhaPedidos(dados: DadosRelatorioPedidos, filtros: [string, string][]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ERP EMT";
  wb.created = new Date();

  // --- Resumo ---
  const resumo = wb.addWorksheet("Resumo");
  escreverCabecalhoMarca(wb, resumo, { titulo: "Relatório de Pedidos de Material", colunas: 6 });
  resumo.columns = [{ width: 36 }, { width: 12 }, { width: 16 }, { width: 18 }, { width: 10 }, { width: 10 }];
  negrito(resumo.addRow(["Relatório de Pedidos de Material"]));
  resumo.addRow(["Módulo de Frete"]);
  if (filtros.length > 0) {
    resumo.addRow([]);
    negrito(resumo.addRow(["Filtros"]));
    for (const [rotulo, valor] of filtros) resumo.addRow([rotulo, valor]);
  }
  resumo.addRow([]);
  const kpis = resumo.addRow(["Pedidos", "Itens", "Qtd. Total", "Valor Total"]);
  estilizarCabecalhoColunas(kpis);
  const valoresKpi = resumo.addRow([dados.pedidos, dados.itens.length, dados.quantidadeTotal, dados.valorTotal]);
  valoresKpi.getCell(1).numFmt = FORMATO.inteiro;
  valoresKpi.getCell(2).numFmt = FORMATO.inteiro;
  valoresKpi.getCell(3).numFmt = FORMATO.quantidade;
  valoresKpi.getCell(4).numFmt = FORMATO.dinheiro;
  miniTabela(resumo, "POR FORNECEDOR", "Fornecedor", dados.porFornecedor);
  miniTabela(resumo, "POR MATERIAL", "Material", dados.porMaterial);

  // --- Detalhamento ---
  const det = wb.addWorksheet("Detalhamento");
  const linhaCabecalho = escreverCabecalhoMarca(wb, det, { titulo: "Detalhamento dos Pedidos", colunas: 7 });
  det.columns = [
    { width: 12 },
    { width: 30 },
    { width: 30 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 34 },
  ];
  const cab = det.getRow(linhaCabecalho);
  cab.values = ["Data", "Fornecedor", "Material", "Quantidade", "Valor Unit.", "Subtotal", "Observações"];
  estilizarCabecalhoColunas(cab);
  det.views = [{ state: "frozen", ySplit: linhaCabecalho }];
  for (const i of dados.itens) {
    const linha = det.addRow([
      diaParaCelula(i.data),
      i.fornecedor,
      i.material,
      i.quantidade,
      i.valorUnitario,
      i.subtotal,
      i.observacoes,
    ]);
    linha.getCell(1).numFmt = FORMATO.data;
    linha.getCell(4).numFmt = FORMATO.quantidade;
    linha.getCell(5).numFmt = FORMATO.preco;
    linha.getCell(6).numFmt = FORMATO.dinheiro;
  }
  const n = dados.itens.length;
  const rodape = det.addRow([
    "",
    `TOTAL (${n} ${n === 1 ? "item" : "itens"})`,
    "",
    dados.quantidadeTotal,
    "",
    dados.valorTotal,
    "",
  ]);
  rodape.getCell(4).numFmt = FORMATO.quantidade;
  rodape.getCell(6).numFmt = FORMATO.dinheiro;
  negrito(rodape);

  return wb;
}
