import type ExcelJS from "exceljs";

/**
 * Leitura de célula do xlsx oficial da planilha contratual, sem perder casa.
 *
 * Regra da spec (6.1): vale o VALOR da célula, nunca o texto formatado. O Excel guarda o número
 * como double; aqui ele vira a representação mais curta que volta ao mesmo double (String(n)), e é
 * esse texto que vai para o numeric do banco. Texto numa coluna de número (ex.: "1.234,56") não é
 * convertido: é exatamente o texto formatado que esconde casas, e a importação recusa.
 */

export type CelulaLida =
  | { tipo: "vazia" }
  | { tipo: "numero"; texto: string }
  | { tipo: "texto"; bruto: string }
  | { tipo: "formula_sem_valor" }
  | { tipo: "erro"; bruto: string }
  /** Número que só se escreve com expoente (ex.: 1e-7, 1e+21): o numeric do banco não recebe sem perder o controle das casas. */
  | { tipo: "numero_fora_da_faixa"; bruto: string };

export function numeroParaTexto(n: number): string {
  const texto = String(n);
  if (!Number.isFinite(n) || /e/i.test(texto)) throw new Error(`Número fora da faixa: ${texto}`);
  return texto;
}

function deValorSimples(valor: unknown): CelulaLida {
  if (valor === null || valor === undefined) return { tipo: "vazia" };
  if (typeof valor === "number") {
    const texto = String(valor);
    if (!Number.isFinite(valor) || /e/i.test(texto)) return { tipo: "numero_fora_da_faixa", bruto: texto };
    return { tipo: "numero", texto: numeroParaTexto(valor) };
  }
  if (typeof valor === "string") return valor.trim() === "" ? { tipo: "vazia" } : { tipo: "texto", bruto: valor };
  if (typeof valor === "boolean") return { tipo: "texto", bruto: valor ? "VERDADEIRO" : "FALSO" };
  if (valor instanceof Date) return { tipo: "texto", bruto: valor.toISOString().slice(0, 10) };
  return { tipo: "erro", bruto: JSON.stringify(valor) };
}

export function lerCelula(valor: ExcelJS.CellValue): CelulaLida {
  if (valor === null || valor === undefined) return { tipo: "vazia" };
  if (typeof valor !== "object" || valor instanceof Date) return deValorSimples(valor);
  if ("richText" in valor) return deValorSimples(valor.richText.map((trecho) => trecho.text).join(""));
  if ("hyperlink" in valor) return deValorSimples(valor.text);
  if ("formula" in valor || "sharedFormula" in valor) {
    const resultado = (valor as { result?: unknown }).result;
    if (resultado === undefined || resultado === null) return { tipo: "formula_sem_valor" };
    if (typeof resultado === "object" && resultado !== null && "error" in resultado) {
      return { tipo: "erro", bruto: String((resultado as { error: unknown }).error) };
    }
    return deValorSimples(resultado);
  }
  if ("error" in valor) return { tipo: "erro", bruto: String(valor.error) };
  return { tipo: "erro", bruto: JSON.stringify(valor) };
}

export function enderecoCelula(linha: number, coluna: number): string {
  let letras = "";
  let n = coluna;
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return `${letras}${linha}`;
}
