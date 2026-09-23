import ExcelJS from "exceljs";

import { argb, CORES_MARCA, EMPRESA } from "@/config/marca";
import { escreverCabecalhoMarca, estilizarCabecalhoColunas } from "@/lib/planilha-marca";
import { SEVERITY_ORDER, type Anomalia, type Severidade } from "@/modules/combustivel/anomalias/detect";
import type { SaidaBase, TanqueBase } from "@/modules/combustivel/anomalias/base";
import {
  consumidorDaSaida,
  rPorLDaSaida,
  saidasDesc,
  type CadastrosRelatorio,
  type DadosMensal,
  type DadosPorEquipamento,
  type DadosPorObra,
  type EntradaRelatorio,
  type LinhaCarretaTop,
  type LinhaEquipamentoTop,
  type LinhaTop,
  type TransferenciaRelatorio,
} from "@/modules/combustivel/relatorios/consolidar";
import { dataParaCelula, type CelulaPlanilha } from "@/modules/financeiro/lancamentos/planilha";
import { somarValoresOperacionais } from "@/modules/manutencao/servicos/formato";

/**
 * As planilhas dos relatórios do Combustível, com as abas, as colunas e os números dos
 * workbooks da origem (Gestao_Obras v2/relatorios). O que muda é só a moldura: cada aba
 * leva o cabeçalho de marca do ERP (logo, razão social, a Pista), que é regra de todo
 * documento que o sistema emite, e o total é fórmula (SUBTOTAL 109) com o resultado junto.
 *
 * Litros saem com 2 casas (regra do app; a origem formatava inteiro). O número na célula
 * é o mesmo.
 *
 * **Módulo de servidor**: puxa o exceljs. A action o carrega por `await import`.
 */

export type TipoColuna = "texto" | "inteiro" | "litros" | "dinheiro" | "preco" | "data";

export interface Coluna<L> {
  cabecalho: string;
  largura: number;
  tipo: TipoColuna;
  celula: (linha: L) => CelulaPlanilha;
  /** Entra no total (SUBTOTAL 109, que soma só o visível) com o resultado já calculado. */
  somar?: boolean;
}

const FORMATOS: Partial<Record<TipoColuna, string>> = {
  inteiro: "#,##0",
  litros: '#,##0.00 "L"',
  dinheiro: '"R$" #,##0.00',
  preco: '"R$" #,##0.0000',
  data: "dd/mm/yyyy",
};

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** "2026-04" -> "Abr/2026" (o `formatMesRef` da origem). */
export function formatarMesRef(mes: string): string {
  const [ano, m] = mes.split("-");
  const indice = Number(m) - 1;
  return indice >= 0 && indice <= 11 ? `${MESES_CURTOS[indice]}/${ano}` : mes;
}

/** "2026-09-10" -> "10/09/2026". */
export function formatarDiaBR(dia: string): string {
  return dia.slice(0, 10).split("-").reverse().join("/");
}

/** Relógio de parede (ou dia) como data do Excel. */
function diaParaCelula(valor: string | null | undefined): Date | null {
  return dataParaCelula(valor ? valor.slice(0, 10) : null);
}

/** O `sanitizeFilenamePart` da origem. */
export function parteDeNomeDeArquivo(texto: string): string {
  return texto
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function novoWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERP EMT";
  workbook.company = EMPRESA.razaoSocial;
  return workbook;
}

function negrito(celula: ExcelJS.Cell, tamanho = 11): void {
  celula.font = { bold: true, size: tamanho, color: { argb: argb(CORES_MARCA.verdeEscuro) } };
}

// ---------------------------------------------------------------------------
// Blocos
// ---------------------------------------------------------------------------

export interface Indicador {
  rotulo: string;
  valor: number | string;
  tipo?: TipoColuna;
}

/**
 * A aba "Resumo" da origem: título, filtros aplicados e indicadores. A origem mostra os
 * indicadores em cartões (e o `renderExcelKPIs` só desenhava os 4 primeiros); aqui saem
 * todos, um por linha, com o mesmo valor.
 */
