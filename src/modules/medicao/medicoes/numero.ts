/**
 * Parsing e validação de número vindo do formulário (string pt-BR) para os
 * schemas da aba de medições. Sem 'use server': é pura, usada por client e
 * servidor. Cópia local para não acoplar a aba ao módulo de estoque.
 */

/** Converte string do form ("1.234,567") em número, ou NaN se inválida. */
export function paraNumero(valor: string): number {
  const limpo = valor.trim().replace(/\./g, "").replace(",", ".");
  if (limpo === "") return Number.NaN;
  return Number(limpo);
}

/** String representa um número finito não negativo (>= 0). */
export function numeroNaoNegativo(valor: string): boolean {
  const numero = paraNumero(valor);
  return Number.isFinite(numero) && numero >= 0;
}

/** O número tem no máximo `casas` casas decimais. */
export function ateCasas(valor: number, casas: number): boolean {
  if (!Number.isFinite(valor)) return false;
  return Number(valor.toFixed(casas)) === valor;
}

/** Quantidade medida NUMERIC(14,3): finita, não negativa, até 3 casas. */
export function quantidadeMedidaValida(valor: number): boolean {
  return (
    Number.isFinite(valor) &&
    valor >= 0 &&
    valor <= 99999999999.999 &&
    ateCasas(valor, 3)
  );
}

/**
 * Valor de reajuste NUMERIC(14,4): finito, não negativo, até 4 casas. Cobre
 * tanto percentual (ex: 12,5 = 12,5%) quanto valor fixo em R$.
 */
export function reajusteValorValido(valor: number): boolean {
  return (
    Number.isFinite(valor) &&
    valor >= 0 &&
    valor <= 9999999999.9999 &&
    ateCasas(valor, 4)
  );
}
