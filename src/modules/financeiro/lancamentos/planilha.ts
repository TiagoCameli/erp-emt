import ExcelJS from "exceljs";

import { formatarDataHora, formatarMesAno } from "@/lib/formatadores";
import { ROTULO_TIPO_LANCAMENTO } from "@/modules/financeiro/_shared/formato";
import { ROTULO_REVISAO_DA_LINHA } from "@/modules/financeiro/lancamentos/lote";
import type { LancamentoPlanilha } from "@/modules/financeiro/lancamentos/queries";
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
  celula: (lancamento: LancamentoPlanilha) => CelulaPlanilha;
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
 * Valor de um item do rateio, dentro da célula de composição.
 *
 * Sem "R$" de propósito, e é por isso que não usa `formatarBRL`: a célula junta
 * vários centros ("Escritório: 1.200,00; BR-364: 800,00") e repetir o símbolo em
 * cada um enche de ruído a única coluna que já é a mais longa da planilha. A
 * moeda está na coluna Valor, que é número de verdade e soma.
 */
function valorDoRateio(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Colunas da planilha, na ordem em que saem.
 *
 * Traz o lançamento INTEIRO, não o resumo da listagem: além do que a tela mostra,
 * vão centro de custo, rateio, forma e condição de pagamento, conta bancária,
 * número do documento de origem e observações.
 *
 * **Uma linha por lançamento, e isso é o que decide a forma do rateio.** Um
 * lançamento pode ser dividido entre várias obras, então "Centro de custo" lista
 * os nomes e "Rateio" traz quanto foi para cada um. A alternativa (uma linha por
 * rateio) foi recusada: ela repetiria o valor do lançamento em N linhas, e quem
 * somasse a coluna Valor contaria o mesmo dinheiro várias vezes. Numa planilha
 * de dinheiro, total errado que abre sem erro é o pior defeito possível.
 *
 * Parcela também é 1-N (conta, vencimento, pagamento). Aqui entra só o resumo: a
 * quantidade em "Parcelas" e a conta bancária quando é a mesma em todas.
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
    cabecalho: "Documento de origem",
    largura: 20,
    tipo: "texto",
    // "Ordem de compra" na coluna Origem não diz QUAL ordem: sem o número, quem
    // confere a planilha volta ao sistema para achar o documento.
    celula: (l) => l.origemNumero,
  },
  {
    // A espinha dorsal do ERP: custo sem centro de custo não existe. Era a
    // ausência mais sentida da planilha.
    cabecalho: "Centro de custo",
    largura: 28,
    tipo: "texto",
    celula: (l) =>
      l.rateios.length === 0
        ? null
        : l.rateios.map((rateio) => rateio.nome).join("; "),
  },
  {
    cabecalho: "Rateio",
    largura: 40,
    tipo: "texto",
    // Só quando há mais de um centro: com um só, a composição repetiria o nome
    // da coluna ao lado e o valor do lançamento, virando ruído em toda linha.
    celula: (l) =>
      l.rateios.length < 2
        ? null
        : l.rateios
            .map((rateio) => `${rateio.nome}: ${valorDoRateio(rateio.valor)}`)
            .join("; "),
  },
  {
    cabecalho: "Forma de pagamento",
    largura: 20,
    tipo: "texto",
    celula: (l) => l.formaPagamentoNome,
  },
  {
    cabecalho: "Condição de pagamento",
    largura: 22,
    tipo: "texto",
    celula: (l) => l.condicaoPagamentoDescricao,
  },
  {
    cabecalho: "Conta bancária",
    largura: 26,
    tipo: "texto",
    celula: (l) => l.contaBancariaNome,
  },
  {
    cabecalho: "Criado em",
    largura: 18,
    tipo: "texto",
    // Texto, e não data: é timestamptz, e o que vale é o horário de Rio Branco
    // (regra do ERP). Como data do Excel, ela abriria no fuso de quem abre.
    celula: (l) => formatarDataHora(l.criadoEm),
  },
  {
    // Última de propósito: é a coluna mais larga e a única com texto de tamanho
    // imprevisível. No meio da planilha ela empurraria tudo que interessa para
    // fora da tela de quem abre o arquivo.
    cabecalho: "Observações",
    largura: 50,
    tipo: "texto",
    celula: (l) => l.observacoes,
  },
];

/** Cabeçalhos, na ordem das colunas. */
export const CABECALHOS_PLANILHA_LANCAMENTOS =
  COLUNAS_PLANILHA_LANCAMENTOS.map((coluna) => coluna.cabecalho);

/** Uma linha da planilha, na ordem das colunas. */
export function linhaPlanilhaLancamento(
  lancamento: LancamentoPlanilha,
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
  itens: LancamentoPlanilha[],
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
