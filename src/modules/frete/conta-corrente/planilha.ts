import ExcelJS from "exceljs";

import { argb, CORES_MARCA, EMPRESA } from "@/config/marca";
import { formatarBRL, formatarDataHora } from "@/lib/formatadores";
import { escreverCabecalhoMarca, estilizarCabecalhoColunas, LINHAS_CABECALHO_MARCA } from "@/lib/planilha-marca";
import {
  categoriaDoTipo,
  dadosDaExportacao,
  dataDoMovimento,
  ehCredito,
  filtrosDaExportacao,
  memoriaDeCalculo,
  rotuloMetodo,
  ROTULO_CATEGORIA,
  somar,
  TIPO_LABEL,
  type MovimentoComSaldo,
  type MovimentoExtrato,
} from "@/modules/frete/conta-corrente/extrato";

/**
 * A planilha do extrato, com as 7 abas, as colunas e as FÓRMULAS VIVAS do
 * Gestão Obras (utils/extratoExport.ts, `montarExtratoWorkbook`): Resumo, Todos,
 * Fretes, Abastecimentos, Abast. Tanque, Pagamentos e Ajustes. Toda célula que a
 * origem calculava por fórmula continua fórmula, com o resultado junto (quem
 * abre num visualizador que não recalcula vê o número certo).
 *
 * O que muda, e por quê:
 * - A moldura: cada aba abre com o cabeçalho de marca do ERP (logo, razão
 *   social, a Pista), regra de todo documento que o sistema emite. Por isso os
 *   dados começam na linha 7 e não na 2; as fórmulas apontam para as linhas
 *   certas.
 * - A "Fórmula do Saldo do Período" da origem fazia Créditos − Pagamentos e
 *   deixava de fora os débitos de combustível e os ajustes a débito; o número
 *   guardado era o saldo verdadeiro, então a planilha recalculada mudava de
 *   valor sozinha. Aqui a segunda equação é Créditos − Débitos (a coluna
 *   Débito da aba Todos), que fecha com o saldo.
 * - "Preço Tanque/L" da aba Abast. Tanque cai no preço cobrado quando a dona
 *   não tem preço próprio, a mesma regra do crédito no banco
 *   (`coalesce(preco_proprietario, preco_combustivel)`); a origem mostrava 0 e a
 *   fórmula da linha não fechava.
 * - Datas no dia de Rio Branco (a origem cortava o ISO em UTC).
 * - Sem emoji nos títulos e "-" no lugar do travessão vazio.
 *
 * **Módulo de servidor**: puxa o exceljs. A action o carrega por `await import`.
 */

const COR = {
  verde: argb(CORES_MARCA.verde),
  verdeEscuro: argb(CORES_MARCA.verdeEscuro),
  verdeClaro: argb(CORES_MARCA.verdeLavado),
  branco: "FFFFFFFF",
  cinzaEscuro: "FF1F2937",
  cinzaMedio: "FF6B7280",
  cinzaClaro: "FFF3F4F6",
  zebra: "FFF9FAFB",
  borda: "FFE5E7EB",
};

interface TemaAba {
  title: string;
  header: string;
  cell: string;
}

/** As cores semânticas por aba da origem (TEMA de extratoExport.ts). */
const TEMA = {
  kpiSaldo: COR.verdeEscuro,
  kpiCreditos: "FF16A34A",
  kpiDebitos: "FFDC2626",
  kpiTotal: "FF2563EB",
  kpiFretes: "FF7C3AED",
  kpiPagamentos: "FFEA580C",
  fretes: { title: "FF16A34A", header: "FF15803D", cell: "FFF0FDF4" } as TemaAba,
  tanque: { title: "FF0891B2", header: "FF0E7490", cell: "FFECFEFF" } as TemaAba,
  pagamentos: { title: "FFDC2626", header: "FFB91C1C", cell: "FFFEF2F2" } as TemaAba,
  ajustes: { title: "FF7C3AED", header: "FF6D28D9", cell: "FFF5F3FF" } as TemaAba,
  abast: { title: "FFEA580C", header: "FFC2410C", cell: "FFFFF7ED" } as TemaAba,
  todos: { title: COR.verdeEscuro, header: "FF14532D", cell: "FFF0FDF4" } as TemaAba,
  abas7: { title: COR.verdeEscuro, header: "FF374151", cell: COR.branco } as TemaAba,
  badge: {
    emerald: { circle: "FF16A34A", bg: "FFDCFCE7" },
    red: { circle: "FFDC2626", bg: "FFFEE2E2" },
    blue: { circle: "FF2563EB", bg: "FFDBEAFE" },
  },
  pillBg: "FFDCFCE7",
  pillFg: "FF15803D",
};

const FMT_BRL = '"R$" #,##0.00';
const FMT_PRECO = '"R$" #,##0.0000';

function borda(): Partial<ExcelJS.Borders> {
  const fina = { style: "thin" as const, color: { argb: COR.borda } };
  return { top: fina, left: fina, bottom: fina, right: fina };
}

function preencher(cor: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
}

type Valor = ExcelJS.CellValue;

/** Fórmula com o resultado em cache; com zero linhas o intervalo seria inválido e vai o número. */
function celula(qtd: number, formula: string, resultado: number): Valor {
  if (qtd <= 0) return resultado;
  return { formula, result: resultado };
}

// ---------------------------------------------------------------------------
// Abas de dados
// ---------------------------------------------------------------------------

interface ColunaDetalhe<T> {
  header: string;
  width: number;
  align?: "left" | "right" | "center";
  numFmt?: string;
  value: (item: T) => string | number;
  formula?: (item: T, linha: number) => string;
  footerValue?: (items: readonly T[]) => string | number;
  footerFormula?: (primeira: number, ultima: number) => string;
  destaque?: boolean;
}

export interface FaixaDados {
  primeira: number;
  ultima: number;
}

/**
 * `renderExcelDetalhamento` da origem, depois do cabeçalho de marca: cabeçalho
 * de colunas, linhas zebradas, fórmulas por linha e o rodapé TOTAL. Devolve as
 * linhas dos dados, que é o que o Resumo referencia.
 */
