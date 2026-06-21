/**
 * Parsing e validação de horas vindas do formulário (string pt-BR) para o
 * schema de banco de horas. Sem 'use server': é pura, usada por client e
 * servidor. Horas são NUMERIC(6,2): até 2 casas decimais.
 */

/** Converte string do form ("1.234,5") em número, ou NaN se inválida. */
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

/** Horas NUMERIC(6,2): finito, maior que zero, até 9999,99, até 2 casas. */
export function horasValidas(valor: number): boolean {
  return (
    Number.isFinite(valor) &&
    valor > 0 &&
    valor <= 9999.99 &&
    ateCasas(valor, 2)
  );
}
