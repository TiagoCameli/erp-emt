import ExcelJS from "exceljs";

/**
 * Framework genérico de importação por planilha (.xlsx).
 * Server-compatible: sem React, usado por Server Actions e route handlers.
 * Todo cadastro do sistema usa este fluxo: modelo para download,
 * leitura e validação linha a linha, prévia de erros, confirmação.
 */

/** Definição de uma coluna esperada na planilha de importação. */
export interface ColunaImportacao<T> {
  /** Chave do campo no objeto resultante. */
  chave: keyof T & string;
  /** Rótulo do header na planilha (casado case-insensitive, com trim). */
  rotulo: string;
  /** Vazia em alguma linha gera erro "Coluna X é obrigatória". */
  obrigatoria?: boolean;
  /** Valor de exemplo na segunda linha do modelo. */
  exemplo?: string;
  /** Converte o valor bruto da célula (ex: "1,5" para 1.5). Pode lançar Error. */
  transformar?: (valorCelula: unknown) => unknown;
  /** Validação custom. Retorna a mensagem de erro ou null se válido. */
  validar?: (valor: unknown, linha: Partial<T>) => string | null;
}

/** Uma linha lida da planilha, com o número original e os erros encontrados. */
export interface ResultadoLinha<T> {
  /** Número da linha na planilha original (header é a linha 1). */
  linha: number;
  dados: Partial<T>;
  erros: string[];
}

/** Resultado completo da validação de um arquivo. */
export interface ResultadoValidacao<T> {
  validas: ResultadoLinha<T>[];
  invalidas: ResultadoLinha<T>[];
  totalLinhas: number;
}

/** Forma mínima de coluna aceita por gerarModeloXlsx. */
interface ColunaModelo {
  rotulo: string;
  exemplo?: string;
}

type ValorNormalizado = string | number | boolean | Date | null;

const COR_FUNDO_HEADER = "FFF7F7F5";
const COR_BORDA_HEADER = "FFE8E6E1";
const COR_TEXTO_HEADER = "FF1F1F1F";

/** Excel limita o nome da aba a 31 caracteres e proíbe \\ / ? * [ ] : */
function sanitizarNomePlanilha(nome: string): string {
  const limpo = nome.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31);
  return limpo.length > 0 ? limpo : "Modelo";
}

function normalizarRotulo(rotulo: string): string {
  return rotulo.trim().toLowerCase();
}

function estaVazio(valor: ValorNormalizado): boolean {
  return valor === null || (typeof valor === "string" && valor.trim() === "");
}

/**
 * Normaliza ExcelJS.CellValue (pode ser richtext, formula, hyperlink, date,
 * erro de fórmula) para string/number/boolean/Date/null.
 */
function normalizarValor(valor: ExcelJS.CellValue): ValorNormalizado {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" || typeof valor === "boolean") return valor;
  if (valor instanceof Date) return valor;

  if ("richText" in valor) {
    return valor.richText
      .map((trecho) => trecho.text)
      .join("")
      .trim();
  }
  if ("hyperlink" in valor) {
    return valor.text.trim();
  }
  if ("formula" in valor || "sharedFormula" in valor) {
    const resultado = valor.result;
    if (resultado === null || resultado === undefined) return null;
    if (resultado instanceof Date) return resultado;
    if (typeof resultado === "object") return null; // erro de fórmula (#REF! etc)
    if (typeof resultado === "string") return resultado.trim();
    return resultado;
  }
  // CellErrorValue (#N/A, #REF! etc)
  return null;
}

function valorDaCelula(cell: ExcelJS.Cell): ValorNormalizado {
  return normalizarValor(cell.value);
}

function paraArrayBuffer(entrada: ArrayBuffer | Buffer): ArrayBuffer {
  if (entrada instanceof ArrayBuffer) return entrada;
  const copia = new Uint8Array(entrada.byteLength);
  copia.set(entrada);
  return copia.buffer;
}

/**
 * Gera o modelo .xlsx para download: header estilizado (negrito, fundo
 * #F7F7F5) na linha 1 e uma linha de exemplo na linha 2.
 */
