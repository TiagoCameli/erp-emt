/**
 * Parsing e validação de número vindo do formulário (string pt-BR) para os
 * schemas da planilha contratual. Sem 'use server': é pura, usada por client e
 * servidor. Cópia local para não acoplar a Medição ao módulo de estoque.
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
  // Arredondar para `casas` e comparar com o original: se bate, não havia
  // mais casas do que o permitido.
  return Number(valor.toFixed(casas)) === valor;
}

/** Quantidade contratada NUMERIC(14,3): finita, não negativa, até 3 casas. */
export function quantidadeContratadaValida(valor: number): boolean {
  return (
    Number.isFinite(valor) &&
    valor >= 0 &&
    valor <= 99999999999.999 &&
    ateCasas(valor, 3)
  );
}

/** Preço unitário NUMERIC(14,2): finito, não negativo, até 2 casas. */
export function precoUnitarioValido(valor: number): boolean {
  return (
    Number.isFinite(valor) &&
    valor >= 0 &&
    valor <= 999999999999.99 &&
    ateCasas(valor, 2)
  );
}
