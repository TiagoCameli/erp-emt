/**
 * Parsing e validação de número vindo do formulário (string pt-BR) para os
 * schemas do estoque. Sem 'use server': é pura, usada por client e servidor.
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

/** O número tem no máximo `casas` casas decimais. */
export function ateCasas(valor: number, casas: number): boolean {
  if (!Number.isFinite(valor)) return false;
  // Arredondar para `casas` e comparar com o original: se bate, não havia
  // mais casas do que o permitido. (Math.round sozinho sempre dá inteiro,
  // então não serviria para detectar excesso de decimais.)
  return Number(valor.toFixed(casas)) === valor;
}

/** Quantidade NUMERIC(14,3): finita, não negativa, até 3 casas. */
export function quantidadeValida(valor: number): boolean {
  return (
    Number.isFinite(valor) &&
    valor >= 0 &&
    valor <= 99999999999.999 &&
    ateCasas(valor, 3)
  );
}

/** Custo unitário NUMERIC(14,4): finito, não negativo, até 4 casas. */
export function custoUnitarioValido(valor: number): boolean {
  return (
    Number.isFinite(valor) &&
    valor >= 0 &&
    valor <= 9999999999.9999 &&
    ateCasas(valor, 4)
  );
}
