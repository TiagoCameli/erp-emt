import ExcelJS from "exceljs";

import { argb, CORES_MARCA, EMPRESA } from "@/config/marca";
import { escreverCabecalhoMarca, estilizarCabecalhoColunas } from "@/lib/planilha-marca";
import { totaisDosFretes } from "@/modules/frete/fretes/calculo";
import type { FiltrosFretes } from "@/modules/frete/fretes/filtros";
import { ROTULO_TIPO_FRETE } from "@/modules/frete/fretes/schemas";
import type { FreteLinha } from "@/modules/frete/fretes/tipos";

/**
 * "Exportar Excel" da aba Fretes, com as abas, colunas e números de
 * utils/freteExport.ts da origem: "Resumo" (filtros, 4 indicadores e as mini-tabelas
 * POR TRANSPORTADORA, POR MATERIAL, POR ORIGEM e POR MOTORISTA (TOP 10)) e
 * "Detalhamento" (uma linha por frete, saída desc, com o TOTAL no pé).
 *
 * O que muda é a moldura: cada aba leva o cabeçalho de marca do ERP (regra de todo
 * documento que o sistema emite), e as datas saem como data do Excel.
 *
 * **Módulo de servidor**: puxa o exceljs. A action o carrega por `await import`.
 */

export const TITULO_PLANILHA = "Relatório de Fretes";
export const SUBTITULO_PLANILHA = "Módulo de Frete";

const FMT_DINHEIRO = '"R$" #,##0.00';
const FMT_PRECO = '"R$" #,##0.0000';
const FMT_PESO = "#,##0.00";
const FMT_PCT = "0.0%";

/** "fretes-2026-09-24.xlsx" (o `makeFilename` da origem, com o dia de Rio Branco). */
export function nomeArquivoFretes(hoje: string): string {
  return `fretes-${hoje}.xlsx`;
}