export async function gerarModeloXlsx(
  colunas: ColunaImportacao<never>[] | { rotulo: string; exemplo?: string }[],
  nomePlanilha: string,
): Promise<Buffer> {
  const definicoes: ColunaModelo[] = colunas.map((coluna) => ({
    rotulo: coluna.rotulo,
    exemplo: coluna.exemplo,
  }));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERP EMT";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sanitizarNomePlanilha(nomePlanilha), {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  worksheet.columns = definicoes.map((coluna) => ({
    header: coluna.rotulo,
    width: Math.max(coluna.rotulo.length, (coluna.exemplo ?? "").length, 14) + 4,
  }));

  const header = worksheet.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
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

  worksheet.addRow(definicoes.map((coluna) => coluna.exemplo ?? ""));

  const conteudo = await workbook.xlsx.writeBuffer();
  return Buffer.from(conteudo);
}

/**
 * Lê a primeira worksheet do arquivo, casa as colunas pelo rótulo do header
 * (case-insensitive, com trim) e valida linha a linha. Linhas totalmente
 * vazias são ignoradas. O número da linha retornado é o da planilha original.
 *
 * Lança Error se o arquivo não tiver worksheet ou se alguma coluna
 * obrigatória não existir no header.
 */
export async function lerEValidarXlsx<T>(
  buffer: ArrayBuffer | Buffer,
  colunas: ColunaImportacao<T>[],
): Promise<ResultadoValidacao<T>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(paraArrayBuffer(buffer));

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("O arquivo não contém nenhuma planilha");
  }

  // Mapeia rótulo do header (normalizado) para o número da coluna na planilha
  const colunaPorRotulo = new Map<string, number>();
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, numeroColuna) => {
    const valor = valorDaCelula(cell);
    if (estaVazio(valor)) return;
    colunaPorRotulo.set(normalizarRotulo(String(valor)), numeroColuna);
  });

  const mapeamento = colunas.map((coluna) => ({
    coluna,
    indice: colunaPorRotulo.get(normalizarRotulo(coluna.rotulo)),
  }));

  const faltando = mapeamento.filter(
    (item) => item.indice === undefined && item.coluna.obrigatoria,
  );
  if (faltando.length > 0) {
    const rotulos = faltando.map((item) => item.coluna.rotulo).join(", ");
    throw new Error(
      `Colunas obrigatórias não encontradas na planilha: ${rotulos}. Baixe o modelo e confira o cabeçalho.`,
    );
  }

  const validas: ResultadoLinha<T>[] = [];
  const invalidas: ResultadoLinha<T>[] = [];

  worksheet.eachRow((row, numeroLinha) => {
    if (numeroLinha === 1) return; // header

    const dados: Partial<T> = {};
    const erros: string[] = [];
    let temConteudo = false;

    for (const { coluna, indice } of mapeamento) {
      const bruto =
        indice === undefined ? null : valorDaCelula(row.getCell(indice));

      if (!estaVazio(bruto)) temConteudo = true;

      let valor: unknown = bruto;

      if (estaVazio(bruto)) {
        valor = null;
        if (coluna.obrigatoria) {
          erros.push(`Coluna ${coluna.rotulo} é obrigatória`);
        }
      } else {
        if (coluna.transformar) {
          try {
            valor = coluna.transformar(bruto);
          } catch (erro) {
            const mensagem =
              erro instanceof Error && erro.message
                ? erro.message
                : "valor inválido";
            erros.push(`Coluna ${coluna.rotulo}: ${mensagem}`);
            valor = null;
          }
        }
        if (coluna.validar) {
          const mensagemErro = coluna.validar(valor, dados);
          if (mensagemErro) erros.push(mensagemErro);
        }
      }

      (dados as Record<string, unknown>)[coluna.chave] = valor;
    }

    if (!temConteudo) return; // linha totalmente vazia: ignora

    const resultado: ResultadoLinha<T> = { linha: numeroLinha, dados, erros };
    if (erros.length === 0) {
      validas.push(resultado);
    } else {
      invalidas.push(resultado);
    }
  });

  return {
    validas,
    invalidas,
    totalLinhas: validas.length + invalidas.length,
  };
}
