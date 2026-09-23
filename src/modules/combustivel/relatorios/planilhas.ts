import ExcelJS from "exceljs";

import { EMPRESA } from "@/config/marca";
import { formatarData, formatarMesAno } from "@/lib/formatadores";
import { escreverCabecalhoMarca, estilizarCabecalhoColunas } from "@/lib/planilha-marca";
import { ROTULO_CANAL, ROTULO_ORIGEM_SAIDA } from "@/modules/combustivel/_shared/rotulos";
import {
  consolidarMensal,
  consolidarPorCarreta,
  consolidarPorEquipamento,
  consolidarPorObra,
  resumoAlocacoes,
  rotuloTipoConsumidor,
  type LinhaCarreta,
  type LinhaEquipamento,
  type LinhaMensal,
  type LinhaObra,
  type SaidaRelatorio,
  type TipoRelatorio,
} from "@/modules/combustivel/relatorios/consolidar";
import type { Periodo } from "@/modules/combustivel/relatorios/periodo";
import { dataParaCelula, type CelulaPlanilha } from "@/modules/financeiro/lancamentos/planilha";

/**
 * As planilhas do Combustível: colunas, células e montagem do arquivo.
 *
 * Cabeçalho e célula moram no MESMO objeto, como nas planilhas do Financeiro:
 * array de títulos separado do de valores quebra no dia em que alguém insere uma
 * coluna no meio de um só, e o número sai embaixo do título errado.
 *
 * Números saem como número (a célula soma), datas como data do Excel e o total
 * é FÓRMULA (SUBTOTAL 109, que soma só o visível: filtrar por um combustível
 * mostra o total dele). Média R$/L é fórmula por linha e no total, porque a
 * média do total não é a média das médias.
 *
 * **Módulo de servidor**: puxa o exceljs. A action o carrega por `await import`.
 */

export type TipoColuna = "texto" | "inteiro" | "litros" | "leitura" | "dinheiro" | "preco" | "data" | "dataHora";

export interface Coluna<L> {
  cabecalho: string;
  largura: number;
  tipo: TipoColuna;
  celula: (linha: L) => CelulaPlanilha;
  /** Entra na linha de total por SUBTOTAL. */
  somar?: boolean;
  /**
   * Coluna calculada: numerador ÷ denominador (pelos cabeçalhos), por fórmula na
   * linha e no total. `celula` dá o resultado já calculado, para quem abre sem
   * recalcular.
   */
  razao?: { numerador: string; denominador: string };
}

const FORMATOS: Partial<Record<TipoColuna, string>> = {
  inteiro: "#,##0",
  litros: "#,##0.00",
  leitura: "#,##0.0",
  dinheiro: "R$ #,##0.00",
  preco: "R$ #,##0.0000",
  data: "dd/mm/yyyy",
  dataHora: "dd/mm/yyyy hh:mm",
};

/**
 * Instante (ISO) como data e hora do Excel no RELÓGIO DE RIO BRANCO.
 *
 * O exceljs converte `Date` com aritmética de UTC pura, então a célula guarda o
 * horário UTC do `Date`. Deslocar 5 horas faz os campos UTC valerem a hora de
 * Rio Branco (UTC-5 o ano todo), e o Excel mostra o que a tela mostra. É a mesma
 * convenção da data à meia-noite UTC do Financeiro, com a hora junto.
 */
export function dataHoraParaCelula(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const tempo = Date.parse(iso);
  if (Number.isNaN(tempo)) return null;
  return new Date(tempo - 5 * 60 * 60 * 1000);
}

/** Dinheiro/quantidade opcional: vazio vira célula em branco, não zero. */
const numeroOuVazio = (valor: number | null) => (valor === null ? null : valor);

/** Razão segura (0 quando o denominador é zero), para o `result` da fórmula. */
function dividir(numerador: number, denominador: number): number {
  return denominador === 0 ? 0 : numerador / denominador;
}

export interface AbaMontada {
  nome: string;
  /** Linha do cabeçalho de colunas. */
  linhaCabecalho: number;
  /** Linha do total (sempre existe, mesmo sem dados). */
  linhaTotal: number;
}

/**
 * Escreve uma aba: marca no topo, cabeçalho congelado, linhas, filtro do Excel e
 * total. Nenhuma linha é contada na mão: tudo sai da linha do cabeçalho.
 */
