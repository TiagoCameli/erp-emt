/**
 * Regras puras dos KPIs da tela de Pagamentos. Sem React, sem Supabase.
 *
 * Dinheiro somado em centavos (paraCentavos/paraReais), pelo mesmo motivo do
 * resumo dos programados: somar float acumula erro, e aqui o número vai para
 * cima de um botão que move dinheiro.
 */
import { paraCentavos, paraReais } from "@/modules/financeiro/relatorios/calculo";

/** Item mínimo para somar o resumo do histórico de pagamentos. */
export interface ItemResumoPagas {
  /** O que saiu da conta bancária: valor menos desconto. */
  valorLiquido: number;
  /** Desconto concedido no pagamento. Zero quando não houve. */
  desconto: number;
}

export interface ResumoPagas {
  /** Soma do que saiu das contas. É este o "total pago", não o valor devido. */
  totalLiquido: number;
  desconto: number;
  quantidade: number;
  /** Quantas parcelas tiveram algum desconto, para o detalhe do card. */
  comDesconto: number;
}

/**
 * Soma o histórico já filtrado.
 *
 * O total é o líquido e não o devido: o card fica em cima de um extrato, e o
 * que interessa a quem lê um extrato é quanto saiu do banco. O desconto vai
 * ao lado justamente para a diferença entre os dois ser visível em vez de
 * ficar escondida dentro de um número só.
 */
export function resumoPagas(itens: ItemResumoPagas[]): ResumoPagas {
  let liquidoCentavos = 0;
  let descontoCentavos = 0;
  let comDesconto = 0;

  for (const item of itens) {
    liquidoCentavos += paraCentavos(item.valorLiquido);
    const desconto = paraCentavos(item.desconto);
    descontoCentavos += desconto;
    if (desconto > 0) comDesconto += 1;
  }

  return {
    totalLiquido: paraReais(liquidoCentavos),
    desconto: paraReais(descontoCentavos),
    quantidade: itens.length,
    comDesconto,
  };
}
