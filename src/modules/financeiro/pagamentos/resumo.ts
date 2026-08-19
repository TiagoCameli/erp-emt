import type { ParcelaAprovada } from "@/modules/financeiro/pagamentos/queries";

/**
 * A parcela pode ser paga agora?
 *
 * Só `aprovado`. `fn_pagar_parcela` recusa `pendente` ("a parcela precisa estar
 * aprovada para pagamento") e `em_revisao` ("precisa ser reenviada e aprovada
 * antes de pagar"), então esta é a MESMA regra do banco — e é ela que decide se
 * a linha ganha botão de pagar e se entra no pagamento em lote.
 *
 * Parcela sem `status` é a que chega pela aba Programados, cuja fila já é só de
 * aprovadas; tratar a ausência como "pode" mantém aquela tela funcionando sem
 * ela precisar carregar o campo.
 */
export function podePagarParcela(parcela: ParcelaAprovada): boolean {
  return (parcela.status ?? "aprovado") === "aprovado";
}

/** Resumo de um conjunto de parcelas em aberto, para os cards do topo. */
export interface ResumoAPagar {
  total: number;
  parcelas: number;
  /** O que já pode ser pago hoje. */
  aprovado: number;
  aprovadas: number;
  /** O que ainda depende de aprovação (pendente ou em revisão). */
  aguardando: number;
  aguardandoParcelas: number;
  /** O que já passou do vencimento, aprovado ou não. */
  vencido: number;
  vencidas: number;
}

const VAZIO: ResumoAPagar = {
  total: 0,
  parcelas: 0,
  aprovado: 0,
  aprovadas: 0,
  aguardando: 0,
  aguardandoParcelas: 0,
  vencido: 0,
  vencidas: 0,
};

/**
 * Soma o conjunto para os cards, numa passada só.
 *
 * `hoje` vem do SERVIDOR (data de Rio Branco), nunca do relógio do navegador:
 * máquina com fuso ou data errada pintaria de vencido o que ainda não venceu, e
 * vencido é o número que faz alguém correr para pagar.
 *
 * Vencido cruza com aprovado de propósito: uma parcela vencida e ainda não
 * aprovada conta nos dois cards, porque as duas perguntas são diferentes
 * ("quanto já está atrasado" e "quanto eu consigo pagar agora"). Somar os
 * quatro cards não dá o total, e não deve dar.
 */
export function somarParaResumo(
  parcelas: readonly ParcelaAprovada[],
  hoje: string,
): ResumoAPagar {
  const resumo: ResumoAPagar = { ...VAZIO };

  for (const parcela of parcelas) {
    resumo.total += parcela.valor;
    resumo.parcelas += 1;

    if (podePagarParcela(parcela)) {
      resumo.aprovado += parcela.valor;
      resumo.aprovadas += 1;
    } else {
      resumo.aguardando += parcela.valor;
      resumo.aguardandoParcelas += 1;
    }

    if (parcela.dataVencimento !== null && parcela.dataVencimento < hoje) {
      resumo.vencido += parcela.valor;
      resumo.vencidas += 1;
    }
  }

  return resumo;
}

/** "3 parcelas" / "1 parcela", para o detalhe do card. */
export function contagem(quantas: number): string {
  return quantas === 1 ? "1 parcela" : `${quantas} parcelas`;
}