function escreverDetalhe<T>(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  titulo: string,
  items: readonly T[],
  colunas: ColunaDetalhe<T>[],
): FaixaDados {
  const linhaCabecalho = escreverCabecalhoMarca(wb, ws, { titulo, colunas: colunas.length });
  colunas.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });

  const cabecalho = ws.getRow(linhaCabecalho);
  colunas.forEach((c, i) => {
    cabecalho.getCell(i + 1).value = c.header;
  });
  cabecalho.height = 26;
  estilizarCabecalhoColunas(cabecalho);
  cabecalho.eachCell((cell) => {
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  const primeira = linhaCabecalho + 1;
  items.forEach((item, indice) => {
    const numero = primeira + indice;
    const linha = ws.getRow(numero);
    linha.height = 20;
    const fundo = indice % 2 === 1 ? COR.zebra : COR.branco;
    colunas.forEach((c, i) => {
      const cell = linha.getCell(i + 1);
      const valor = c.value(item);
      const formula = c.formula?.(item, numero);
      cell.value = formula ? { formula, result: typeof valor === "number" ? valor : undefined } : valor;
      cell.font = c.destaque
        ? { size: 10, bold: true, color: { argb: COR.verdeEscuro } }
        : { size: 10, color: { argb: COR.cinzaEscuro } };
      cell.fill = preencher(fundo);
      cell.border = borda();
      const alinhar = c.align ?? (i === 0 ? "center" : typeof valor === "number" ? "right" : "left");
      cell.alignment = { vertical: "middle", horizontal: alinhar, indent: alinhar === "left" ? 1 : 0 };
      if (c.numFmt && typeof valor === "number") cell.numFmt = c.numFmt;
    });
  });

  const ultima = primeira + items.length - 1;
  const rodape = ws.getRow(ultima + 1);
  rodape.height = 24;
  colunas.forEach((c, i) => {
    const cell = rodape.getCell(i + 1);
    const valor = i === 0 ? `TOTAL (${items.length} registros)` : (c.footerValue?.(items) ?? "");
    const formula = items.length > 0 ? c.footerFormula?.(primeira, ultima) : undefined;
    cell.value = formula ? { formula, result: typeof valor === "number" ? valor : undefined } : valor;
    cell.font = { size: 10, bold: true, color: { argb: COR.verdeEscuro } };
    cell.fill = preencher(COR.verdeClaro);
    cell.border = {
      top: { style: "medium", color: { argb: COR.verde } },
      bottom: { style: "medium", color: { argb: COR.verde } },
      left: { style: "thin", color: { argb: COR.borda } },
      right: { style: "thin", color: { argb: COR.borda } },
    };
    const alinhar = c.align ?? (typeof valor === "number" ? "right" : i === 0 ? "right" : "center");
    cell.alignment = { vertical: "middle", horizontal: alinhar };
    if (c.numFmt && typeof valor === "number") cell.numFmt = c.numFmt;
  });

  ws.views = [{ showGridLines: false, state: "frozen", ySplit: linhaCabecalho }];
  ws.autoFilter = {
    from: { row: linhaCabecalho, column: 1 },
    to: { row: Math.max(linhaCabecalho, ultima), column: colunas.length },
  };
  return { primeira, ultima };
}

function novaAba(wb: ExcelJS.Workbook, nome: string): ExcelJS.Worksheet {
  return wb.addWorksheet(nome, {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.3, footer: 0.3 },
    },
  });
}

// ---------------------------------------------------------------------------
// Blocos do Resumo
// ---------------------------------------------------------------------------