export function escreverResumo(
  workbook: ExcelJS.Workbook,
  {
    titulo,
    subtitulo,
    filtros,
    indicadores,
    aviso,
  }: {
    titulo: string;
    subtitulo: string;
    filtros: [string, string][];
    indicadores: Indicador[];
    aviso?: { titulo: string; texto: string } | null;
  },
): ExcelJS.Worksheet {
  const ws = workbook.addWorksheet("Resumo", { properties: { tabColor: { argb: argb(CORES_MARCA.verde) } } });
  let linha = escreverCabecalhoMarca(workbook, ws, { titulo, colunas: 4 });
  ws.columns = [{ width: 30 }, { width: 40 }, { width: 18 }, { width: 18 }];

  ws.getCell(linha, 1).value = titulo;
  negrito(ws.getCell(linha, 1), 14);
  linha += 1;
  ws.getCell(linha, 1).value = subtitulo;
  ws.getCell(linha, 1).font = { size: 10, color: { argb: argb(CORES_MARCA.textoSecundario) } };
  linha += 2;

  ws.getCell(linha, 1).value = "FILTROS APLICADOS";
  negrito(ws.getCell(linha, 1));
  linha += 1;
  for (const [rotulo, valor] of filtros) {
    ws.getCell(linha, 1).value = rotulo;
    ws.getCell(linha, 1).font = { bold: true };
    ws.getCell(linha, 2).value = valor;
    linha += 1;
  }
  linha += 1;

  ws.getCell(linha, 1).value = "INDICADORES";
  negrito(ws.getCell(linha, 1));
  linha += 1;
  for (const indicador of indicadores) {
    ws.getCell(linha, 1).value = indicador.rotulo;
    ws.getCell(linha, 1).font = { bold: true };
    const celula = ws.getCell(linha, 2);
    celula.value = indicador.valor;
    const formato = indicador.tipo ? FORMATOS[indicador.tipo] : undefined;
    if (formato) celula.numFmt = formato;
    celula.alignment = { horizontal: "left" };
    linha += 1;
  }

  if (aviso) {
    linha += 1;
    ws.getCell(linha, 1).value = aviso.titulo;
    negrito(ws.getCell(linha, 1));
    linha += 1;
    ws.getCell(linha, 1).value = aviso.texto;
    ws.getCell(linha, 1).font = { italic: true, size: 9, color: { argb: argb(CORES_MARCA.textoSecundario) } };
  }
  return ws;
}

export interface AbaMontada {
  nome: string;
  linhaCabecalho: number;
  linhaTotal: number;
}

/**
 * Uma aba de detalhamento da origem (`renderExcelDetalhamento`): cabeçalho de colunas,
 * uma linha por item e a linha "TOTAL (N registros)" com as colunas que somam.
 */
export function escreverAba<L>(
  workbook: ExcelJS.Workbook,
  { nome, titulo, colunas, linhas }: { nome: string; titulo: string; colunas: readonly Coluna<L>[]; linhas: readonly L[] },
): AbaMontada {
  const worksheet = workbook.addWorksheet(nome);
  escreverCabecalhoMarca(workbook, worksheet, { titulo, colunas: colunas.length });

  const cabecalho = worksheet.addRow(colunas.map((c) => c.cabecalho));
  estilizarCabecalhoColunas(cabecalho);
  for (const item of linhas) worksheet.addRow(colunas.map((c) => c.celula(item)));

  colunas.forEach((definicao, indice) => {
    const coluna = worksheet.getColumn(indice + 1);
    coluna.width = definicao.largura;
    const formato = FORMATOS[definicao.tipo];
    if (formato) coluna.numFmt = formato;
    if (definicao.tipo === "data") coluna.alignment = { horizontal: "center" };
    else if (definicao.tipo !== "texto") coluna.alignment = { horizontal: "right" };
  });

  const primeira = cabecalho.number + 1;
  const ultima = cabecalho.number + linhas.length;
  worksheet.views = [{ state: "frozen", ySplit: cabecalho.number }];
  // Aba vazia não ganha filtro: o intervalo terminaria antes de começar e o Excel recusa o arquivo.
  if (linhas.length > 0) {
    worksheet.autoFilter = { from: { row: cabecalho.number, column: 1 }, to: { row: ultima, column: colunas.length } };
  }

  const total = worksheet.addRow([]);
  total.getCell(1).value = `TOTAL (${linhas.length} registros)`;
  colunas.forEach((definicao, indice) => {
    if (!definicao.somar || indice === 0) return;
    const resultado = somarValoresOperacionais(
      linhas.map((l) => {
        const v = definicao.celula(l);
        return typeof v === "number" ? v : 0;
      }),
    );
    const letra = worksheet.getColumn(indice + 1).letter;
    total.getCell(indice + 1).value =
      linhas.length > 0 ? { formula: `SUBTOTAL(109,${letra}${primeira}:${letra}${ultima})`, result: resultado } : 0;
  });
  total.eachCell((cell) => {
    cell.font = { bold: true };
  });

  return { nome, linhaCabecalho: cabecalho.number, linhaTotal: total.number };
}

const ROTULO_SEVERIDADE_PLANILHA: Record<Severidade, string> = {
  critical: "CRÍTICA",
  warning: "ATENÇÃO",
  info: "INFO",
};

/**
 * A aba "Anomalias" da origem (`renderExcelAnomaliasSheet`), nos três relatórios
 * consolidados: severidade desc, data desc; sem anomalia, a mensagem positiva.
 */