function diaParaCelula(dia: string | null): Date | null {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function diaBR(dia: string): string {
  return dia.split("-").reverse().join("/");
}

export interface Agregado {
  chave: string;
  registros: number;
  peso: number;
  valor: number;
}

/** O `agrupar` da origem: soma por chave e ordena por valor desc. Chave vazia sai. */
export function agruparFretes(fretes: readonly FreteLinha[], chave: (f: FreteLinha) => string): Agregado[] {
  const mapa = new Map<string, Agregado>();
  for (const f of fretes) {
    const k = chave(f);
    if (!k) continue;
    const atual = mapa.get(k);
    if (atual) {
      atual.registros += 1;
      atual.peso += f.pesoToneladas;
      atual.valor += f.valorTotal;
    } else {
      mapa.set(k, { chave: k, registros: 1, peso: f.pesoToneladas, valor: f.valorTotal });
    }
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor);
}

/**
 * Linhas de uma mini-tabela: o % é sobre o agrupamento INTEIRO (mesmo no TOP 10) e o
 * total é das linhas mostradas, como a origem.
 */
export function linhasMiniTabela(agregados: readonly Agregado[], limite?: number) {
  const mostrados = limite ? agregados.slice(0, limite) : [...agregados];
  const totalPeso = agregados.reduce((s, r) => s + r.peso, 0) || 1;
  const totalValor = agregados.reduce((s, r) => s + r.valor, 0) || 1;
  return {
    linhas: mostrados.map((r) => ({ ...r, pctPeso: r.peso / totalPeso, pctValor: r.valor / totalValor })),
    total: {
      registros: mostrados.reduce((s, r) => s + r.registros, 0),
      peso: mostrados.reduce((s, r) => s + r.peso, 0),
      valor: mostrados.reduce((s, r) => s + r.valor, 0),
    },
  };
}

/** Os filtros aplicados, como a origem lista (`buildFiltrosList`). */
export function filtrosDescritos(filtros: FiltrosFretes, fretes: readonly FreteLinha[]): [string, string][] {
  const nome = (campo: keyof FreteLinha, id: string, nomeCampo: keyof FreteLinha): string => {
    const achado = fretes.find((f) => f[campo] === id);
    return achado ? String(achado[nomeCampo] ?? id) : id;
  };
  const lista: [string, string][] = [];
  if (filtros.tipo) lista.push(["Tipo", ROTULO_TIPO_FRETE[filtros.tipo]]);
  if (filtros.obraId) lista.push(["Obra", nome("centroCustoId", filtros.obraId, "obraNome")]);
  if (filtros.transportadoraId)
    lista.push(["Transportadora", nome("transportadoraId", filtros.transportadoraId, "transportadoraNome")]);
  if (filtros.motorista) lista.push(["Motorista", filtros.motorista]);
  if (filtros.insumoId) lista.push(["Material", nome("insumoId", filtros.insumoId, "insumoNome")]);
  if (filtros.origemId) lista.push(["Origem", nome("origemId", filtros.origemId, "origemNome")]);
  if (filtros.destinoId) lista.push(["Destino", nome("destinoId", filtros.destinoId, "destinoNome")]);
  if (filtros.de) lista.push(["Data início", diaBR(filtros.de)]);
  if (filtros.ate) lista.push(["Data fim", diaBR(filtros.ate)]);
  if (filtros.busca) lista.push(["Nota Fiscal", filtros.busca]);
  return lista;
}

/** Preço unit. do material na planilha: +(vm/peso).toFixed(4), zero sem os dois. */
export function precoUnitarioPlanilha(valorMaterial: number, peso: number): number {
  return valorMaterial && peso ? Number((valorMaterial / peso).toFixed(4)) : 0;
}

function negrito(celula: ExcelJS.Cell, tamanho = 11): void {
  celula.font = { bold: true, size: tamanho, color: { argb: argb(CORES_MARCA.verdeEscuro) } };
}

function escreverResumo(workbook: ExcelJS.Workbook, fretes: readonly FreteLinha[], filtros: FiltrosFretes): void {
  const ws = workbook.addWorksheet("Resumo", { properties: { tabColor: { argb: argb(CORES_MARCA.verde) } } });
  let linha = escreverCabecalhoMarca(workbook, ws, { titulo: TITULO_PLANILHA, colunas: 6 });
  ws.columns = [{ width: 34 }, { width: 12 }, { width: 14 }, { width: 18 }, { width: 10 }, { width: 10 }];

  ws.getCell(linha, 1).value = TITULO_PLANILHA;
  negrito(ws.getCell(linha, 1), 14);
  linha += 1;
  ws.getCell(linha, 1).value = SUBTITULO_PLANILHA;
  ws.getCell(linha, 1).font = { size: 10, color: { argb: argb(CORES_MARCA.textoSecundario) } };
  linha += 2;

  const descritos = filtrosDescritos(filtros, fretes);
  ws.getCell(linha, 1).value = "FILTROS APLICADOS";
  negrito(ws.getCell(linha, 1));
  linha += 1;
  if (descritos.length === 0) {
    ws.getCell(linha, 1).value = "Nenhum filtro: todos os fretes";
    linha += 1;
  }
  for (const [rotulo, valor] of descritos) {
    ws.getCell(linha, 1).value = rotulo;
    ws.getCell(linha, 1).font = { bold: true };
    ws.getCell(linha, 2).value = valor;
    linha += 1;
  }
  linha += 1;

  const totais = totaisDosFretes(fretes);
  ws.getCell(linha, 1).value = "INDICADORES";
  negrito(ws.getCell(linha, 1));
  linha += 1;
  const indicadores: [string, number, string][] = [
    ["Registros", totais.quantidade, "0"],
    ["Peso Total", totais.peso, '#,##0.00 "t"'],
    ["Valor Fretes", totais.valor, FMT_DINHEIRO],
    ["Valor Material", totais.valorMaterial, FMT_DINHEIRO],
  ];
  for (const [rotulo, valor, formato] of indicadores) {
    ws.getCell(linha, 1).value = rotulo;
    ws.getCell(linha, 1).font = { bold: true };
    const celula = ws.getCell(linha, 2);
    celula.value = valor;
    celula.numFmt = formato;
    celula.alignment = { horizontal: "left" };
    linha += 1;
  }

  const mini = (titulo: string, rotulo: string, agregados: Agregado[], limite?: number) => {
    linha += 1;
    ws.getCell(linha, 1).value = titulo;
    negrito(ws.getCell(linha, 1));
    linha += 1;
    const cabecalho = ws.getRow(linha);
    [rotulo, "Registros", "Peso (t)", "Valor Total", "% Peso", "% Valor"].forEach((texto, i) => {
      cabecalho.getCell(i + 1).value = texto;
    });
    estilizarCabecalhoColunas(cabecalho);
    const { linhas, total } = linhasMiniTabela(agregados, limite);
    for (const r of linhas) {
      linha += 1;
      const row = ws.getRow(linha);
      row.getCell(1).value = r.chave;
      row.getCell(2).value = r.registros;
      row.getCell(3).value = r.peso;
      row.getCell(3).numFmt = FMT_PESO;
      row.getCell(4).value = r.valor;
      row.getCell(4).numFmt = FMT_DINHEIRO;
      row.getCell(5).value = r.pctPeso;
      row.getCell(5).numFmt = FMT_PCT;
      row.getCell(6).value = r.pctValor;
      row.getCell(6).numFmt = FMT_PCT;
    }
    linha += 1;
    const rodape = ws.getRow(linha);
    rodape.getCell(1).value = "Total";
    rodape.getCell(2).value = total.registros;
    rodape.getCell(3).value = total.peso;
    rodape.getCell(3).numFmt = FMT_PESO;
    rodape.getCell(4).value = total.valor;
    rodape.getCell(4).numFmt = FMT_DINHEIRO;
    rodape.eachCell((c) => {
      c.font = { bold: true };
    });
    linha += 1;
  };

  mini("POR TRANSPORTADORA", "Transportadora", agruparFretes(fretes, (f) => f.transportadoraNome));
  mini("POR MATERIAL", "Material", agruparFretes(fretes, (f) => f.insumoNome));
  mini("POR ORIGEM", "Origem", agruparFretes(fretes, (f) => f.origemNome || "-"));
  mini("POR MOTORISTA (TOP 10)", "Motorista", agruparFretes(fretes, (f) => f.motorista || "-"), 10);
}

interface ColunaDetalhe {
  cabecalho: string;
  largura: number;
  formato?: string;
  valor: (f: FreteLinha) => string | number | Date | null;
  soma?: (fretes: readonly FreteLinha[]) => number;
}

export const COLUNAS_DETALHAMENTO: ColunaDetalhe[] = [
  { cabecalho: "Saída", largura: 12, formato: "dd/mm/yyyy", valor: (f) => diaParaCelula(f.data) },
  { cabecalho: "Chegada", largura: 12, formato: "dd/mm/yyyy", valor: (f) => diaParaCelula(f.dataChegada) ?? "-" },
  { cabecalho: "Tipo", largura: 14, valor: (f) => ROTULO_TIPO_FRETE[f.tipo] },
  { cabecalho: "Origem", largura: 20, valor: (f) => f.origemNome || "-" },
  { cabecalho: "Destino", largura: 20, valor: (f) => f.destinoNome || "-" },
  { cabecalho: "Transportadora", largura: 24, valor: (f) => f.transportadoraNome || "-" },
  { cabecalho: "Motorista", largura: 20, valor: (f) => f.motorista || "-" },
  { cabecalho: "Placa", largura: 12, valor: (f) => f.placaCarreta || "-" },
  { cabecalho: "Material", largura: 22, valor: (f) => f.insumoNome || "-" },
  {
    cabecalho: "Peso (t)",
    largura: 12,
    formato: FMT_PESO,
    valor: (f) => f.pesoToneladas,
    soma: (fs) => fs.reduce((s, f) => s + f.pesoToneladas, 0),
  },
  { cabecalho: "KM", largura: 10, formato: "#,##0.0", valor: (f) => f.kmRodados },
  { cabecalho: "R$/TKM", largura: 12, formato: "#,##0.0000", valor: (f) => f.valorTkm },
  {
    cabecalho: "Valor Total",
    largura: 16,
    formato: FMT_DINHEIRO,
    valor: (f) => f.valorTotal,
    soma: (fs) => fs.reduce((s, f) => s + f.valorTotal, 0),
  },
  {
    cabecalho: "Preço Material",
    largura: 16,
    formato: FMT_DINHEIRO,
    valor: (f) => f.valorMaterial || 0,
    soma: (fs) => fs.reduce((s, f) => s + (f.valorMaterial || 0), 0),
  },
  {
    cabecalho: "Preço Unit. Material (R$/t)",
    largura: 22,
    formato: FMT_PRECO,
    valor: (f) => precoUnitarioPlanilha(f.valorMaterial, f.pesoToneladas),
  },
  { cabecalho: "NF", largura: 14, valor: (f) => f.notaFiscal || "-" },
  { cabecalho: "NF 2", largura: 14, valor: (f) => f.notaFiscal2 || "-" },
  { cabecalho: "ID", largura: 38, valor: (f) => f.id },
  { cabecalho: "Observações", largura: 30, valor: (f) => f.observacoes || "-" },
];

function escreverDetalhamento(workbook: ExcelJS.Workbook, fretes: readonly FreteLinha[]): void {
  const ws = workbook.addWorksheet("Detalhamento", { properties: { tabColor: { argb: argb(CORES_MARCA.verdeEscuro) } } });
  escreverCabecalhoMarca(workbook, ws, { titulo: TITULO_PLANILHA, colunas: COLUNAS_DETALHAMENTO.length });
  const cabecalho = ws.addRow(COLUNAS_DETALHAMENTO.map((c) => c.cabecalho));
  estilizarCabecalhoColunas(cabecalho);
  for (const f of fretes) ws.addRow(COLUNAS_DETALHAMENTO.map((c) => c.valor(f)));

  COLUNAS_DETALHAMENTO.forEach((definicao, i) => {
    const coluna = ws.getColumn(i + 1);
    coluna.width = definicao.largura;
    if (definicao.formato) coluna.numFmt = definicao.formato;
  });
  ws.views = [{ state: "frozen", ySplit: cabecalho.number }];
  if (fretes.length > 0) {
    ws.autoFilter = {
      from: { row: cabecalho.number, column: 1 },
      to: { row: cabecalho.number + fretes.length, column: COLUNAS_DETALHAMENTO.length },
    };
  }

  // O TOTAL na coluna 5, como a origem (`renderExcelDetalhamento(..., 5, ...)`).
  const total = ws.addRow([]);
  total.getCell(5).value = `TOTAL (${fretes.length} registro${fretes.length !== 1 ? "s" : ""})`;
  COLUNAS_DETALHAMENTO.forEach((definicao, i) => {
    if (definicao.soma) total.getCell(i + 1).value = definicao.soma(fretes);
  });
  total.eachCell((c) => {
    c.font = { bold: true };
  });
}

/** O workbook da exportação. `fretes` já vem filtrado e na ordem da lista (saída desc). */
export function montarPlanilhaFretes(
  fretes: readonly FreteLinha[],
  filtros: FiltrosFretes,
  hoje: string,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERP EMT";
  workbook.company = EMPRESA.razaoSocial;
  workbook.created = diaParaCelula(hoje) ?? new Date();
  const ordenados = [...fretes].sort((a, b) => b.data.localeCompare(a.data));
  escreverResumo(workbook, ordenados, filtros);
  escreverDetalhamento(workbook, ordenados);
  return workbook;
}