function tituloDeSecao(ws: ExcelJS.Worksheet, linha: number, texto: string, cor: string = COR.verdeEscuro): number {
  ws.mergeCells(linha, 1, linha, 6);
  const cell = ws.getCell(linha, 1);
  cell.value = texto;
  cell.font = { size: 11, bold: true, color: { argb: cor } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  cell.border = { bottom: { style: "medium", color: { argb: cor === COR.verdeEscuro ? COR.verde : cor } } };
  ws.getRow(linha).height = 22;
  return linha + 1;
}

function blocoFiltros(ws: ExcelJS.Worksheet, inicio: number, filtros: [string, string][]): number {
  let linha = tituloDeSecao(ws, inicio, "FILTROS APLICADOS");
  const lista: [string, string][] = filtros.length > 0 ? filtros : [["-", "Nenhum filtro aplicado (todos os registros)"]];
  for (const [rotulo, valor] of lista) {
    ws.mergeCells(linha, 1, linha, 2);
    const k = ws.getCell(linha, 1);
    k.value = rotulo;
    k.font = { size: 10, bold: true, color: { argb: COR.cinzaEscuro } };
    k.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    k.fill = preencher(COR.cinzaClaro);
    ws.mergeCells(linha, 3, linha, 6);
    const v = ws.getCell(linha, 3);
    v.value = valor;
    v.font = { size: 10, color: { argb: COR.cinzaEscuro } };
    v.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(linha).height = 20;
    linha += 1;
  }
  return linha;
}

function kpisColoridos(
  ws: ExcelJS.Worksheet,
  inicio: number,
  kpis: { label: string; value: Valor; numFmt?: string; color: string }[],
): number {
  const linhaRotulo = tituloDeSecao(ws, inicio, "INDICADORES") + 1;
  const linhaValor = linhaRotulo + 1;
  kpis.forEach((k, i) => {
    const rotulo = ws.getCell(linhaRotulo, i + 1);
    rotulo.value = k.label;
    rotulo.font = { size: 8, bold: true, color: { argb: COR.branco } };
    rotulo.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    rotulo.fill = preencher(k.color);
    rotulo.border = borda();
    const valor = ws.getCell(linhaValor, i + 1);
    valor.value = k.value;
    if (k.numFmt) valor.numFmt = k.numFmt;
    valor.font = { size: 14, bold: true, color: { argb: k.color } };
    valor.alignment = { vertical: "middle", horizontal: "center" };
    valor.border = borda();
  });
  ws.getRow(linhaRotulo).height = 22;
  ws.getRow(linhaValor).height = 36;
  return linhaValor + 2;
}

interface ColunaMini {
  header: string;
  align?: "left" | "right" | "center";
  numFmt?: string;
}

function miniTabela(
  ws: ExcelJS.Worksheet,
  inicio: number,
  titulo: string,
  colunas: ColunaMini[],
  linhas: Valor[][],
  rodape: Valor[],
  tema: TemaAba,
): number {
  let linha = tituloDeSecao(ws, inicio, titulo, tema.title);
  const alinhamento = (c: ColunaMini | undefined, i: number) => c?.align ?? (i === 0 ? "left" : "right");
  colunas.forEach((c, i) => {
    const cell = ws.getCell(linha, i + 1);
    cell.value = c.header;
    cell.font = { size: 10, bold: true, color: { argb: COR.branco } };
    cell.fill = preencher(tema.header);
    const a = alinhamento(c, i);
    cell.alignment = { vertical: "middle", horizontal: a, indent: a === "left" ? 1 : 0 };
    cell.border = borda();
  });
  ws.getRow(linha).height = 22;
  linha += 1;
  for (const valores of linhas) {
    valores.forEach((v, i) => {
      const c = colunas[i];
      const cell = ws.getCell(linha, i + 1);
      cell.value = v;
      if (c?.numFmt) cell.numFmt = c.numFmt;
      cell.font = { size: 10, color: { argb: COR.cinzaEscuro } };
      const a = alinhamento(c, i);
      cell.alignment = { vertical: "middle", horizontal: a, indent: a === "left" ? 1 : 0, wrapText: a === "left" };
      cell.fill = preencher(tema.cell);
      cell.border = borda();
    });
    ws.getRow(linha).height = 18;
    linha += 1;
  }
  rodape.forEach((v, i) => {
    const c = colunas[i];
    const cell = ws.getCell(linha, i + 1);
    cell.value = v;
    if (c?.numFmt && (typeof v === "number" || (v !== null && typeof v === "object"))) cell.numFmt = c.numFmt;
    cell.font = { size: 10, bold: true, color: { argb: COR.branco } };
    const a = alinhamento(c, i);
    cell.alignment = { vertical: "middle", horizontal: a, indent: a === "left" ? 1 : 0 };
    cell.fill = preencher(tema.header);
    cell.border = borda();
  });
  ws.getRow(linha).height = 20;
  return linha + 2;
}

function listaAuditoria(
  ws: ExcelJS.Worksheet,
  inicio: number,
  itens: { num: string; titulo: string; texto: string; tom: keyof typeof TEMA.badge }[],
): number {
  let linha = tituloDeSecao(ws, inicio, "Como auditar / conferir os números");
  for (const it of itens) {
    const tom = TEMA.badge[it.tom];
    const num = ws.getCell(linha, 1);
    num.value = it.num;
    num.font = { size: 11, bold: true, color: { argb: COR.branco } };
    num.alignment = { vertical: "middle", horizontal: "center" };
    num.fill = preencher(tom.circle);
    num.border = borda();
    const titulo = ws.getCell(linha, 2);
    titulo.value = it.titulo;
    titulo.font = { size: 10, bold: true, color: { argb: tom.circle } };
    titulo.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    titulo.fill = preencher(tom.bg);
    titulo.border = borda();
    ws.mergeCells(linha, 3, linha, 6);
    const texto = ws.getCell(linha, 3);
    texto.value = it.texto;
    texto.font = { size: 10, color: { argb: COR.cinzaEscuro } };
    texto.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
    texto.fill = preencher(tom.bg);
    texto.border = borda();
    ws.getRow(linha).height = 24;
    linha += 1;
  }
  return linha + 1;
}

function equacao(
  ws: ExcelJS.Worksheet,
  linha: number,
  celulas: { kind: "pill" | "op" | "final"; label: string; valor?: Valor }[],
  finalOcupaDuas = false,
): number {
  const rotulos = ws.getRow(linha);
  const valores = ws.getRow(linha + 1);
  celulas.forEach((c, i) => {
    const lc = rotulos.getCell(i + 1);
    const vc = valores.getCell(i + 1);
    lc.alignment = { vertical: "middle", horizontal: "center" };
    vc.alignment = { vertical: "middle", horizontal: "center" };
    lc.border = borda();
    vc.border = borda();
    lc.value = c.label;
    if (c.kind === "op") {
      lc.font = { size: 14, bold: true, color: { argb: COR.cinzaMedio } };
      vc.value = "";
    } else if (c.kind === "pill") {
      lc.font = { size: 9, bold: true, color: { argb: TEMA.pillFg } };
      lc.fill = preencher(TEMA.pillBg);
      vc.value = c.valor ?? 0;
      vc.numFmt = FMT_BRL;
      vc.font = { size: 11, bold: true, color: { argb: TEMA.pillFg } };
      vc.fill = preencher(TEMA.pillBg);
    } else {
      lc.font = { size: 9, bold: true, color: { argb: COR.branco } };
      lc.fill = preencher(COR.verdeEscuro);
      vc.value = c.valor ?? 0;
      vc.numFmt = FMT_BRL;
      vc.font = { size: 12, bold: true, color: { argb: COR.branco } };
      vc.fill = preencher(COR.verdeEscuro);
    }
  });
  if (finalOcupaDuas && celulas.length === 5) {
    ws.mergeCells(linha, 5, linha, 6);
    ws.mergeCells(linha + 1, 5, linha + 1, 6);
  }
  rotulos.height = 20;
  valores.height = 28;
  return linha + 2;
}

// ---------------------------------------------------------------------------
// Workbook
// ---------------------------------------------------------------------------

const TITULO = "Extrato de Conta-Corrente";
const SUBTITULO = "Transportadora · Movimentos";

function totalDe(lista: readonly MovimentoExtrato[]): number {
  return somar(lista.map((m) => m.valor));
}

/** Monta o workbook sem salvar (o teste inspeciona as fórmulas aqui). */
export function montarExtratoWorkbook(
  transportadoraNome: string,
  movimentos: readonly MovimentoExtrato[],
  meses: readonly string[],
  emitidoEm: Date,
): ExcelJS.Workbook {
  const d = dadosDaExportacao(movimentos, meses);
  const { todos, totais, fretes, abastecimentos, creditosTanque, pagamentos, ajustes } = d;

  const wb = new ExcelJS.Workbook();
  wb.creator = "ERP EMT";
  wb.company = EMPRESA.razaoSocial;
  wb.created = emitidoEm;

  const wsResumo = wb.addWorksheet("Resumo", {
    properties: { tabColor: { argb: COR.verde } },
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1 },
  });
  const wsTodos = novaAba(wb, "Todos");
  const wsFretes = novaAba(wb, "Fretes");
  const wsAbast = novaAba(wb, "Abastecimentos");
  const wsCredTq = novaAba(wb, "Abast. Tanque");
  const wsPagto = novaAba(wb, "Pagamentos");
  const wsAjustes = novaAba(wb, "Ajustes");

  // As abas de dados primeiro: o Resumo aponta para as linhas delas.
  const credito = (m: MovimentoExtrato) => (ehCredito(m.tipo) ? m.valor : "");
  const debito = (m: MovimentoExtrato) => (ehCredito(m.tipo) ? "" : m.valor);

  // Linha da última movimentação da aba Todos (os dados começam logo abaixo do
  // cabeçalho de colunas, que vem depois da moldura de marca).
  const ultimaTodos = LINHAS_CABECALHO_MARCA + 1 + todos.length;
  const fTodos = escreverDetalhe<MovimentoComSaldo>(wb, wsTodos, `${TITULO} · Todos`, todos, [
    { header: "Data", width: 14, value: (m) => dataDoMovimento(m.data) },
    { header: "Tipo", width: 32, value: (m) => TIPO_LABEL[m.tipo] },
    { header: "Descrição", width: 42, value: (m) => m.descricao ?? "" },
    { header: "Cálculo", width: 50, value: (m) => memoriaDeCalculo(m) },
    {
      header: "Crédito",
      width: 16,
      align: "right",
      numFmt: FMT_BRL,
      value: credito,
      footerValue: () => totais.creditos,
      footerFormula: (a, b) => `SUM(E${a}:E${b})`,
    },
    {
      header: "Débito",
      width: 16,
      align: "right",
      numFmt: FMT_BRL,
      value: debito,
      footerValue: () => totais.debitos,
      footerFormula: (a, b) => `SUM(F${a}:F${b})`,
    },
    {
      header: "Saldo",
      width: 18,
      align: "right",
      numFmt: FMT_BRL,
      value: (m) => m.saldoAcumulado,
      // Linhas em ordem decrescente: o saldo da linha é o da linha de baixo mais
      // o movimento dela. SUM(E7) e não E7: a célula vazia guarda texto.
      formula: (_m, r) => (r >= ultimaTodos ? `SUM(E${r})-SUM(F${r})` : `G${r + 1}+SUM(E${r})-SUM(F${r})`),
      footerValue: () => totais.saldo,
      footerFormula: (a, b) => `SUM(E${a}:E${b})-SUM(F${a}:F${b})`,
      destaque: true,
    },
  ]);

  const fFretes = escreverDetalhe<MovimentoExtrato>(wb, wsFretes, `${TITULO} · Fretes`, fretes, [
    { header: "Data", width: 14, value: (m) => dataDoMovimento(m.data) },
    { header: "Origem", width: 22, value: (m) => m.freteOrigem ?? "" },
    { header: "Destino", width: 22, value: (m) => m.freteDestino ?? "" },
    { header: "Insumo", width: 24, value: (m) => m.freteInsumoNome ?? "" },
    { header: "Obra", width: 24, value: (m) => m.obraNome ?? "" },
    {
      header: "Peso (t)",
      width: 12,
      align: "right",
      numFmt: "#,##0.00",
      value: (m) => m.fretePeso ?? 0,
      footerValue: (items) => somar(items.map((m) => m.fretePeso)),
      footerFormula: (a, b) => `SUM(F${a}:F${b})`,
    },
    {
      header: "KM",
      width: 12,
      align: "right",
      numFmt: "#,##0.0",
      value: (m) => m.freteKm ?? 0,
      footerValue: (items) => somar(items.map((m) => m.freteKm)),
      footerFormula: (a, b) => `SUM(G${a}:G${b})`,
    },
    { header: "R$/tkm", width: 12, align: "right", numFmt: FMT_PRECO, value: (m) => m.freteTkm ?? 0 },
    { header: "NF", width: 14, value: (m) => m.freteNotaFiscal ?? "" },
    { header: "NF 2", width: 14, value: (m) => m.freteNotaFiscal2 ?? "" },
    { header: "Placa", width: 12, value: (m) => m.fretePlaca ?? "" },
    { header: "Motorista", width: 22, value: (m) => m.freteMotorista ?? "" },
    {
      header: "Valor",
      width: 16,
      align: "right",
      numFmt: FMT_BRL,
      value: (m) => m.valor,
      formula: (_m, r) => `F${r}*G${r}*H${r}`,
      footerValue: (items) => totalDe(items),
      footerFormula: (a, b) => `SUM(M${a}:M${b})`,
      destaque: true,
    },
  ]);

  const fAbast = escreverDetalhe<MovimentoExtrato>(wb, wsAbast, `${TITULO} · Abastecimentos`, abastecimentos, [
    { header: "Data", width: 14, value: (m) => dataDoMovimento(m.data) },
    {
      header: "Categoria",
      width: 14,
      value: (m) => {
        const c = categoriaDoTipo(m.tipo);
        return c ? ROTULO_CATEGORIA[c] : "";
      },
    },
    { header: "Combustível", width: 22, value: (m) => m.saidaCombustivelNome ?? "" },
    {
      header: "Litros",
      width: 12,
      align: "right",
      numFmt: "#,##0.00",
      value: (m) => m.saidaLitros ?? 0,
      footerValue: (items) => somar(items.map((m) => m.saidaLitros)),
      footerFormula: (a, b) => `SUM(D${a}:D${b})`,
    },
    {
      // Sempre o preço COBRADO da transportadora; o rodapé é o médio ponderado.
      header: "Preço/L",
      width: 14,
      align: "right",
      numFmt: FMT_PRECO,
      value: (m) => m.saidaPrecoCombustivel ?? 0,
      footerValue: (items) => {
        const l = somar(items.map((m) => m.saidaLitros));
        return l > 0 ? totalDe(items) / l : 0;
      },
      footerFormula: (_a, b) => `IFERROR(J${b + 1}/D${b + 1},0)`,
    },
    { header: "Taxa/L", width: 12, align: "right", numFmt: FMT_PRECO, value: (m) => m.saidaTaxaLitro ?? 0 },
    { header: "Placa", width: 12, value: (m) => m.saidaPlaca ?? "" },
    { header: "Motorista", width: 22, value: (m) => m.saidaMotorista ?? "" },
    { header: "Observações", width: 32, value: (m) => m.saidaObservacoes ?? "" },
    {
      header: "Total",
      width: 16,
      align: "right",
      numFmt: FMT_BRL,
      value: (m) => m.valor,
      formula: (_m, r) => `D${r}*(E${r}+F${r})`,
      footerValue: (items) => totalDe(items),
      footerFormula: (a, b) => `SUM(J${a}:J${b})`,
      destaque: true,
    },
  ]);

  const fCredTq = escreverDetalhe<MovimentoExtrato>(wb, wsCredTq, `${TITULO} · Abast. Tanque`, creditosTanque, [
    { header: "Data", width: 14, value: (m) => dataDoMovimento(m.data) },
    { header: "Combustível", width: 22, value: (m) => m.saidaCombustivelNome ?? "" },
    {
      header: "Litros",
      width: 12,
      align: "right",
      numFmt: "#,##0.00",
      value: (m) => m.saidaLitros ?? 0,
      footerValue: (items) => somar(items.map((m) => m.saidaLitros)),
      footerFormula: (a, b) => `SUM(C${a}:C${b})`,
    },
    {
      header: "Preço Tanque/L",
      width: 16,
      align: "right",
      numFmt: FMT_PRECO,
      value: (m) => m.saidaPrecoProprietario ?? m.saidaPrecoCombustivel ?? 0,
      footerValue: (items) => {
        const l = somar(items.map((m) => m.saidaLitros));
        return l > 0 ? totalDe(items) / l : 0;
      },
      footerFormula: (_a, b) => `IFERROR(I${b + 1}/C${b + 1},0)`,
    },
    { header: "Taxa/L", width: 12, align: "right", numFmt: FMT_PRECO, value: (m) => m.saidaTaxaLitro ?? 0 },
    { header: "Placa", width: 12, value: (m) => m.saidaPlaca ?? "" },
    { header: "Motorista", width: 22, value: (m) => m.saidaMotorista ?? "" },
    { header: "Observações", width: 32, value: (m) => m.saidaObservacoes ?? "" },
    {
      header: "Crédito",
      width: 16,
      align: "right",
      numFmt: FMT_BRL,
      value: (m) => m.valor,
      formula: (_m, r) => `C${r}*(D${r}+E${r})`,
      footerValue: (items) => totalDe(items),
      footerFormula: (a, b) => `SUM(I${a}:I${b})`,
      destaque: true,
    },
  ]);

  const fPagto = escreverDetalhe<MovimentoExtrato>(wb, wsPagto, `${TITULO} · Pagamentos`, pagamentos, [
    { header: "Data", width: 14, value: (m) => dataDoMovimento(m.data) },
    { header: "Mês ref", width: 12, value: (m) => m.mesReferencia?.slice(0, 7) ?? "" },
    { header: "Método", width: 16, value: (m) => rotuloMetodo(m.pagamentoMetodo) },
    { header: "NF", width: 14, value: (m) => m.pagamentoNotaFiscal ?? "" },
    { header: "Responsável", width: 22, value: (m) => m.pagamentoResponsavel ?? "" },
    { header: "Pago por", width: 22, value: (m) => m.pagamentoPagoPor ?? "" },
    {
      header: "Combustível (L)",
      width: 16,
      align: "right",
      numFmt: "#,##0.00",
      value: (m) => m.pagamentoLitros ?? 0,
      footerValue: (items) => somar(items.map((m) => m.pagamentoLitros)),
      footerFormula: (a, b) => `SUM(G${a}:G${b})`,
    },
    { header: "Observações", width: 32, value: (m) => m.pagamentoObservacoes ?? m.descricao ?? "" },
    {
      header: "Valor",
      width: 16,
      align: "right",
      numFmt: FMT_BRL,
      value: (m) => m.valor,
      footerValue: (items) => totalDe(items),
      footerFormula: (a, b) => `SUM(I${a}:I${b})`,
      destaque: true,
    },
  ]);

  const fAjustes = escreverDetalhe<MovimentoExtrato>(wb, wsAjustes, `${TITULO} · Ajustes`, ajustes, [
    { header: "Data", width: 14, value: (m) => dataDoMovimento(m.data) },
    { header: "Sinal", width: 12, value: (m) => (m.tipo === "ajuste_manual_credito" ? "Crédito" : "Débito") },
    { header: "Descrição", width: 42, value: (m) => m.descricao ?? "" },
    { header: "Obra", width: 24, value: (m) => m.obraNome ?? "" },
    { header: "Criado por", width: 22, value: (m) => m.ajusteCriadoPor ?? "" },
    {
      header: "Crédito",
      width: 16,
      align: "right",
      numFmt: FMT_BRL,
      value: (m) => (m.tipo === "ajuste_manual_credito" ? m.valor : ""),
      footerValue: (items) => totalDe(items.filter((m) => m.tipo === "ajuste_manual_credito")),
      footerFormula: (a, b) => `SUM(F${a}:F${b})`,
    },
    {
      header: "Débito",
      width: 16,
      align: "right",
      numFmt: FMT_BRL,
      value: (m) => (m.tipo === "ajuste_manual_debito" ? m.valor : ""),
      footerValue: (items) => totalDe(items.filter((m) => m.tipo === "ajuste_manual_debito")),
      footerFormula: (a, b) => `SUM(G${a}:G${b})`,
    },
  ]);

  escreverResumo(wb, wsResumo, transportadoraNome, meses, emitidoEm, d, {
    todos: fTodos,
    fretes: fFretes,
    abast: fAbast,
    credTq: fCredTq,
    pagto: fPagto,
    ajustes: fAjustes,
  });
  return wb;
}