export function escreverAnomalias(workbook: ExcelJS.Workbook, anomalias: readonly Anomalia[]): ExcelJS.Worksheet {
  const ws = workbook.addWorksheet("Anomalias", { properties: { tabColor: { argb: argb(CORES_MARCA.amarelo) } } });
  let linha = escreverCabecalhoMarca(workbook, ws, { titulo: "Anomalias detectadas", colunas: 6 });
  ws.getCell(linha, 1).value = "Anomalias detectadas";
  negrito(ws.getCell(linha, 1), 14);
  linha += 2;

  if (anomalias.length === 0) {
    ws.getCell(linha, 1).value = "Nenhuma anomalia detectada no período.";
    ws.getCell(linha, 1).font = { italic: true, size: 11, color: { argb: argb(CORES_MARCA.textoSecundario) } };
    ws.getColumn(1).width = 60;
    return ws;
  }

  const ordenadas = [...anomalias].sort((a, b) => {
    const r = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (r !== 0) return r;
    return b.data.localeCompare(a.data);
  });

  ws.getCell(linha, 1).value = `${anomalias.length} anomalia(s), por severidade e da mais recente para a mais antiga`;
  ws.getCell(linha, 1).font = { italic: true, size: 10, color: { argb: argb(CORES_MARCA.textoSecundario) } };
  linha += 2;

  const cabecalho = ws.getRow(linha);
  ["Severidade", "Detector", "Data", "Título", "Descrição", "Ação sugerida"].forEach((texto, i) => {
    cabecalho.getCell(i + 1).value = texto;
  });
  estilizarCabecalhoColunas(cabecalho);

  for (const a of ordenadas) {
    linha += 1;
    const row = ws.getRow(linha);
    row.getCell(1).value = ROTULO_SEVERIDADE_PLANILHA[a.severity];
    row.getCell(2).value = a.detector;
    row.getCell(3).value = diaParaCelula(a.data);
    row.getCell(3).numFmt = "dd/mm/yyyy";
    row.getCell(4).value = a.title;
    row.getCell(5).value = a.description;
    row.getCell(6).value = a.acaoSugerida ?? "";
  }
  [12, 10, 12, 50, 60, 50].forEach((largura, i) => {
    ws.getColumn(i + 1).width = largura;
  });
  return ws;
}

// ---------------------------------------------------------------------------
// Colunas das abas
// ---------------------------------------------------------------------------

type ComRank<T> = T & { rank: number };

function comRank<T>(linhas: readonly T[]): ComRank<T>[] {
  return linhas.map((l, i) => ({ ...l, rank: i + 1 }));
}

const colunaRank: Coluna<{ rank: number }> = { cabecalho: "#", largura: 6, tipo: "inteiro", celula: (r) => r.rank };

export const COLUNAS_TOP_EQUIPAMENTOS: Coluna<ComRank<LinhaEquipamentoTop>>[] = [
  colunaRank,
  { cabecalho: "Equipamento", largura: 36, tipo: "texto", celula: (r) => r.nome },
  { cabecalho: "Código", largura: 18, tipo: "texto", celula: (r) => r.codigo },
  { cabecalho: "Saídas", largura: 10, tipo: "inteiro", celula: (r) => r.qtd, somar: true },
  { cabecalho: "Litros", largura: 16, tipo: "litros", celula: (r) => r.litros, somar: true },
  { cabecalho: "Custo", largura: 18, tipo: "dinheiro", celula: (r) => r.custo, somar: true },
  { cabecalho: "R$/L", largura: 14, tipo: "preco", celula: (r) => r.rPorL },
];

export const COLUNAS_TOP_CARRETAS: Coluna<ComRank<LinhaCarretaTop>>[] = [
  colunaRank,
  { cabecalho: "Placa", largura: 14, tipo: "texto", celula: (r) => r.placa },
  { cabecalho: "Transportadora", largura: 30, tipo: "texto", celula: (r) => r.transportadora },
  { cabecalho: "Saídas", largura: 10, tipo: "inteiro", celula: (r) => r.qtd, somar: true },
  { cabecalho: "Litros", largura: 16, tipo: "litros", celula: (r) => r.litros, somar: true },
  { cabecalho: "Custo", largura: 18, tipo: "dinheiro", celula: (r) => r.custo, somar: true },
  { cabecalho: "R$/L", largura: 14, tipo: "preco", celula: (r) => r.rPorL },
];

export const COLUNAS_TOP_OBRAS: Coluna<ComRank<LinhaTop>>[] = [
  colunaRank,
  { cabecalho: "Obra", largura: 50, tipo: "texto", celula: (r) => r.nome },
  { cabecalho: "Saídas", largura: 10, tipo: "inteiro", celula: (r) => r.qtd, somar: true },
  { cabecalho: "Litros", largura: 16, tipo: "litros", celula: (r) => r.litros, somar: true },
  { cabecalho: "Custo", largura: 18, tipo: "dinheiro", celula: (r) => r.custo, somar: true },
  { cabecalho: "R$/L", largura: 14, tipo: "preco", celula: (r) => r.rPorL },
];

