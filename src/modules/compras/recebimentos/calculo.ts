/**
 * Cálculo puro do recebimento. Sem React, sem 'use server'.
 *
 * O saldo a receber de um item da OC é a quantidade pedida menos a soma do que
 * já foi recebido em recebimentos anteriores, nunca negativo. A query de OCs
 * receptíveis e o drawer de recebimento usam estas funções.
 */

/**
 * Converte texto digitado em número, tratando ponto como milhar e vírgula como
 * decimal (padrão pt-BR). Vazio ou inválido vira 0, nunca NaN.
 */
export function paraNumero(texto: string): number {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  if (limpo === "") return 0;
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * Soma as quantidades já recebidas de um item, ignorando entradas nulas.
 * Aceita o shape vindo do Supabase ({ quantidade_recebida }).
 */
export function totalRecebido(
  recebimentos: ReadonlyArray<{ quantidade_recebida: number | null }>,
): number {
  return recebimentos.reduce(
    (soma, linha) => soma + (linha.quantidade_recebida ?? 0),
    0,
  );
}

/**
 * Saldo a receber de um item: pedido menos já recebido, nunca menor que zero.
 * Recebimentos a mais (correção, sobra) não viram saldo negativo.
 */
export function saldoAReceber(
  quantidadePedida: number,
  quantidadeRecebida: number,
): number {
  return Math.max(0, quantidadePedida - quantidadeRecebida);
}
