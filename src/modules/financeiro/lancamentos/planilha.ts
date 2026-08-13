import ExcelJS from "exceljs";

import { formatarDataHora, formatarMesAno } from "@/lib/formatadores";
import { ROTULO_TIPO_LANCAMENTO } from "@/modules/financeiro/_shared/formato";
import { ROTULO_REVISAO_DA_LINHA } from "@/modules/financeiro/lancamentos/lote";
import type { LancamentoLista } from "@/modules/financeiro/lancamentos/queries";
import {
  rotuloOrigemLancamento,
  rotuloStatusLancamento,
} from "@/modules/financeiro/lancamentos/schemas";

/**
 * A planilha de lançamentos: quais colunas, em que ordem, de onde sai cada
 * célula e como o arquivo é montado.
 *
 * Cabeçalho e célula moram no MESMO objeto de propósito. Planilha montada com
 * um array de títulos e outro de valores quebra no dia em que alguém insere uma
 * coluna no meio de um só, e o resultado é a pior falha possível num relatório
 * de dinheiro: o número aparece embaixo do título errado, e a planilha continua
 * abrindo sem erro nenhum.
 *
 * Não fala com banco nem com permissão (isso é da Server Action), então dá para
 * escrever o arquivo num teste e reler o que saiu. **Módulo de servidor**: puxa
 * o exceljs, que é grande; nunca importar de Client Component.
 */

/** Como a célula é escrita e alinhada no Excel. */
export type TipoColunaPlanilha = "texto" | "dinheiro" | "data" | "inteiro";

/** Valor de uma célula. `null` sai como célula em branco. */
export type CelulaPlanilha = string | number | Date | null;

export interface ColunaPlanilha {
  cabecalho: string;
  /** Largura em caracteres, o que o exceljs entende. */
  largura: number;
  tipo: TipoColunaPlanilha;
  celula: (lancamento: LancamentoLista) => CelulaPlanilha;
}

/**
 * Data `yyyy-MM-dd` como célula de data do Excel.
 *
 * Meia-noite **UTC**, e não `TZDate` no fuso de Rio Branco, porque o exceljs
 * converte `Date` em número de série do Excel com aritmética de UTC pura
 * (`25569 + getTime() / 86400000`). Uma data criada no fuso local viraria série
 * fracionária e o Excel mostraria o dia anterior. Aqui a data é um dia do
 * calendário, sem hora nenhuma: o instante não interessa, o dia interessa.
 */