export const COLUNAS_FORNECEDORES: Coluna<ComRank<LinhaTop>>[] = [
  colunaRank,
  { cabecalho: "Fornecedor", largura: 50, tipo: "texto", celula: (r) => r.nome },
  { cabecalho: "Compras", largura: 10, tipo: "inteiro", celula: (r) => r.qtd, somar: true },
  { cabecalho: "Litros", largura: 16, tipo: "litros", celula: (r) => r.litros, somar: true },
  { cabecalho: "Custo", largura: 18, tipo: "dinheiro", celula: (r) => r.custo, somar: true },
  { cabecalho: "R$/L médio", largura: 14, tipo: "preco", celula: (r) => r.rPorL },
];

function colunasSaidasObra(c: CadastrosRelatorio, combustivel: ReadonlyMap<string, string>): Coluna<SaidaBase>[] {
  return [
    { cabecalho: "Data", largura: 14, tipo: "data", celula: (s) => diaParaCelula(s.data) },
    { cabecalho: "Consumidor", largura: 40, tipo: "texto", celula: (s) => consumidorDaSaida(s, c) },
    {
      cabecalho: "Tipo",
      largura: 14,
      tipo: "texto",
      celula: (s) => (s.tipoConsumidor === "equipamento_proprio" ? "Equipamento" : "Carreta"),
    },
    { cabecalho: "Combustível", largura: 18, tipo: "texto", celula: (s) => combustivel.get(s.tipoCombustivel) ?? s.tipoCombustivel },
    { cabecalho: "Litros", largura: 14, tipo: "litros", celula: (s) => s.litros, somar: true },
    { cabecalho: "R$/L", largura: 14, tipo: "preco", celula: (s) => rPorLDaSaida(s) },
    { cabecalho: "Custo", largura: 16, tipo: "dinheiro", celula: (s) => s.valorTotal, somar: true },
  ];
}

function colunasSaidasEquipamento(c: CadastrosRelatorio, combustivel: ReadonlyMap<string, string>): Coluna<SaidaBase>[] {
  return [
    { cabecalho: "Data", largura: 14, tipo: "data", celula: (s) => diaParaCelula(s.data) },
    { cabecalho: "Obra", largura: 40, tipo: "texto", celula: (s) => (s.obraId ? (c.obraNome.get(s.obraId) ?? "-") : "-") },
    { cabecalho: "Combustível", largura: 18, tipo: "texto", celula: (s) => combustivel.get(s.tipoCombustivel) ?? s.tipoCombustivel },
    { cabecalho: "Litros", largura: 14, tipo: "litros", celula: (s) => s.litros, somar: true },
    { cabecalho: "R$/L", largura: 14, tipo: "preco", celula: (s) => rPorLDaSaida(s) },
    { cabecalho: "Custo", largura: 16, tipo: "dinheiro", celula: (s) => s.valorTotal, somar: true },
  ];
}

// ---------------------------------------------------------------------------
// Os quatro relatórios
// ---------------------------------------------------------------------------

export interface ContextoRelatorio {
  cadastros: CadastrosRelatorio;
  combustivelNome: ReadonlyMap<string, string>;
  anomalias: readonly Anomalia[];
}

const aviso = (qtdSentinel: number) =>
  qtdSentinel > 0
    ? {
        titulo: `Atenção: ${qtdSentinel} saída(s) sem equipamento identificado`,
        texto: 'Atribuir o equipamento em Combustível > Anomalias (detector D1) melhora a precisão deste relatório.',
      }
    : null;

/** Mensal Consolidado: Resumo · Equipamentos · Carretas · Obras · Fornecedores · Anomalias. */
export function montarMensal(mes: string, dados: DadosMensal, contexto: ContextoRelatorio): ExcelJS.Workbook {
  const workbook = novoWorkbook();
  const titulo = "Combustível · Relatório Mensal Consolidado";
  const subtitulo = `Visão executiva de consumo, custo e operação · ${formatarMesRef(mes)}`;
  const t = dados.totais;
  escreverResumo(workbook, {
    titulo,
    subtitulo,
    filtros: [
      ["Mês referência", formatarMesRef(mes)],
      ["Total saídas", `${t.qtdSaidas} registros`],
    ],
    indicadores: [
      { rotulo: "Volume Total", valor: t.volume, tipo: "litros" },
      { rotulo: "Custo Total", valor: t.custo, tipo: "dinheiro" },
      { rotulo: "R$/L Médio", valor: t.rPorL, tipo: "preco" },
      { rotulo: "Compras", valor: t.custoCompras, tipo: "dinheiro" },
      { rotulo: "Equipamentos próprios", valor: t.qtdEquipamentosProprios, tipo: "inteiro" },
      { rotulo: "Carretas (placas)", valor: t.qtdCarretas, tipo: "inteiro" },
      { rotulo: "Obras com saída", valor: t.qtdObras, tipo: "inteiro" },
      { rotulo: "Fornecedores", valor: t.qtdFornecedores, tipo: "inteiro" },
    ],
    aviso: aviso(t.qtdSentinel),
  });
  escreverAba(workbook, { nome: "Equipamentos", titulo, colunas: COLUNAS_TOP_EQUIPAMENTOS, linhas: comRank(dados.topEquipamentos) });
  escreverAba(workbook, { nome: "Carretas", titulo, colunas: COLUNAS_TOP_CARRETAS, linhas: comRank(dados.topCarretas) });
  escreverAba(workbook, { nome: "Obras", titulo, colunas: COLUNAS_TOP_OBRAS, linhas: comRank(dados.topObras) });
  escreverAba(workbook, { nome: "Fornecedores", titulo, colunas: COLUNAS_FORNECEDORES, linhas: comRank(dados.fornecedores) });
  escreverAnomalias(workbook, contexto.anomalias);
  return workbook;
}