interface Faixas {
  todos: FaixaDados;
  fretes: FaixaDados;
  abast: FaixaDados;
  credTq: FaixaDados;
  pagto: FaixaDados;
  ajustes: FaixaDados;
}

function escreverResumo(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  nome: string,
  meses: readonly string[],
  emitidoEm: Date,
  d: ReturnType<typeof dadosDaExportacao>,
  f: Faixas,
): void {
  const { todos, totais, fretes, abastecimentos, creditosTanque, pagamentos, ajustes } = d;
  [24, 22, 22, 22, 22, 22].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  ws.views = [{ showGridLines: false }];

  // Intervalos de cada aba (A7:A{n+6}, etc.).
  const r = (aba: string, col: string, fx: FaixaDados) => `${aba}!${col}${fx.primeira}:${col}${fx.ultima}`;
  const T = (col: string) => r("Todos", col, f.todos);
  const FR = (col: string) => r("Fretes", col, f.fretes);
  const AB = (col: string) => r("Abastecimentos", col, f.abast);
  const CT = (col: string) => r("'Abast. Tanque'", col, f.credTq);
  const PG = (col: string) => r("Pagamentos", col, f.pagto);
  const AJ = (col: string) => r("Ajustes", col, f.ajustes);

  const nTodos = todos.length;
  const totalFretes = somar(fretes.map((m) => m.valor));
  const totalAbastTanque = somar(creditosTanque.map((m) => m.valor));
  const totalAbast = somar(abastecimentos.map((m) => m.valor));
  const totalPagamentos = somar(pagamentos.map((m) => m.valor));
  const ajustesCredito = ajustes.filter((m) => m.tipo === "ajuste_manual_credito");
  const ajustesDebito = ajustes.filter((m) => m.tipo === "ajuste_manual_debito");
  const totalAjusteCred = somar(ajustesCredito.map((m) => m.valor));
  const totalAjusteDeb = somar(ajustesDebito.map((m) => m.valor));
  const totalCreditosCalc = somar([totalFretes, totalAbastTanque, totalAjusteCred]);

  let linha = escreverCabecalhoMarca(wb, ws, { titulo: TITULO, colunas: 6 });

  ws.mergeCells(linha, 1, linha, 6);
  const titulo = ws.getCell(linha, 1);
  titulo.value = TITULO;
  titulo.font = { size: 18, bold: true, color: { argb: COR.branco } };
  titulo.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  titulo.fill = preencher(COR.verde);
  ws.getRow(linha).height = 32;
  linha += 1;
  ws.mergeCells(linha, 1, linha, 6);
  const sub = ws.getCell(linha, 1);
  sub.value = `${nome} · ${SUBTITULO}`;
  sub.font = { size: 10, color: { argb: COR.branco } };
  sub.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sub.fill = preencher(COR.verdeEscuro);
  ws.getRow(linha).height = 20;
  linha += 2;
  ws.mergeCells(linha, 1, linha, 6);
  const [dia, hora] = formatarDataHora(emitidoEm).split(" ");
  const carimbo = ws.getCell(linha, 1);
  carimbo.value = `Gerado em ${dia} às ${hora}`;
  carimbo.font = { size: 9, italic: true, color: { argb: COR.cinzaMedio } };
  carimbo.alignment = { horizontal: "right" };
  linha += 2;

  linha = blocoFiltros(ws, linha, filtrosDaExportacao(meses)) + 1;

  const saldoTodos = celula(nTodos, `SUM(${T("E")})-SUM(${T("F")})`, totais.saldoFinal);
  linha =
    kpisColoridos(ws, linha, [
      { label: "SALDO DO PERÍODO", value: saldoTodos, numFmt: FMT_BRL, color: TEMA.kpiSaldo },
      { label: "CRÉDITOS (A RECEBER)", value: celula(nTodos, `SUM(${T("E")})`, totais.creditos), numFmt: FMT_BRL, color: TEMA.kpiCreditos },
      { label: "DÉBITOS (RECEBIDOS)", value: celula(nTodos, `SUM(${T("F")})`, totais.debitos), numFmt: FMT_BRL, color: TEMA.kpiDebitos },
      { label: "TOTAL MOVIMENTOS", value: celula(nTodos, `COUNTA(${T("A")})`, nTodos), color: TEMA.kpiTotal },
      { label: "FRETES NO MÊS", value: celula(fretes.length, `COUNTA(${FR("A")})`, fretes.length), color: TEMA.kpiFretes },
      {
        label: "PAGAMENTOS NO MÊS",
        value: celula(pagamentos.length, `COUNTA(${PG("A")})`, pagamentos.length),
        color: TEMA.kpiPagamentos,
      },
    ]) + 1;

  linha = tituloDeSecao(ws, linha, "Como ler esta planilha: passo a passo") + 1;
  linha = tituloDeSecao(ws, linha, "O que é esta planilha?");
  ws.mergeCells(linha, 1, linha + 1, 6);
  const oque = ws.getCell(linha, 1);
  oque.value =
    `É um extrato de conta-corrente da transportadora ${nome.toUpperCase()} com a EMT Construtora. ` +
    "A transportadora gera créditos quando presta serviços (fretes) e/ou fornece combustível, e a EMT gera débitos quando paga por esses serviços. " +
    "O saldo mostra quem deve a quem ao final do mês.";
  oque.alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
  oque.font = { size: 10, color: { argb: COR.cinzaEscuro } };
  ws.getRow(linha).height = 32;
  ws.getRow(linha + 1).height = 16;
  linha += 3;

  const saldoPorAjustes = somar(ajustes.map((m) => (ehCredito(m.tipo) ? m.valor : -m.valor)));
  linha =
    miniTabela(
      ws,
      linha,
      "As 7 abas da planilha",
      [
        { header: "Aba", align: "left" },
        { header: "Grupo", align: "left" },
        { header: "Para que serve", align: "left" },
        { header: "Cálculo", align: "left" },
        { header: "Registros", align: "right", numFmt: "#,##0" },
        { header: "Total (R$)", align: "right", numFmt: FMT_BRL },
      ],
      [
        ["Resumo", "Painel", "Painel de bordo com os números finais do mês", "-", "-", "-"],
        [
          "Todos",
          "Extrato",
          "Extrato completo com todos os lançamentos do mês, em ordem cronológica decrescente",
          "Consolida as demais abas",
          celula(nTodos, `COUNTA(${T("A")})`, nTodos),
          saldoTodos,
        ],
        [
          "Fretes",
          "Crédito",
          "Cada viagem de carreta (pedreira → usina), com NF, placa e motorista",
          "Peso (t) × KM × R$/tkm",
          celula(fretes.length, `COUNTA(${FR("A")})`, fretes.length),
          celula(fretes.length, `SUM(${FR("M")})`, totalFretes),
        ],
        [
          "Abastecimentos",
          "Débito",
          "Abastecimentos da própria transportadora em tanques de terceiros e da EMT",
          "Litros × (Preço/L cobrado + Taxa/L)",
          celula(abastecimentos.length, `COUNTA(${AB("A")})`, abastecimentos.length),
          celula(abastecimentos.length, `SUM(${AB("J")})`, totalAbast),
        ],
        [
          "Abast. Tanque",
          "Crédito",
          "Combustível fornecido pela transportadora no próprio tanque (quando aplicável)",
          "Litros × (Preço/L do tanque + Taxa/L)",
          celula(creditosTanque.length, `COUNTA(${CT("A")})`, creditosTanque.length),
          celula(creditosTanque.length, `SUM(${CT("I")})`, totalAbastTanque),
        ],
        [
          "Pagamentos",
          "Débito",
          "Pagamentos recebidos da EMT Construtora",
          "Valor da NF de cada pagamento",
          celula(pagamentos.length, `COUNTA(${PG("A")})`, pagamentos.length),
          celula(pagamentos.length, `SUM(${PG("I")})`, totalPagamentos),
        ],
        [
          "Ajustes",
          "-",
          "Correções manuais (ex: diferença de preço de combustível de mês anterior)",
          "Valor lançado manualmente",
          celula(ajustes.length, `COUNTA(${AJ("A")})`, ajustes.length),
          celula(ajustes.length, `SUM(${AJ("F")})-SUM(${AJ("G")})`, saldoPorAjustes),
        ],
      ],
      ["-", "-", "-", "-", celula(nTodos, `COUNTA(${T("A")})`, nTodos), saldoTodos],
      TEMA.abas7,
    ) + 1;

  const exemplo = todos[0];
  if (exemplo) {
    const credito = ehCredito(exemplo.tipo);
    linha =
      miniTabela(
        ws,
        linha,
        'Como ler uma linha da aba "Todos"',
        [
          { header: "Coluna", align: "center" },
          { header: "Nome", align: "left" },
          { header: "O que mostra", align: "left" },
          { header: "Exemplo real (1ª linha)", align: "left" },
        ],
        [
          ["A", "Data", "Dia em que o lançamento ocorreu", dataDoMovimento(exemplo.data)],
          ["B", "Tipo", "Origem do lançamento (frete / abast. / ajuste / pagamento)", TIPO_LABEL[exemplo.tipo]],
          ["C", "Descrição", "Detalhe: NF, rota, etc.", exemplo.descricao ?? "-"],
          ["D", "Cálculo", "Memória de cálculo: explica como o valor foi obtido", memoriaDeCalculo(exemplo) || "-"],
          ["E", "Crédito", "Valor positivo (entrada para a transportadora)", credito ? formatarBRL(exemplo.valor) : "-"],
          ["F", "Débito", "Valor negativo (pagamento recebido pela transportadora)", credito ? "-" : formatarBRL(exemplo.valor)],
          [
            "G",
            "Saldo",
            "Saldo acumulado até aquela linha. A 1ª linha = saldo final do mês",
            `${formatarBRL(exemplo.saldoAcumulado)} (1ª linha = fim do mês)`,
          ],
        ],
        ["-", "-", "-", "-"],
        TEMA.todos,
      ) + 1;
  }

  linha = listaAuditoria(ws, linha, [
    {
      num: "1º",
      titulo: "Conferir um frete",
      texto: 'Abra a aba "Fretes", localize a NF, multiplique Peso (t) × KM × R$/tkm e confira a coluna Valor.',
      tom: "emerald",
    },
    {
      num: "2º",
      titulo: "Conferir um abastecimento",
      texto:
        'Abra a aba "Abast. Tanque" (ou "Abastecimentos"), multiplique Litros × (Preço/L + Taxa/L) e confira a coluna Crédito (ou Total).',
      tom: "emerald",
    },
    {
      num: "3º",
      titulo: "Conferir um pagamento",
      texto: 'Abra a aba "Pagamentos". Cada linha tem a NF, os litros pagos, o valor médio/L e o valor total.',
      tom: "red",
    },
    {
      num: "4º",
      titulo: "Conferir o saldo total",
      texto: 'Veja a 1ª linha de dados da aba "Todos": a coluna "Saldo" da 1ª linha é o saldo final do mês.',
      tom: "blue",
    },
  ]);

  linha = tituloDeSecao(ws, linha, "Fórmula do Saldo do Período");
  const eq1 = linha + 1;
  linha = equacao(ws, linha, [
    { kind: "pill", label: "Fretes", valor: celula(fretes.length, `SUM(${FR("M")})`, totalFretes) },
    { kind: "op", label: "+" },
    { kind: "pill", label: "Abast. Tanque", valor: celula(creditosTanque.length, `SUM(${CT("I")})`, totalAbastTanque) },
    { kind: "op", label: "+" },
    { kind: "pill", label: "Ajustes", valor: celula(ajustes.length, `SUM(${AJ("F")})`, totalAjusteCred) },
    { kind: "final", label: "= Créditos", valor: { formula: `A${eq1}+C${eq1}+E${eq1}`, result: totalCreditosCalc } },
  ]);
  linha += 1;
  const eq2 = linha + 1;
  linha = equacao(
    ws,
    linha,
    [
      { kind: "pill", label: "Créditos", valor: { formula: `F${eq1}`, result: totalCreditosCalc } },
      { kind: "op", label: "−" },
      { kind: "pill", label: "Débitos", valor: celula(nTodos, `SUM(${T("F")})`, totais.debitos) },
      { kind: "op", label: "=" },
      { kind: "final", label: "Saldo do Período", valor: { formula: `A${eq2}-C${eq2}`, result: totais.saldoFinal } },
    ],
    true,
  );
  linha += 2;

  linha = tituloDeSecao(ws, linha, "Detalhamento por aba") + 1;
  const colunasIndicador = (fmt: string): ColunaMini[] => [
    { header: "Indicador", align: "left" },
    { header: "Valor", align: "right", numFmt: fmt },
    { header: "Fórmula / explicação", align: "left" },
  ];

  if (fretes.length > 0) {
    const n = fretes.length;
    const t = somar(fretes.map((m) => m.fretePeso));
    const k = somar(fretes.map((m) => m.freteKm));
    linha =
      miniTabela(
        ws,
        linha,
        "Aba Fretes: viagens de carreta",
        colunasIndicador("#,##0.0000"),
        [
          ["Total de viagens", celula(n, `COUNTA(${FR("A")})`, n), "Conta as linhas da aba Fretes"],
          ["Total transportado (t)", celula(n, `SUM(${FR("F")})`, t), 'Soma da coluna "Peso (t)"'],
          ["Peso médio por viagem (t)", celula(n, `AVERAGE(${FR("F")})`, t / n), 'Média da coluna "Peso (t)"'],
          ["Valor médio por viagem", celula(n, `AVERAGE(${FR("M")})`, totalFretes / n), 'Média da coluna "Valor"'],
          ["KM total rodado", celula(n, `SUM(${FR("G")})`, k), 'Soma da coluna "KM"'],
          [
            "Tarifa (R$/tkm)",
            celula(n, `AVERAGE(${FR("H")})`, somar(fretes.map((m) => m.freteTkm)) / n),
            'Média da coluna "R$/tkm"',
          ],
          ["Valor total em fretes", celula(n, `SUM(${FR("M")})`, totalFretes), 'Soma da coluna "Valor" (crédito)'],
        ],
        ["-", "-", "-"],
        TEMA.fretes,
      ) + 1;
  }

  if (creditosTanque.length > 0) {
    const n = creditosTanque.length;
    const l = somar(creditosTanque.map((m) => m.saidaLitros));
    const placas = new Set(creditosTanque.map((m) => (m.saidaPlaca ?? "").trim()).filter(Boolean)).size;
    linha =
      miniTabela(
        ws,
        linha,
        "Aba Abast. Tanque: combustível fornecido pela transportadora",
        colunasIndicador("#,##0.0000"),
        [
          ["Total de abastecimentos", celula(n, `COUNTA(${CT("A")})`, n), "Quantidade de lançamentos na aba"],
          ["Litros totais abastecidos", celula(n, `SUM(${CT("C")})`, l), 'Total da coluna "Litros" na aba'],
          [
            "Preço médio por litro",
            celula(n, `IFERROR(SUM(${CT("I")})/SUM(${CT("C")}),0)`, l > 0 ? totalAbastTanque / l : 0),
            "Valor total ÷ Litros totais",
          ],
          ["Qtd de placas diferentes", placas, "Carretas distintas que abasteceram"],
          ["Valor total fornecido", celula(n, `SUM(${CT("I")})`, totalAbastTanque), 'Total da coluna "Crédito"'],
        ],
        ["-", "-", "-"],
        TEMA.tanque,
      ) + 1;
  }

  if (pagamentos.length > 0) {
    const n = pagamentos.length;
    const l = somar(pagamentos.map((m) => m.pagamentoLitros));
    linha =
      miniTabela(
        ws,
        linha,
        "Aba Pagamentos: recebidos da EMT Construtora",
        colunasIndicador("#,##0.0000"),
        [
          ["Qtd de pagamentos", celula(n, `COUNTA(${PG("A")})`, n), "Notas fiscais recebidas no mês"],
          ["Litros totais pagos", celula(n, `SUM(${PG("G")})`, l), 'Soma da coluna "Combustível (L)"'],
          [
            "Valor médio por litro pago",
            celula(n, `IFERROR(SUM(${PG("I")})/SUM(${PG("G")}),0)`, l > 0 ? totalPagamentos / l : 0),
            "Valor total ÷ Litros totais pagos",
          ],
          ["Valor médio por pagamento", celula(n, `AVERAGE(${PG("I")})`, totalPagamentos / n), 'Média da coluna "Valor"'],
          ["Valor total recebido", celula(n, `SUM(${PG("I")})`, totalPagamentos), 'Total da coluna "Valor" (débito)'],
        ],
        ["-", "-", "-"],
        TEMA.pagamentos,
      ) + 1;
  }

  if (ajustes.length > 0) {
    const n = ajustes.length;
    linha =
      miniTabela(
        ws,
        linha,
        "Aba Ajustes: correções manuais",
        colunasIndicador(FMT_BRL),
        [
          ["Qtd de ajustes", celula(n, `COUNTA(${AJ("A")})`, n), "Lançamentos manuais no mês"],
          ["Total créditos (ajustes)", celula(n, `SUM(${AJ("F")})`, totalAjusteCred), `${ajustesCredito.length} lançamento(s) de crédito`],
          ["Total débitos (ajustes)", celula(n, `SUM(${AJ("G")})`, totalAjusteDeb), `${ajustesDebito.length} lançamento(s) de débito`],
        ],
        ["-", "-", "-"],
        TEMA.ajustes,
      ) + 1;
  }

  if (abastecimentos.length > 0) {
    const n = abastecimentos.length;
    const l = somar(abastecimentos.map((m) => m.saidaLitros));
    const placas = new Set(abastecimentos.map((m) => (m.saidaPlaca ?? "").trim()).filter(Boolean)).size;
    const externo = abastecimentos.filter((m) => m.tipo === "debito_abastecimento_transterra").length;
    const emt = abastecimentos.filter((m) => m.tipo === "debito_abastecimento_emt").length;
    linha =
      miniTabela(
        ws,
        linha,
        "Aba Abastecimentos: em tanques externos (débito)",
        colunasIndicador("#,##0.0000"),
        [
          ["Total de abastecimentos", celula(n, `COUNTA(${AB("A")})`, n), "Quantidade de lançamentos na aba"],
          [
            "Categoria Tanque externo",
            celula(n, `COUNTIF(${AB("B")},"Tanque externo")`, externo),
            "Abastecimentos em tanque de terceiro (Transterra/Areacre, Posto Progresso)",
          ],
          ["Categoria EMT", celula(n, `COUNTIF(${AB("B")},"EMT")`, emt), "Abastecimentos em tanque interno EMT"],
          ["Litros totais", celula(n, `SUM(${AB("D")})`, l), 'Soma da coluna "Litros"'],
          [
            "Preço médio por litro (cobrado)",
            celula(n, `IFERROR(SUM(${AB("J")})/SUM(${AB("D")}),0)`, l > 0 ? totalAbast / l : 0),
            "Valor total ÷ Litros totais: sempre no preço COBRADO da transportadora, nunca no custo médio do tanque da EMT",
          ],
          ["Qtd de placas diferentes", placas, "Carretas distintas que abasteceram"],
          ["Valor total (débito)", celula(n, `SUM(${AB("J")})`, totalAbast), 'Total da coluna "Total"'],
        ],
        ["-", "-", "-"],
        TEMA.abast,
      ) + 1;
  } else {
    linha = tituloDeSecao(ws, linha, "Aba Abastecimentos: em tanques externos", TEMA.abast.title);
    ws.mergeCells(linha, 1, linha + 1, 6);
    const c = ws.getCell(linha, 1);
    c.value =
      "Status no mês: vazia, 0 registros. Esta aba registra abastecimentos da transportadora em tanques de terceiros e da EMT.";
    c.alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
    c.font = { size: 10, italic: true, color: { argb: COR.cinzaMedio } };
    c.fill = preencher(TEMA.abast.cell);
    linha += 3;
  }

  miniTabela(
    ws,
    linha,
    "Aba Todos: extrato consolidado",
    colunasIndicador(FMT_BRL),
    [
      [
        "Total de lançamentos",
        nTodos,
        `Fretes (${fretes.length}) + Abastecimentos (${abastecimentos.length}) + Abast. Tanque (${creditosTanque.length}) + Ajustes (${ajustes.length}) + Pagamentos (${pagamentos.length})`,
      ],
      ["Total de créditos", totais.creditos, 'Soma da coluna "Crédito" na aba Todos'],
      ["Total de débitos", totais.debitos, 'Soma da coluna "Débito" na aba Todos'],
      ["Saldo final (1ª linha)", totais.saldoFinal, "Saldo acumulado até o último lançamento do mês"],
    ],
    ["-", "-", "-"],
    TEMA.todos,
  );
}
