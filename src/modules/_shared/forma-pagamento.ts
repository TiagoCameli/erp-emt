/**
 * Tipo da forma de pagamento: o classificador que a regra de pagamento lê.
 *
 * O catálogo de formas é livre (o usuário cria "PIX", "Cartão de Crédito",
 * "Espécie"...), então nenhuma regra pode depender do nome digitado. Quem manda
 * é o tipo, e é ele que decide o caminho do lançamento:
 *
 *   bancario, cheque            -> passa pela fila de aprovação de pagamento
 *   dinheiro, cartao_credito    -> não passa pela fila: a parcela nasce
 *                                  aprovada e já pode ser paga em Pagamentos
 *
 * Espelha o check de `formas_pagamento.tipo` e a função
 * `fn_aplicar_regra_pagamento` no banco.
 *
 * Sem 'use server': é só dado, importável por Server e Client Components.
 */

export const TIPOS_FORMA_PAGAMENTO = [
  "bancario",
  "dinheiro",
  "cartao_credito",
  "cheque",
] as const;

export type TipoFormaPagamento = (typeof TIPOS_FORMA_PAGAMENTO)[number];

/** Rótulo curto, para tabela e badge. */
export const ROTULO_TIPO_FORMA: Record<TipoFormaPagamento, string> = {
  bancario: "Bancário",
  dinheiro: "Dinheiro",
  cartao_credito: "Cartão de crédito",
  cheque: "Cheque",
};

/** Explicação de escolha, para formulário. */
export const AJUDA_TIPO_FORMA: Record<TipoFormaPagamento, string> = {
  bancario: "PIX, TED, boleto, transferência",
  dinheiro: "Espécie, saindo do caixa",
  cartao_credito: "Cartão de crédito da empresa",
  cheque: "Cheque próprio",
};

/**
 * O que acontece com o pagamento em cada tipo. Texto de tela: é o que evita a
 * pergunta "por que essa parcela não apareceu na aprovação?".
 */
export const CAMINHO_DO_PAGAMENTO: Record<TipoFormaPagamento, string> = {
  bancario: "Passa pela aprovação de pagamento antes de ser pago.",
  cheque: "Passa pela aprovação de pagamento antes de ser pago.",
  dinheiro: "Não passa pela aprovação: vai direto para Pagamentos.",
  // Mudou em 21/08/2026: cartão deixou de nascer quitado na compra. Uma compra
  // em 12x não sai do caixa na data da compra, sai na fatura, parcela por
  // parcela — quitar tudo de uma vez dava data de pagamento errada em 11 das 12.
  cartao_credito:
    "Não passa pela aprovação: vai direto para Pagamentos, parcela por parcela.",
};

/**
 * A forma passa pela FILA DE APROVAÇÃO de pagamento?
 *
 * Só `bancario` e `cheque`. Dinheiro vai direto para Pagamentos e cartão nasce
 * quitado — nenhum dos dois espera aval, e os dois vivem na aba "Dinheiro e
 * cartão", que existe para conferência depois do fato.
 *
 * Existe como predicado, e não como condição repetida em cada consulta, porque
 * a fila e a aba de dinheiro e cartão têm que ser COMPLEMENTARES: enquanto a
 * regra vivia só na aba de dinheiro e cartão, a fila não filtrava forma nenhuma
 * e as duas abas se sobrepunham — 8 parcelas de cartão de crédito
 * (R$ 7.189,04, medido em 20/08/2026) apareciam nas duas, contra o que a própria
 * descrição da tela de aprovação promete.
 *
 * O default de `tipoFormaPagamento` é `bancario`, então parcela sem forma (o que
 * o RH cria) e tipo desconhecido continuam PASSANDO pela fila. É o default
 * seguro: esconder de quem aprova é pior do que mostrar demais.
 */
export function passaPelaAprovacao(tipo: TipoFormaPagamento): boolean {
  return tipo === "bancario" || tipo === "cheque";
}

/**
 * A forma vive na aba "Dinheiro e cartão", que é conferência depois do fato?
 *
 * O NEGADO de `passaPelaAprovacao`, e escrito assim de propósito em vez de
 * repetir a lista: os dois destinos são COMPLEMENTARES, e foi a lista repetida
 * (a fila sem filtro nenhum, a aba com `in ('dinheiro','cartao_credito')`) que
 * deixou parcela de cartão aparecer nas duas ao mesmo tempo. Derivando um do
 * outro, tipo novo cai em exatamente um destino sem ninguém precisar lembrar de
 * mexer nos dois lugares.
 */
export function ehPagamentoDireto(tipo: TipoFormaPagamento): boolean {
  return !passaPelaAprovacao(tipo);
}

/**
 * Os tipos que vão para a aba "Dinheiro e cartão", para o filtro da consulta.
 * Derivado do catálogo, e não digitado, pelo mesmo motivo acima.
 */
export const TIPOS_PAGAMENTO_DIRETO: readonly TipoFormaPagamento[] =
  TIPOS_FORMA_PAGAMENTO.filter(ehPagamentoDireto);

export function ehTipoFormaPagamento(
  valor: unknown,
): valor is TipoFormaPagamento {
  return (
    typeof valor === "string" &&
    (TIPOS_FORMA_PAGAMENTO as readonly string[]).includes(valor)
  );
}

/**
 * Normaliza o que vem do banco. Tipo desconhecido ou ausente cai em
 * `bancario` de propósito: o default seguro é PASSAR pela aprovação.
 */
export function tipoFormaPagamento(valor: unknown): TipoFormaPagamento {
  return ehTipoFormaPagamento(valor) ? valor : "bancario";
}
