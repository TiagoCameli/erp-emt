/**
 * Cálculo puro do total da ordem de compra. Sem React, sem 'use server'.
 *
 * O valor_total real da OC é calculado pelo trigger do banco, nunca pelo app.
 * Estas funções servem só para a prévia ao vivo no drawer (subtotal por item e
 * total da ordem). São puras e testáveis para garantir que a prévia bate com a
 * regra do banco: soma de quantidade x preço unitário.
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

/** Subtotal de um item: quantidade x preço unitário. */
export function subtotalItem(quantidade: number, precoUnitario: number): number {
  return quantidade * precoUnitario;
}

/** Item considerado no total da OC. */
export interface ItemTotalizavel {
  quantidade: number;
  precoUnitario: number;
}

/** Total da OC: soma dos subtotais dos itens. Lista vazia soma 0. */
export function totalOrdemCompra(itens: ItemTotalizavel[]): number {
  return itens.reduce(
    (soma, item) => soma + subtotalItem(item.quantidade, item.precoUnitario),
    0,
  );
}