/** Por Obra: Resumo · Saídas · Equipamentos · Fornecedores · Anomalias. */
export function montarPorObra(
  obraNome: string,
  mes: string,
  dados: DadosPorObra,
  contexto: ContextoRelatorio,
): ExcelJS.Workbook {
  const workbook = novoWorkbook();
  const titulo = "Combustível · Relatório Por Obra";
  const subtitulo = `${obraNome} · ${formatarMesRef(mes)}`;
  const t = dados.totais;
  escreverResumo(workbook, {
    titulo,
    subtitulo,
    filtros: [
      ["Obra", obraNome],
      ["Mês referência", formatarMesRef(mes)],
      ["Total saídas", `${t.qtdSaidas} registros`],
    ],
    indicadores: [
      { rotulo: "Volume Total", valor: t.volume, tipo: "litros" },
      { rotulo: "Custo Total", valor: t.custo, tipo: "dinheiro" },
      { rotulo: "R$/L Médio", valor: t.rPorL, tipo: "preco" },
      { rotulo: "Saídas", valor: t.qtdSaidas, tipo: "inteiro" },
      { rotulo: "Equipamentos próprios", valor: t.qtdEquipamentos, tipo: "inteiro" },
      { rotulo: "Carretas", valor: t.qtdCarretas, tipo: "inteiro" },
      { rotulo: "Fornecedores (mês)", valor: t.qtdFornecedores, tipo: "inteiro" },
      { rotulo: "Compras (Entradas)", valor: t.custoCompras, tipo: "dinheiro" },
    ],
    aviso: aviso(t.qtdSentinel),
  });
  escreverAba(workbook, {
    nome: "Saídas",
    titulo,
    colunas: colunasSaidasObra(contexto.cadastros, contexto.combustivelNome),
    linhas: dados.saidasDesc,
  });
  escreverAba(workbook, { nome: "Equipamentos", titulo, colunas: COLUNAS_TOP_EQUIPAMENTOS, linhas: comRank(dados.topEquipamentos) });
  escreverAba(workbook, { nome: "Fornecedores", titulo, colunas: COLUNAS_FORNECEDORES, linhas: comRank(dados.fornecedores) });
  escreverAnomalias(workbook, contexto.anomalias);
  return workbook;
}

/** "Fev-Mai-2026" (mesmo ano), "Out-2025-Jan-2026", "Mai-2026": o `formatRangeLabel` da origem. */
export function rotuloDoIntervalo(de: string, ate: string): string {
  const [anoDe, mesDe] = de.split("-");
  const [anoAte, mesAte] = ate.split("-");
  const iDe = Number(mesDe) - 1;
  const iAte = Number(mesAte) - 1;
  if (iDe < 0 || iDe > 11 || iAte < 0 || iAte > 11) return `${de} a ${ate}`;
  if (anoDe === anoAte) {
    if (mesDe === mesAte) return `${MESES_CURTOS[iDe]}-${anoDe}`;
    return `${MESES_CURTOS[iDe]}-${MESES_CURTOS[iAte]}-${anoDe}`;
  }
  return `${MESES_CURTOS[iDe]}-${anoDe}-${MESES_CURTOS[iAte]}-${anoAte}`;
}

export interface EquipamentoDoRelatorio {
  rotulo: string;
  tipo: string | null;
  marca: string | null;
}

