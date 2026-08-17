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

/** Ajustes do rodapé da OC. Desconto é sempre positivo e SUBTRAI. */
export interface AjustesDaOrdem {
  frete: number;
  outrasDespesas: number;
  impostos: number;
  desconto: number;
}

/** Ordem sem nenhum ajuste — o caso de toda OC criada pela tela. */
export const SEM_AJUSTES: AjustesDaOrdem = {
  frete: 0,
  outrasDespesas: 0,
  impostos: 0,
  desconto: 0,
};

/**
 * As linhas do rodapé, na ordem em que a conta acontece. Fica aqui e não em cada
 * tela porque o drawer e o detalhe têm que mostrar a mesma coisa: duas cópias
 * divergiriam no primeiro ajuste novo.
 *
 * O desconto é o único que subtrai, e é guardado positivo — por isso o sinal
 * mora aqui, e não no valor.
 */
export const LINHAS_DE_AJUSTE = [
  { chave: "frete", rotulo: "Frete", sinal: "+" },
  { chave: "outrasDespesas", rotulo: "Outras despesas", sinal: "+" },
  { chave: "impostos", rotulo: "Impostos", sinal: "+" },
  { chave: "desconto", rotulo: "Desconto", sinal: "-" },
] as const satisfies readonly {
  chave: keyof AjustesDaOrdem;
  rotulo: string;
  sinal: "+" | "-";
}[];

/** Algum ajuste diferente de zero? Decide se a tela mostra o rodapé. */
export function temAjuste(ajustes: AjustesDaOrdem): boolean {
  return (
    ajustes.frete !== 0 ||
    ajustes.outrasDespesas !== 0 ||
    ajustes.impostos !== 0 ||
    ajustes.desconto !== 0
  );
}

/**
 * Total da OC com os ajustes do rodapé — a MESMA conta que a trigger
 * `fn_total_da_oc` faz no banco:
 *
 *   round(soma(qtd x preço) + frete + outras + impostos - desconto, 2)
 *
 * Duas coisas importam aqui, e as duas são de dinheiro:
 *
 * 1. Arredonda uma vez só, no fim. Arredondar item a item erra: na ordem 2607
 *    do Mais Controle, 7.500,01618 + 2.500,0079650 - 0,02 fecha em R$ 10.000,00,
 *    mas arredondando por item daria R$ 10.000,01.
 * 2. O desconto SUBTRAI. Sem ele a ordem 2592 mostraria R$ 103.835,95 em vez de
 *    R$ 100.000,00 — R$ 3.835,95 de diferença numa prévia que a pessoa usa para
 *    conferir antes de aprovar.
 */
export function totalComAjustes(
  itens: ItemTotalizavel[],
  ajustes: AjustesDaOrdem,
): number {
  const bruto =
    totalOrdemCompra(itens) +
    ajustes.frete +
    ajustes.outrasDespesas +
    ajustes.impostos -
    ajustes.desconto;
  return Math.round(bruto * 100) / 100;
}
