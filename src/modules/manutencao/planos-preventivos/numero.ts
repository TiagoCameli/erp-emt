/**
 * Parsing e validação de número vindo do formulário (string pt-BR) para os
 * schemas dos planos preventivos. Sem 'use server': é pura, usada por client e
 * servidor. Cópia local do padrão para a aba não depender de outro módulo.
 */

/** Converte string do form ("1.234,567") em número, ou NaN se inválida. */
export function paraNumero(valor: string): number {
  const limpo = valor.trim().replace(/\./g, "").replace(",", ".");
  if (limpo === "") return Number.NaN;
  return Number(limpo);
}

/** String representa um número finito maior que zero. */
export function numeroPositivo(valor: string): boolean {
  const numero = paraNumero(valor);
  return Number.isFinite(numero) && numero > 0;
}

/** String representa um número finito não negativo (>= 0). */
export function numeroNaoNegativo(valor: string): boolean {
  const numero = paraNumero(valor);
  return Number.isFinite(numero) && numero >= 0;
}

/**
 * String vazia, ou número finito não negativo. Usada nos campos opcionais
 * (horímetro/km da base) que podem ficar em branco no formulário.
 */
export function numeroOpcionalNaoNegativo(valor: string): boolean {
  if (valor.trim() === "") return true;
  return numeroNaoNegativo(valor);
}