/** Por Equipamento: Resumo · Saídas · Obras · Fornecedores · Anomalias. */
export function montarPorEquipamento(
  equipamento: EquipamentoDoRelatorio,
  periodo: { de: string; ate: string },
  dados: DadosPorEquipamento,
  contexto: ContextoRelatorio,
): ExcelJS.Workbook {
  const workbook = novoWorkbook();
  const titulo = "Combustível · Relatório Por Equipamento";
  const intervalo = `${formatarDiaBR(periodo.de)} a ${formatarDiaBR(periodo.ate)}`;
  const t = dados.totais;
  const tipoMarca = [equipamento.tipo?.trim() || "-", equipamento.marca?.trim()].filter(Boolean).join(" · ");
  escreverResumo(workbook, {
    titulo,
    subtitulo: `${equipamento.rotulo} · ${intervalo}`,
    filtros: [
      ["Equipamento", equipamento.rotulo],
      ["Período", intervalo],
      ["Tipo / marca", tipoMarca],
      ["Total saídas", `${t.qtdSaidas} registros · ${t.diasAtivos} dia(s) ativo(s)`],
    ],
    indicadores: [
      { rotulo: "Volume Total", valor: t.volume, tipo: "litros" },
      { rotulo: "Custo Total", valor: t.custo, tipo: "dinheiro" },
      { rotulo: "R$/L Médio", valor: t.rPorL, tipo: "preco" },
      { rotulo: "Saídas", valor: t.qtdSaidas, tipo: "inteiro" },
      { rotulo: "Obras atendidas", valor: t.qtdObras, tipo: "inteiro" },
      { rotulo: "Dias ativos", valor: t.diasAtivos, tipo: "inteiro" },
      { rotulo: "Fornecedores (período)", valor: t.qtdFornecedores, tipo: "inteiro" },
      { rotulo: "Compras no período", valor: t.custoCompras, tipo: "dinheiro" },
    ],
    aviso:
      t.qtdSaidas === 0
        ? { titulo: "Sem saídas para este equipamento no período.", texto: "Tente um intervalo maior ou outro equipamento." }
        : null,
  });
  escreverAba(workbook, {
    nome: "Saídas",
    titulo,
    colunas: colunasSaidasEquipamento(contexto.cadastros, contexto.combustivelNome),
    linhas: dados.saidasDesc,
  });
  escreverAba(workbook, { nome: "Obras", titulo, colunas: COLUNAS_TOP_OBRAS, linhas: comRank(dados.topObras) });
  escreverAba(workbook, { nome: "Fornecedores", titulo, colunas: COLUNAS_FORNECEDORES, linhas: comRank(dados.fornecedores) });
  escreverAnomalias(workbook, contexto.anomalias);
  return workbook;
}

// ---------------------------------------------------------------------------
// Raw export
// ---------------------------------------------------------------------------

const TIPO_CONSUMIDOR_ROTULO: Record<string, string> = {
  equipamento_proprio: "Equipamento próprio",
  carreta_transportadora: "Carreta terceirizada",
};

const ORIGEM_ROTULO: Record<string, string> = {
  tanque: "Tanque",
  dinheiro: "Dinheiro",
  requisicao: "Requisição",
};

export interface DadosBruto {
  saidas: readonly SaidaBase[];
  entradas: readonly EntradaRelatorio[];
  transferencias: readonly TransferenciaRelatorio[];
  tanques: readonly TanqueBase[];
  /** Nome de quem lançou, pelo id do usuário. */
  usuarioNome: ReadonlyMap<string, string>;
  /** Cadastros de referência (aba Cadastros). */
  equipamentosAtivos: readonly { descricao: string; codigo: string | null; tipo: string | null; marca: string | null; modelo: string | null }[];
  transportadoras: readonly string[];
  combustiveis: readonly { nome: string; unidade: string | null }[];
}

export function colunasBrutoSaidas(
  c: CadastrosRelatorio,
  combustivel: ReadonlyMap<string, string>,
  tanqueNome: ReadonlyMap<string, string>,
  usuarioNome: ReadonlyMap<string, string>,
): Coluna<SaidaBase>[] {
  return [
    { cabecalho: "Data", largura: 14, tipo: "data", celula: (s) => diaParaCelula(s.data) },
    { cabecalho: "Tipo Consumidor", largura: 22, tipo: "texto", celula: (s) => TIPO_CONSUMIDOR_ROTULO[s.tipoConsumidor] ?? s.tipoConsumidor },
    { cabecalho: "Consumidor", largura: 36, tipo: "texto", celula: (s) => consumidorDaSaida(s, c) },
    { cabecalho: "Origem", largura: 14, tipo: "texto", celula: (s) => ORIGEM_ROTULO[s.origem] ?? s.origem },
    { cabecalho: "Tanque", largura: 22, tipo: "texto", celula: (s) => (s.tanqueId ? (tanqueNome.get(s.tanqueId) ?? "-") : "-") },
    { cabecalho: "Obra", largura: 36, tipo: "texto", celula: (s) => (s.obraId ? (c.obraNome.get(s.obraId) ?? "-") : "-") },
    { cabecalho: "Combustível", largura: 18, tipo: "texto", celula: (s) => combustivel.get(s.tipoCombustivel) ?? s.tipoCombustivel },
    { cabecalho: "Litros", largura: 14, tipo: "litros", celula: (s) => s.litros, somar: true },
    { cabecalho: "Preço/L", largura: 14, tipo: "preco", celula: (s) => s.precoUnitario },
    { cabecalho: "R$/L Total", largura: 14, tipo: "preco", celula: (s) => rPorLDaSaida(s) },
    { cabecalho: "Valor Total", largura: 16, tipo: "dinheiro", celula: (s) => s.valorTotal, somar: true },
    { cabecalho: "Motorista", largura: 22, tipo: "texto", celula: (s) => s.motorista ?? "" },
    // Só faz sentido na requisição; nas outras a origem mostra o traço.
    { cabecalho: "Pago", largura: 8, tipo: "texto", celula: (s) => (s.origem === "requisicao" ? (s.pago ? "Sim" : "Não") : "-") },
    { cabecalho: "Pago em", largura: 14, tipo: "data", celula: (s) => diaParaCelula(s.pagoEm ? s.pagoEm : null) },
    { cabecalho: "Observações", largura: 30, tipo: "texto", celula: (s) => s.observacoes ?? "" },
    { cabecalho: "Criado por", largura: 22, tipo: "texto", celula: (s) => (s.createdBy ? (usuarioNome.get(s.createdBy) ?? "") : "") },
  ];
}

