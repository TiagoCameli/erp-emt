/**
 * Parsing e validação de valor monetário vindo do formulário (string pt-BR)
 * para o schema de adiantamentos. Sem 'use server': é pura, usada por client
 * e servidor.
 */

/** Converte string do form ("1.234,56") em número, ou NaN se inválida. */
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

/** O número tem no máximo `casas` casas decimais. */
function ateCasas(valor: number, casas: number): boolean {
  if (!Number.isFinite(valor)) return false;
  return Number(valor.toFixed(casas)) === valor;
}

/** Valor NUMERIC(14,2): finito, maior que zero, até 2 casas. */
export function valorValido(valor: number): boolean {
  return (
    Number.isFinite(valor) &&
    valor > 0 &&
    valor <= 999999999999.99 &&
    ateCasas(valor, 2)
  );
}
