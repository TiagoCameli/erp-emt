import ExcelJS from "exceljs";

import { EMPRESA } from "@/config/marca";
import {
  escreverCabecalhoMarca,
  estilizarCabecalhoColunas,
} from "@/lib/planilha-marca";

/**
 * A moldura de toda planilha exportada da aba Relatórios: marca da EMT no topo,
 * cabeçalho de colunas congelado, filtro do Excel ligado e linha de total.
 *
 * Existe como helper genérico porque são NOVE relatórios com a mesma moldura e
 * dados completamente diferentes — um tem faixa de vencimento, outro tem conta
 * bancária, outro tem três níveis de insumo. Copiar a montagem em nove lugares
 * garante que no décimo alguém esqueça o congelamento, ou desloque o
 * `autoFilter` em uma linha, e a planilha saia com a cara certa e o intervalo
 * errado.
 *
 * **Módulo de servidor**: puxa o exceljs, que é grande. Nunca importar de
 * Client Component.
 *
 * O QUE ESTE MÓDULO NÃO FAZ, de propósito: ele não sabe o que é um lançamento
 * nem um centro de custo. Cada relatório traz as próprias colunas e as próprias
 * linhas já prontas, e é por isso que ele não precisa mudar quando um relatório
 * ganha coluna.
 */

/** Como a célula é escrita e alinhada. */
export type TipoColunaRelatorio =
  | "texto"
  | "dinheiro"
  | "data"
  | "inteiro"
  | "percentual";

/** Valor de uma célula. `null` sai como célula em branco. */
export type CelulaRelatorio = string | number | Date | null;

/** Uma coluna da planilha: o cabeçalho e de onde sai cada célula. */
export interface ColunaRelatorio<T> {
  cabecalho: string;
  /** Largura em caracteres, o que o exceljs entende. */
  largura: number;
  tipo: TipoColunaRelatorio;
  celula: (linha: T) => CelulaRelatorio;
  /**
   * A coluna entra na linha de total? Só faz sentido em `dinheiro` e `inteiro`.
   *
   * Opt-in, e não automático por tipo, porque somar coluna de dinheiro é o certo
   * em quase toda planilha e ERRADO em algumas: saldo não se soma (o total de
   * uma coluna de saldos não significa nada), e percentual muito menos.
   */
  somar?: boolean;
}

/** Uma aba da planilha: um recorte com suas colunas e suas linhas. */
export interface AbaRelatorio<T> {
  /** Nome da aba. O Excel corta em 31 caracteres e recusa `\ / ? * [ ]`. */
  nome: string;
  /**
   * O que a aba é, escrito no cabeçalho de marca.
   *
   * INCLUA O RECORTE aqui ("Custo por centro de custo · ago/2026 · obra 009").
   * Planilha de relatório circula por e-mail e é lida semanas depois: sem o
   * filtro escrito no arquivo, quem recebe não tem como saber se está vendo o
   * mês, o ano ou a base inteira, e um número certo lido no recorte errado é
   * pior que número faltando.
   */
  titulo: string;
  colunas: readonly ColunaRelatorio<T>[];
  linhas: readonly T[];
  /**
   * Texto da primeira célula da linha de total, quando há alguma coluna somada.
   * Sem isso a linha de números aparece órfã no pé da tabela.
   */
  rotuloTotal?: string;
}

/* No xlsx o código de formato sempre usa `,` de milhar e `.` de decimal; o
   Excel renderiza no separador de quem abre, então em pt-BR isto sai como
   R$ 1.234,56. */
const FORMATO_BRL = "R$ #,##0.00";
const FORMATO_DATA = "dd/mm/yyyy";
/** Percentual espera FRAÇÃO: 0,133 vira 13,3%. Quem monta a célula divide. */
const FORMATO_PERCENTUAL = "0.0%";

/**
 * Data `yyyy-MM-dd` como célula de data do Excel.
 *
 * Meia-noite UTC, e não no fuso de Rio Branco, porque o exceljs converte `Date`
 * em número de série do Excel com aritmética de UTC pura. Uma data criada no
 * fuso local viraria série fracionária e o Excel mostraria o dia anterior. Aqui
 * a data é um dia do calendário: o instante não interessa, o dia interessa.
 */