/** Raw Export: Resumo · Saídas · Entradas · Transferências · Cadastros (sem agregação, sem Anomalias, como na origem). */
export function montarBruto(mes: string, dados: DadosBruto, contexto: Omit<ContextoRelatorio, "anomalias">): ExcelJS.Workbook {
  const workbook = novoWorkbook();
  const titulo = "Combustível · Raw Export";
  const tanqueNome = new Map(dados.tanques.map((t) => [t.id, t.nomeExibicao]));
  const usuario = (id: string | null) => (id ? (dados.usuarioNome.get(id) ?? "") : "");
  const somar = somarValoresOperacionais;

  escreverResumo(workbook, {
    titulo,
    subtitulo: `Dados crus por mês: saídas, entradas, transferências · ${formatarMesRef(mes)}`,
    filtros: [
      ["Mês referência", formatarMesRef(mes)],
      ["Saídas", `${dados.saidas.length} registros`],
      ["Entradas", `${dados.entradas.length} registros`],
      ["Transferências", `${dados.transferencias.length} registros`],
    ],
    indicadores: [
      { rotulo: "Volume saídas", valor: somar(dados.saidas.map((s) => s.litros)), tipo: "litros" },
      { rotulo: "Custo saídas", valor: somar(dados.saidas.map((s) => s.valorTotal)), tipo: "dinheiro" },
      { rotulo: "Volume entradas", valor: somar(dados.entradas.map((e) => e.litros)), tipo: "litros" },
      { rotulo: "Custo entradas", valor: dados.entradas.reduce((a, e) => a + e.valorTotal, 0), tipo: "dinheiro" },
      { rotulo: "Volume transferências", valor: somar(dados.transferencias.map((t) => t.litros)), tipo: "litros" },
      { rotulo: "Qtd saídas", valor: dados.saidas.length, tipo: "inteiro" },
      { rotulo: "Qtd entradas", valor: dados.entradas.length, tipo: "inteiro" },
      { rotulo: "Qtd transferências", valor: dados.transferencias.length, tipo: "inteiro" },
    ],
  });

  escreverAba(workbook, {
    nome: "Saídas",
    titulo,
    colunas: colunasBrutoSaidas(contexto.cadastros, contexto.combustivelNome, tanqueNome, dados.usuarioNome),
    linhas: saidasDesc(dados.saidas),
  });

  escreverAba<EntradaRelatorio>(workbook, {
    nome: "Entradas",
    titulo,
    colunas: [
      { cabecalho: "Data", largura: 14, tipo: "data", celula: (e) => diaParaCelula(e.dataHora) },
      { cabecalho: "Tanque", largura: 26, tipo: "texto", celula: (e) => tanqueNome.get(e.tanqueId) ?? "-" },
      {
        cabecalho: "Combustível",
        largura: 18,
        tipo: "texto",
        celula: (e) => contexto.combustivelNome.get(e.tipoCombustivel) ?? e.tipoCombustivel,
      },
      { cabecalho: "Litros", largura: 14, tipo: "litros", celula: (e) => e.litros, somar: true },
      { cabecalho: "R$/L", largura: 14, tipo: "preco", celula: (e) => (e.litros > 0 ? e.valorTotal / e.litros : 0) },
      { cabecalho: "Valor Total", largura: 16, tipo: "dinheiro", celula: (e) => e.valorTotal, somar: true },
      { cabecalho: "Fornecedor", largura: 30, tipo: "texto", celula: (e) => e.fornecedor || "-" },
      { cabecalho: "Nota Fiscal", largura: 16, tipo: "texto", celula: (e) => e.notaFiscal ?? "" },
      { cabecalho: "Observações", largura: 30, tipo: "texto", celula: (e) => e.observacoes ?? "" },
      { cabecalho: "Criado por", largura: 22, tipo: "texto", celula: (e) => usuario(e.createdBy) },
    ],
    linhas: [...dados.entradas].sort((a, b) => b.dataHora.localeCompare(a.dataHora)),
  });

  escreverAba<TransferenciaRelatorio>(workbook, {
    nome: "Transferências",
    titulo,
    colunas: [
      { cabecalho: "Data", largura: 14, tipo: "data", celula: (t) => diaParaCelula(t.dataHora) },
      { cabecalho: "Tanque Origem", largura: 26, tipo: "texto", celula: (t) => tanqueNome.get(t.tanqueOrigemId) ?? "-" },
      { cabecalho: "Tanque Destino", largura: 26, tipo: "texto", celula: (t) => tanqueNome.get(t.tanqueDestinoId) ?? "-" },
      { cabecalho: "Litros", largura: 14, tipo: "litros", celula: (t) => t.litros, somar: true },
      { cabecalho: "Valor Total", largura: 16, tipo: "dinheiro", celula: (t) => t.valorTotal, somar: true },
      { cabecalho: "Observações", largura: 30, tipo: "texto", celula: (t) => t.observacoes ?? "" },
      { cabecalho: "Criado por", largura: 22, tipo: "texto", celula: (t) => usuario(t.createdBy) },
    ],
    linhas: [...dados.transferencias].sort((a, b) => b.dataHora.localeCompare(a.dataHora)),
  });

  escreverCadastros(workbook, dados, contexto.cadastros);
  return workbook;
}