export function dataParaCelula(
  data: string | null | undefined,
): Date | null {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/**
 * Colunas da planilha, na ordem em que saem.
 *
 * São as mesmas informações da listagem, mais Fornecedor e Origem (que na tela
 * dividem célula com outra coisa) e Criado em. Centro de custo fica de fora: ele
 * mora no rateio, um lançamento pode ser dividido entre várias obras, e uma
 * coluna só mentiria sobre isso.
 */
export const COLUNAS_PLANILHA_LANCAMENTOS: ColunaPlanilha[] = [
  {
    cabecalho: "Número",
    largura: 16,
    tipo: "texto",
    celula: (l) => l.numero ?? "",
  },
  {
    cabecalho: "Tipo",
    largura: 12,
    tipo: "texto",
    celula: (l) => ROTULO_TIPO_LANCAMENTO[l.tipo],
  },
  {
    cabecalho: "Descrição",
    largura: 44,
    tipo: "texto",
    celula: (l) => l.descricao,
  },
  {
    cabecalho: "Categoria",
    largura: 24,
    tipo: "texto",
    celula: (l) => l.categoriaNome ?? "",
  },
  {
    cabecalho: "Fornecedor",
    largura: 30,
    tipo: "texto",
    celula: (l) => l.fornecedorNome ?? "",
  },
  {
    cabecalho: "Valor",
    largura: 16,
    tipo: "dinheiro",
    // Número cru, com formato de moeda na célula: quem recebe a planilha soma,
    // filtra e faz tabela dinâmica. "R$ 1.234,56" como texto viraria uma coluna
    // que não soma, e o motivo de exportar é justamente somar.
    celula: (l) => l.valor,
  },
  {
    cabecalho: "Data da compra",
    largura: 15,
    tipo: "data",
    celula: (l) => dataParaCelula(l.dataCompra),
  },
  {
    cabecalho: "Mês de referência",
    largura: 16,
    tipo: "texto",
    // mm/aaaa, igual à tela: é competência, não um dia do calendário.
    celula: (l) => formatarMesAno(l.mesCompetencia),
  },
  {
    cabecalho: "Vencimento",
    largura: 14,
    tipo: "data",
    celula: (l) => dataParaCelula(l.dataVencimento),
  },
  {
    cabecalho: "Status",
    largura: 14,
    tipo: "texto",
    celula: (l) => rotuloStatusLancamento(l.status, l.tipo),
  },
  {
    cabecalho: "Parcelas",
    largura: 10,
    tipo: "inteiro",
    celula: (l) => l.qtdParcelas,
  },
  {
    cabecalho: "Revisão",
    largura: 14,
    tipo: "texto",
    celula: (l) => ROTULO_REVISAO_DA_LINHA[l.revisao],
  },
  {
    cabecalho: "Origem",
    largura: 18,
    tipo: "texto",
    celula: (l) => rotuloOrigemLancamento(l.origem),
  },
  {
    cabecalho: "Criado em",
    largura: 18,
    tipo: "texto",
    // Texto, e não data: é timestamptz, e o que vale é o horário de Rio Branco
    // (regra do ERP). Como data do Excel, ela abriria no fuso de quem abre.
    celula: (l) => formatarDataHora(l.criadoEm),
  },
];

/** Cabeçalhos, na ordem das colunas. */
export const CABECALHOS_PLANILHA_LANCAMENTOS =
  COLUNAS_PLANILHA_LANCAMENTOS.map((coluna) => coluna.cabecalho);

/** Uma linha da planilha, na ordem das colunas. */
export function linhaPlanilhaLancamento(
  lancamento: LancamentoLista,
): CelulaPlanilha[] {
  return COLUNAS_PLANILHA_LANCAMENTOS.map((coluna) => coluna.celula(lancamento));
}

/**
 * Nome do arquivo, com a data da exportação: o financeiro exporta a mesma tela
 * várias vezes no mês, e três arquivos chamados "lancamentos.xlsx" na pasta de
 * downloads não dizem qual é o de hoje. Recebe a data em vez de ler o relógio
 * para continuar puro.
 */
export function nomeArquivoPlanilhaLancamentos(dataISO: string): string {
  return `lancamentos-${dataISO}.xlsx`;
}

/* ------------------------------------------------------------------ */
/* Leitura completa do filtro                                         */
/* ------------------------------------------------------------------ */

/**
 * Linhas por requisição na leitura completa.
 *
 * Mil, e não "tudo de uma vez", porque o PostgREST corta a resposta num teto
 * invisível: pedir oito mil linhas numa tacada pode devolver menos e a planilha
 * sairia faltando lançamento sem ninguém perceber. É o mesmo tamanho que
 * `lerEmPaginas` usa nas consultas auxiliares de filtro, pelo mesmo motivo.
 */
export const PAGINA_EXPORTACAO = 1000;

/** Uma página da listagem, com o total exato do filtro. */
export interface PaginaDeLancamentos {
  itens: LancamentoLista[];
  total: number;
}

/** Quem busca uma página. Injetado para esta função não depender do banco. */
export type LeitorDePagina = (
  pagina: number,
  tamanho: number,
) => Promise<PaginaDeLancamentos>;

export interface LeituraCompleta {
  /** Linhas lidas, na ordem da listagem, sem repetição. */
  itens: LancamentoLista[];
  /** Total exato do filtro, direto do count do banco. */
  total: number;
}

/**
 * Lê o filtro inteiro, página por página, até fechar o total.
 *
 * `itens.length < total` no retorno significa leitura incompleta, e quem chamou
 * tem que tratar como erro em vez de entregar o arquivo: planilha com metade dos
 * lançamentos e nenhum aviso é pior que exportação que falhou.
 *
 * Deduplica por id de propósito. Se alguém criar um lançamento no meio da
 * leitura, o novo entra na frente e empurra as linhas uma casa para baixo, o que
 * faria uma linha aparecer em duas páginas. Somar dois lançamentos iguais no
 * total é o tipo de erro que ninguém confere.
 *
 * `teto` é freio de disparada, não regra de negócio: passando dele a função
 * devolve `itens` vazio com o `total` real, para a tela dizer o número.
 */
export async function lerLancamentosEmPaginas(
  ler: LeitorDePagina,
  teto: number,
  tamanhoPagina: number = PAGINA_EXPORTACAO,
): Promise<LeituraCompleta> {
  const vistos = new Set<string>();
  const itens: LancamentoLista[] = [];
  let total = 0;

  const maximoDePaginas = Math.ceil(teto / tamanhoPagina);
  for (let pagina = 0; pagina < maximoDePaginas; pagina += 1) {
    const lote = await ler(pagina, tamanhoPagina);
    total = lote.total;

    // Passou do teto: para na primeira página, sem varrer o banco à toa.
    if (total > teto) return { itens: [], total };

    for (const item of lote.itens) {
      if (vistos.has(item.id)) continue;
      vistos.add(item.id);
      itens.push(item);
    }

    // Página curta é fim de lista. E o total fechado também: sem essa saída, um
    // filtro de 1000 exatas pediria uma página a mais só para ouvir "vazio".
    if (lote.itens.length < tamanhoPagina) break;
    if (itens.length >= total) break;
  }

  return { itens, total };
}

/* ------------------------------------------------------------------ */
/* Montagem do arquivo                                                */
/* ------------------------------------------------------------------ */

const COR_FUNDO_HEADER = "FFF7F7F5";
const COR_BORDA_HEADER = "FFE8E6E1";
const COR_TEXTO_HEADER = "FF1F1F1F";
/**
 * Formato de moeda. No xlsx o código sempre usa `,` para milhar e `.` para
 * decimal; o Excel renderiza no separador do idioma de quem abre, então em
 * pt-BR isto aparece como R$ 1.234,56.
 */
const FORMATO_BRL = "R$ #,##0.00";
const FORMATO_DATA = "dd/mm/yyyy";

/** Nome da aba. Uma só: é uma listagem, não um relatório com seções. */
export const ABA_PLANILHA_LANCAMENTOS = "Lançamentos";

/**
 * Monta o .xlsx: cabeçalho destacado e congelado, uma linha por lançamento,
 * filtro do Excel ligado e a linha de total.
 */
export function montarPlanilhaLancamentos(
  itens: LancamentoLista[],
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERP EMT";

  const worksheet = workbook.addWorksheet(ABA_PLANILHA_LANCAMENTOS);

  const linhaHeader = worksheet.addRow(CABECALHOS_PLANILHA_LANCAMENTOS);
  linhaHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COR_TEXTO_HEADER } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COR_FUNDO_HEADER },
    };
    cell.border = {
      bottom: { style: "thin", color: { argb: COR_BORDA_HEADER } },
    };
    cell.alignment = { vertical: "middle" };
  });

  for (const item of itens) {
    worksheet.addRow(linhaPlanilhaLancamento(item));
  }

  // Largura e formato por coluna, tirados do mesmo desenho que gerou as células.
  COLUNAS_PLANILHA_LANCAMENTOS.forEach((definicao, indice) => {
    const coluna = worksheet.getColumn(indice + 1);
    coluna.width = definicao.largura;
    if (definicao.tipo === "dinheiro") {
      coluna.numFmt = FORMATO_BRL;
      coluna.alignment = { horizontal: "right" };
    } else if (definicao.tipo === "data") {
      coluna.numFmt = FORMATO_DATA;
      coluna.alignment = { horizontal: "center" };
    } else if (definicao.tipo === "inteiro") {
      coluna.alignment = { horizontal: "right" };
    }
  });

  const colunaValor = worksheet.getColumn(
    COLUNAS_PLANILHA_LANCAMENTOS.findIndex(
      (definicao) => definicao.tipo === "dinheiro",
    ) + 1,
  );
  const primeiraLinha = 2;
  const ultimaLinha = itens.length + 1;

  // Congela o cabeçalho e liga o filtro do Excel: rolar 3.000 linhas sem isso
  // deixa a pessoa sem saber que coluna está lendo. O filtro para na última
  // linha de dados, de fora a linha de total.
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: ultimaLinha, column: COLUNAS_PLANILHA_LANCAMENTOS.length },
  };

  // Total por FÓRMULA, não por soma calculada aqui: quem recebe a planilha
  // filtra e apaga linha, e um total fixo passaria a mentir na primeira mexida.
  // SUBTOTAL(109) soma só o que está visível, então acompanha o filtro.
  const linhaTotais = worksheet.addRow([]);
  linhaTotais.getCell(1).value =
    `Total (${itens.length.toLocaleString("pt-BR")} lançamentos)`;
  linhaTotais.getCell(colunaValor.number).value = {
    formula: `SUBTOTAL(109,${colunaValor.letter}${primeiraLinha}:${colunaValor.letter}${ultimaLinha})`,
  };
  linhaTotais.eachCell((cell) => {
    cell.font = { bold: true };
  });

  return workbook;
}
