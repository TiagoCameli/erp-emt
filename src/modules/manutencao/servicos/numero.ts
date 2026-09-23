import { normalizarNumeroDigitado } from "@/lib/numero-digitado";

/**
 * Conversão entre o texto dos campos numéricos da OS e o número que vai à RPC.
 *
 * O formulário guarda o valor cru ("1234,5678"), que é o que o InputQuantidade e
 * o InputPreco escrevem. A conversão passa pelo mesmo `normalizarNumeroDigitado`
 * dos campos, então o número que chega ao banco é o que a pessoa viu na tela.
 * Nada de `parseFloat` cru: ele leria "1.234,5" como 1,234.
 *
 * Módulo puro: serve schema, tela e teste.
 */

/**
 * Texto do campo para número, ou `null` quando o texto não é um número com até
 * `casas` casas decimais. Texto vazio também volta `null`: quem chama decide se
 * vazio é "não informado" (medição) ou erro (quantidade).
 */
export function textoParaNumero(texto: string, casas: number): number | null {
  const normalizado = normalizarNumeroDigitado(texto ?? "", casas);
  if (normalizado === null) return null;
  const numero = Number(normalizado.replace(",", "."));
  return Number.isFinite(numero) ? numero : null;
}

/** Número do banco de volta ao formato do campo ("1234,5"), sem zeros à direita. */
export function numeroParaCampo(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "";
  return String(Number(valor.toFixed(4))).replace(".", ",");
}