/** A aba "Cadastros" da origem: tanques, equipamentos, transportadoras e combustíveis, empilhados. */
function escreverCadastros(workbook: ExcelJS.Workbook, dados: DadosBruto, cadastros: CadastrosRelatorio): void {
  const ws = workbook.addWorksheet("Cadastros");
  let linha = escreverCabecalhoMarca(workbook, ws, { titulo: "Cadastros de referência", colunas: 5 });
  ws.columns = [{ width: 36 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 30 }];

  const bloco = (titulo: string, cabecalhos: string[], linhas: (string | number)[][]) => {
    ws.getCell(linha, 1).value = titulo;
    negrito(ws.getCell(linha, 1));
    linha += 1;
    const cabecalho = ws.getRow(linha);
    cabecalhos.forEach((texto, i) => {
      cabecalho.getCell(i + 1).value = texto;
    });
    estilizarCabecalhoColunas(cabecalho);
    for (const valores of linhas) {
      linha += 1;
      const row = ws.getRow(linha);
      valores.forEach((v, i) => {
        row.getCell(i + 1).value = v;
      });
    }
    linha += 2;
  };

  bloco(
    "Tanques / Depósitos",
    ["Nome", "Apelido", "Capacidade (L)", "Externo", "Proprietária"],
    dados.tanques
      .filter((t) => t.ativo)
      .map((t) => [
        t.nome,
        t.apelido ?? "",
        t.capacidadeLitros,
        t.ehExterno ? "Sim" : "Não",
        t.proprietarioId ? (cadastros.transportadoraNome.get(t.proprietarioId) ?? "-") : "EMT (interno)",
      ]),
  );
  bloco(
    "Equipamentos",
    ["Nome", "Código", "Tipo", "Marca / Modelo"],
    dados.equipamentosAtivos.map((e) => [
      e.descricao,
      e.codigo ?? "",
      e.tipo ?? "",
      `${e.marca ?? ""}${e.modelo ? ` · ${e.modelo}` : ""}`.trim(),
    ]),
  );
  bloco(
    "Transportadoras",
    ["Nome"],
    [...dados.transportadoras].sort((a, b) => a.localeCompare(b, "pt-BR")).map((nome) => [nome]),
  );
  bloco(
    "Combustíveis",
    ["Nome", "Unidade"],
    dados.combustiveis.map((c) => [c.nome, c.unidade ?? ""]),
  );
}

// ---------------------------------------------------------------------------
// Nomes de arquivo (os da origem)
// ---------------------------------------------------------------------------

export function nomeArquivoMensal(mes: string): string {
  return `EMT - Mensal Consolidado - ${formatarMesRef(mes).replace("/", "-")}.xlsx`;
}

export function nomeArquivoPorObra(obraNome: string, mes: string): string {
  return `EMT - Por Obra - ${parteDeNomeDeArquivo(obraNome)} - ${formatarMesRef(mes).replace("/", "-")}.xlsx`;
}

export function nomeArquivoPorEquipamento(slug: string, de: string, ate: string): string {
  return `EMT - Por Equipamento - ${parteDeNomeDeArquivo(slug)} - ${rotuloDoIntervalo(de, ate)}.xlsx`;
}

export function nomeArquivoBruto(mes: string): string {
  return `EMT - Raw Export - ${formatarMesRef(mes).replace("/", "-")}.xlsx`;
}
