/**
 * Tipo da forma de pagamento: o classificador que a regra de pagamento lê.
 *
 * O catálogo de formas é livre (o usuário cria "PIX", "Cartão de Crédito",
 * "Espécie"...), então nenhuma regra pode depender do nome digitado. Quem manda
 * é o tipo, e é ele que decide o caminho do lançamento:
 *
 *   bancario, cheque  -> passa pela fila de aprovação de pagamento
 *   dinheiro          -> não passa pela fila, vai direto para Pagamentos
 *   cartao_credito    -> nasce quitado (a fatura do cartão não é controlada aqui)
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
  cartao_credito:
    "Nasce quitado no cartão: sem aprovação e sem pagamento a fazer.",
};

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