export function dataDeRelatorioParaCelula(
  data: string | null | undefined,
): Date | null {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** Uma linha da aba, na ordem das colunas. */
function linhaDaAba<T>(
  colunas: readonly ColunaRelatorio<T>[],
  linha: T,
): CelulaRelatorio[] {
  return colunas.map((coluna) => coluna.celula(linha));
}

/**
 * Escreve uma aba no workbook: marca, cabeçalho, dados, filtro e total.
 *
 * Nenhuma linha é contada na mão. O cabeçalho de marca informa em que linha os
 * títulos caem, e filtro, congelamento e fórmula de total saem desse número — a
 * planilha é conferida contra o sistema, e um total apontando uma linha adiante
 * somaria o intervalo errado sem o arquivo dar erro nenhum.
 */
function escreverAba<T>(
  workbook: ExcelJS.Workbook,
  aba: AbaRelatorio<T>,
): void {
  const worksheet = workbook.addWorksheet(nomeDeAbaValido(aba.nome));

  escreverCabecalhoMarca(workbook, worksheet, {
    titulo: aba.titulo,
    colunas: aba.colunas.length,
  });

  const linhaHeader = worksheet.addRow(
    aba.colunas.map((coluna) => coluna.cabecalho),
  );
  estilizarCabecalhoColunas(linhaHeader);

  for (const linha of aba.linhas) {
    worksheet.addRow(linhaDaAba(aba.colunas, linha));
  }

  aba.colunas.forEach((definicao, indice) => {
    const coluna = worksheet.getColumn(indice + 1);
    coluna.width = definicao.largura;
    if (definicao.tipo === "dinheiro") {
      coluna.numFmt = FORMATO_BRL;
      coluna.alignment = { horizontal: "right" };
    } else if (definicao.tipo === "data") {
      coluna.numFmt = FORMATO_DATA;
      coluna.alignment = { horizontal: "center" };
    } else if (definicao.tipo === "percentual") {
      coluna.numFmt = FORMATO_PERCENTUAL;
      coluna.alignment = { horizontal: "right" };
    } else if (definicao.tipo === "inteiro") {
      coluna.alignment = { horizontal: "right" };
    }
  });

  const primeira = linhaHeader.number + 1;
  const ultima = linhaHeader.number + aba.linhas.length;

  worksheet.views = [{ state: "frozen", ySplit: linhaHeader.number }];

  // Filtro só quando há dado: `autoFilter` com `to` antes de `from` deixa o
  // arquivo com intervalo inválido, e o Excel reclama ao abrir.
  if (aba.linhas.length > 0) {
    worksheet.autoFilter = {
      from: { row: linhaHeader.number, column: 1 },
      to: { row: ultima, column: aba.colunas.length },
    };
  }

  const somadas = aba.colunas
    .map((coluna, indice) => ({ coluna, indice }))
    .filter(({ coluna }) => coluna.somar);

  if (somadas.length === 0 || aba.linhas.length === 0) return;

  const linhaTotais = worksheet.addRow([]);
  linhaTotais.getCell(1).value =
    aba.rotuloTotal ??
    `Total (${aba.linhas.length.toLocaleString("pt-BR")} linha(s))`;

  // SUBTOTAL(109) soma só o que está VISÍVEL, então o total acompanha o filtro
  // do Excel: quem recebe filtra uma obra e lê na hora quanto foi para ela. Um
  // total fixo passaria a mentir na primeira mexida.
  for (const { indice } of somadas) {
    const coluna = worksheet.getColumn(indice + 1);
    linhaTotais.getCell(coluna.number).value = {
      formula: `SUBTOTAL(109,${coluna.letter}${primeira}:${coluna.letter}${ultima})`,
    };
  }

  linhaTotais.eachCell((cell) => {
    cell.font = { bold: true };
  });
}

/**
 * Nome de aba que o Excel aceita: até 31 caracteres, sem `\ / ? * [ ]`.
 *
 * O Excel não avisa — ele RECUSA O ARQUIVO INTEIRO ao abrir. Um relatório cujo
 * nome cresça (ou que passe a levar o recorte no nome da aba) derrubaria a
 * exportação toda, e o erro apareceria só na mão de quem recebeu.
 */
function nomeDeAbaValido(nome: string): string {
  const limpo = nome.replace(/[\\/?*[\]:]/g, " ").trim();
  return (limpo || "Relatório").slice(0, 31);
}

/**
 * Monta o .xlsx de um relatório, com uma ou mais abas.
 *
 * Várias abas porque metade dos relatórios mostra mais de uma tabela na mesma
 * tela (custo x receita tem custo e receita lado a lado; créditos tem contratos
 * e credores). Juntar tudo numa aba só obrigaria a inventar uma coluna
 * "seção" e destruiria o filtro do Excel, que é o motivo de exportar.
 */
export function montarPlanilhaDeRelatorio(
  // `AbaRelatorio<never>` não serve: cada aba tem o próprio tipo de linha, e o
  // que precisa casar é a coluna com a linha DA MESMA aba. `unknown` aqui
  // aceitaria abas de tipos diferentes sem casar nada — daí a função receber a
  // aba já fechada sobre o próprio tipo, por `escreverAba`.
  abas: readonly EscritaDeAba[],
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERP EMT";
  workbook.company = EMPRESA.razaoSocial;
  workbook.created = new Date();

  for (const aba of abas) aba(workbook);

  return workbook;
}

/** Uma aba pronta para ser escrita, com o tipo da linha já resolvido. */
export type EscritaDeAba = (workbook: ExcelJS.Workbook) => void;

/**
 * Fecha uma aba sobre o próprio tipo de linha.
 *
 * É o que permite `montarPlanilhaDeRelatorio` receber abas com tipos de linha
 * DIFERENTES sem perder a checagem de que a coluna e a linha da MESMA aba
 * casam: o genérico é resolvido aqui, uma aba por vez.
 */
export function aba<T>(definicao: AbaRelatorio<T>): EscritaDeAba {
  return (workbook) => escreverAba(workbook, definicao);
}

/**
 * Nome do arquivo, com o id do relatório e a data da exportação.
 *
 * A data entra porque o financeiro exporta a mesma tela várias vezes no mês, e
 * três arquivos com o mesmo nome na pasta de downloads não dizem qual é o de
 * hoje. Recebe a data em vez de ler o relógio para a função continuar pura.
 */
export function nomeArquivoDeRelatorio(
  relatorio: string,
  dataISO: string,
): string {
  return `${relatorio}-${dataISO}.xlsx`;
}