export function escreverAba<L>(
  workbook: ExcelJS.Workbook,
  { nome, titulo, colunas, linhas }: { nome: string; titulo: string; colunas: readonly Coluna<L>[]; linhas: readonly L[] },
): AbaMontada {
  const worksheet = workbook.addWorksheet(nome);
  escreverCabecalhoMarca(workbook, worksheet, { titulo, colunas: colunas.length });

  const cabecalho = worksheet.addRow(colunas.map((c) => c.cabecalho));
  estilizarCabecalhoColunas(cabecalho);

  const letra = (cab: string): string => {
    const indice = colunas.findIndex((c) => c.cabecalho === cab);
    if (indice < 0) throw new Error(`A planilha "${nome}" divide pela coluna "${cab}", que não existe`);
    return worksheet.getColumn(indice + 1).letter;
  };
  const formulaRazao = (razao: { numerador: string; denominador: string }, linha: number) =>
    `IF(${letra(razao.denominador)}${linha}=0,0,${letra(razao.numerador)}${linha}/${letra(razao.denominador)}${linha})`;

  for (const item of linhas) {
    const row = worksheet.addRow(colunas.map((c) => c.celula(item)));
    colunas.forEach((coluna, indice) => {
      if (!coluna.razao) return;
      const resultado = row.getCell(indice + 1).value;
      row.getCell(indice + 1).value = {
        formula: formulaRazao(coluna.razao, row.number),
        result: typeof resultado === "number" ? resultado : 0,
      };
    });
  }

  colunas.forEach((definicao, indice) => {
    const coluna = worksheet.getColumn(indice + 1);
    coluna.width = definicao.largura;
    const formato = FORMATOS[definicao.tipo];
    if (formato) coluna.numFmt = formato;
    if (definicao.tipo === "data" || definicao.tipo === "dataHora") coluna.alignment = { horizontal: "center" };
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
  total.getCell(1).value = `Total (${linhas.length.toLocaleString("pt-BR")} ${linhas.length === 1 ? "linha" : "linhas"})`;
  if (linhas.length > 0) {
    colunas.forEach((definicao, indice) => {
      const celula = total.getCell(indice + 1);
      if (definicao.somar) {
        const l = worksheet.getColumn(indice + 1).letter;
        celula.value = { formula: `SUBTOTAL(109,${l}${primeira}:${l}${ultima})` };
      } else if (definicao.razao) {
        celula.value = { formula: formulaRazao(definicao.razao, total.number) };
      }
    });
  }
  total.eachCell((cell) => {
    cell.font = { bold: true };
  });

  return { nome, linhaCabecalho: cabecalho.number, linhaTotal: total.number };
}

// ---------------------------------------------------------------------------
// As colunas de cada relatório
// ---------------------------------------------------------------------------

export const COLUNAS_MENSAL: Coluna<LinhaMensal>[] = [
  { cabecalho: "Mês", largura: 10, tipo: "texto", celula: (l) => formatarMesAno(`${l.mes}-01`) },
  { cabecalho: "Combustível", largura: 24, tipo: "texto", celula: (l) => l.combustivel },
  { cabecalho: "Consumidor", largura: 26, tipo: "texto", celula: (l) => l.tipoConsumidor },
  { cabecalho: "Abastecimentos", largura: 15, tipo: "inteiro", celula: (l) => l.abastecimentos, somar: true },
  { cabecalho: "Litros", largura: 14, tipo: "litros", celula: (l) => l.litros, somar: true },
  { cabecalho: "Valor", largura: 16, tipo: "dinheiro", celula: (l) => l.valor, somar: true },
  {
    cabecalho: "Média R$/L",
    largura: 13,
    tipo: "preco",
    celula: (l) => dividir(l.valor, l.litros),
    razao: { numerador: "Valor", denominador: "Litros" },
  },
];

export const COLUNAS_OBRA: Coluna<LinhaObra>[] = [
  { cabecalho: "Centro de custo", largura: 40, tipo: "texto", celula: (l) => l.centro },
  { cabecalho: "Abastecimentos", largura: 15, tipo: "inteiro", celula: (l) => l.abastecimentos, somar: true },
  { cabecalho: "Litros", largura: 14, tipo: "litros", celula: (l) => l.litros, somar: true },
  { cabecalho: "Custo", largura: 16, tipo: "dinheiro", celula: (l) => l.custo, somar: true },
];

export const COLUNAS_EQUIPAMENTO: Coluna<LinhaEquipamento>[] = [
  { cabecalho: "Equipamento", largura: 40, tipo: "texto", celula: (l) => l.equipamento },
  { cabecalho: "Abastecimentos", largura: 15, tipo: "inteiro", celula: (l) => l.abastecimentos, somar: true },
  { cabecalho: "Litros", largura: 14, tipo: "litros", celula: (l) => l.litros, somar: true },
  { cabecalho: "Valor", largura: 16, tipo: "dinheiro", celula: (l) => l.valor, somar: true },
  {
    cabecalho: "Média R$/L",
    largura: 13,
    tipo: "preco",
    celula: (l) => dividir(l.valor, l.litros),
    razao: { numerador: "Valor", denominador: "Litros" },
  },
  { cabecalho: "Medidor", largura: 11, tipo: "texto", celula: (l) => l.medidor ?? "" },
  { cabecalho: "Leitura inicial", largura: 15, tipo: "leitura", celula: (l) => numeroOuVazio(l.leituraInicial) },
  { cabecalho: "Leitura final", largura: 15, tipo: "leitura", celula: (l) => numeroOuVazio(l.leituraFinal) },
  // Sem total: somar horas com km não dá número nenhum.
  { cabecalho: "Rodado no período", largura: 17, tipo: "leitura", celula: (l) => numeroOuVazio(l.rodado) },
];

export const COLUNAS_CARRETA: Coluna<LinhaCarreta>[] = [
  { cabecalho: "Transportadora", largura: 36, tipo: "texto", celula: (l) => l.transportadora },
  { cabecalho: "Placa", largura: 12, tipo: "texto", celula: (l) => l.placa },
  { cabecalho: "Abastecimentos", largura: 15, tipo: "inteiro", celula: (l) => l.abastecimentos, somar: true },
  { cabecalho: "Litros", largura: 14, tipo: "litros", celula: (l) => l.litros, somar: true },
  { cabecalho: "Valor", largura: 16, tipo: "dinheiro", celula: (l) => l.valor, somar: true },
  {
    cabecalho: "Média R$/L",
    largura: 13,
    tipo: "preco",
    celula: (l) => dividir(l.valor, l.litros),
    razao: { numerador: "Valor", denominador: "Litros" },
  },
];

const rotuloDe = (mapa: Record<string, string>, valor: string) => mapa[valor] ?? valor;

export const COLUNAS_BRUTO: Coluna<SaidaRelatorio>[] = [
  { cabecalho: "Data", largura: 17, tipo: "dataHora", celula: (s) => dataHoraParaCelula(s.data) },
  { cabecalho: "Origem", largura: 18, tipo: "texto", celula: (s) => rotuloDe(ROTULO_ORIGEM_SAIDA, s.origem) },
  { cabecalho: "Consumidor", largura: 24, tipo: "texto", celula: (s) => rotuloTipoConsumidor(s.tipoConsumidor) },
  { cabecalho: "Tanque", largura: 22, tipo: "texto", celula: (s) => s.tanqueNome ?? "" },
  { cabecalho: "Equipamento", largura: 34, tipo: "texto", celula: (s) => s.equipamentoNome ?? "" },
  { cabecalho: "Transportadora", largura: 30, tipo: "texto", celula: (s) => s.transportadoraNome ?? "" },
  { cabecalho: "Placa", largura: 11, tipo: "texto", celula: (s) => s.placa ?? "" },
  { cabecalho: "Motorista", largura: 22, tipo: "texto", celula: (s) => s.motorista ?? "" },
  { cabecalho: "Combustível", largura: 20, tipo: "texto", celula: (s) => s.combustivel },
  { cabecalho: "Litros", largura: 12, tipo: "litros", celula: (s) => s.litros, somar: true },
  { cabecalho: "Preço do combustível", largura: 16, tipo: "preco", celula: (s) => numeroOuVazio(s.precoCombustivel) },
  { cabecalho: "Preço do dono do tanque", largura: 16, tipo: "preco", celula: (s) => numeroOuVazio(s.precoProprietario) },
  { cabecalho: "Taxa por litro", largura: 13, tipo: "preco", celula: (s) => s.taxaLitro },
  { cabecalho: "Preço unitário", largura: 14, tipo: "preco", celula: (s) => s.precoUnitario },
  { cabecalho: "Preço médio do tanque", largura: 16, tipo: "preco", celula: (s) => numeroOuVazio(s.precoMedioTanque) },
  // Preço de 4 casas; o valor também tem 4 no banco (CASAS_VALOR_OPERACIONAL) e sai como está.
  { cabecalho: "Valor total", largura: 16, tipo: "preco", celula: (s) => s.valorTotal, somar: true },
  { cabecalho: "Pago", largura: 7, tipo: "texto", celula: (s) => (s.pago ? "Sim" : "Não") },
  { cabecalho: "Pago em", largura: 12, tipo: "data", celula: (s) => dataParaCelula(s.pagoEm) },
  { cabecalho: "Leitura", largura: 12, tipo: "leitura", celula: (s) => numeroOuVazio(s.medicao) },
  {
    cabecalho: "Medidor",
    largura: 11,
    tipo: "texto",
    celula: (s) => (s.tipoMedicao === "horimetro" ? "Horímetro" : s.tipoMedicao === "km" ? "Km" : ""),
  },
  { cabecalho: "Centro de custo", largura: 34, tipo: "texto", celula: (s) => s.centroCustoNome ?? "" },
  { cabecalho: "Alocação por obra", largura: 40, tipo: "texto", celula: (s) => resumoAlocacoes(s.alocacoes) },
  { cabecalho: "Canal", largura: 12, tipo: "texto", celula: (s) => rotuloDe(ROTULO_CANAL, s.canal) },
  { cabecalho: "Observações", largura: 40, tipo: "texto", celula: (s) => s.observacoes ?? "" },
  { cabecalho: "Lançado em", largura: 17, tipo: "dataHora", celula: (s) => dataHoraParaCelula(s.criadoEm) },
  { cabecalho: "Id", largura: 38, tipo: "texto", celula: (s) => s.id },
];

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

export const TITULO_RELATORIO: Record<TipoRelatorio, string> = {
  mensal: "Consumo mensal consolidado",
  obra: "Consumo por obra",
  equipamento: "Consumo por equipamento",
  bruto: "Abastecimentos do período",
};

const ARQUIVO_RELATORIO: Record<TipoRelatorio, string> = {
  mensal: "combustivel-mensal",
  obra: "combustivel-por-obra",
  equipamento: "combustivel-por-equipamento",
  bruto: "combustivel-abastecimentos",
};

export function nomeArquivoRelatorio(tipo: TipoRelatorio, periodo: Periodo): string {
  return `${ARQUIVO_RELATORIO[tipo]}-${periodo.de}-a-${periodo.ate}.xlsx`;
}

/** Monta o .xlsx de um relatório, com o período no título de cada aba. */
export function montarRelatorio(tipo: TipoRelatorio, saidas: readonly SaidaRelatorio[], periodo: Periodo): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERP EMT";
  workbook.company = EMPRESA.razaoSocial;
  const sufixo = ` · ${formatarData(`${periodo.de}T12:00:00Z`)} a ${formatarData(`${periodo.ate}T12:00:00Z`)}`;
  const titulo = TITULO_RELATORIO[tipo] + sufixo;

  if (tipo === "mensal") {
    escreverAba(workbook, { nome: "Mensal", titulo, colunas: COLUNAS_MENSAL, linhas: consolidarMensal(saidas) });
  } else if (tipo === "obra") {
    escreverAba(workbook, { nome: "Por obra", titulo, colunas: COLUNAS_OBRA, linhas: consolidarPorObra(saidas) });
  } else if (tipo === "equipamento") {
    escreverAba(workbook, {
      nome: "Equipamentos",
      titulo,
      colunas: COLUNAS_EQUIPAMENTO,
      linhas: consolidarPorEquipamento(saidas),
    });
    escreverAba(workbook, {
      nome: "Carretas",
      titulo: `Consumo por carreta de transportadora${sufixo}`,
      colunas: COLUNAS_CARRETA,
      linhas: consolidarPorCarreta(saidas),
    });
  } else {
    escreverAba(workbook, { nome: "Abastecimentos", titulo, colunas: COLUNAS_BRUTO, linhas: saidas });
  }
  return workbook;
}
