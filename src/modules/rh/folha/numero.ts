/**
 * Parsing e validação de número vindo do formulário (string pt-BR) para os
 * schemas da aba de folha gerencial. Sem 'use server': é pura, usada por client
 * e servidor. Cópia local para não acoplar a aba a outro módulo.
 */

/** Converte string do form ("12,5") em número, ou NaN se inválida. */
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

/**
 * Percentual de encargos NUMERIC(5,2): finito, não negativo, até 2 casas e no
 * máximo 999,99. Aceita 0 (folha sem encargos).
 */
export function encargosPercentualValido(valor: number): boolean {
  return (
    Number.isFinite(valor) && valor >= 0 && valor <= 999.99 && ateCasas(valor, 2)
  );
}
