/** Teto de parcelas, validado nas três camadas. Arbitrário, contra digitação absurda. */
export const MAX_PARCELAS = 60;

/**
 * Divide um total em N parcelas iguais de 2 casas, com a sobra de centavos na
 * primeira. A soma das parcelas é sempre exatamente o total: a conta é feita em
 * centavos inteiros justamente para não acumular erro de ponto flutuante.
 *
 * O servidor recalcula esta divisão na hora de gravar. A prévia na tela é
 * informativa e nunca é fonte de verdade.
 */
export function dividirEmParcelas(total: number, quantidade: number): number[] {
  const totalCentavos = Math.round(total * 100);
  const base = Math.floor(totalCentavos / quantidade);
  const sobra = totalCentavos - base * quantidade;

  return Array.from(
    { length: quantidade },
    (_, indice) => (base + (indice === 0 ? sobra : 0)) / 100,
  );
}

/** Quantidade de parcelas cabe no total sem gerar parcela de zero centavo. */
export function quantidadeCabeNoTotal(
  total: number,
  quantidade: number,
): boolean {
  return quantidade >= 1 && quantidade <= Math.round(total * 100);
}
