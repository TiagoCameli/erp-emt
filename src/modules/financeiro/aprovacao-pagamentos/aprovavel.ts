import type {
  StatusLancamento,
  StatusParcela,
} from "@/modules/financeiro/_shared/formato";

/** O que decide se uma parcela pode ser aprovada agora. */
export interface EntradaSituacao {
  statusParcela: StatusParcela;
  statusLancamento: StatusLancamento;
  /** Conta escolhida no lançamento. Sem ela o banco recusa aprovar. */
  contaBancariaId: string | null;
}

export interface SituacaoParcela {
  podeAprovar: boolean;
  /** Por que não pode, em uma frase para a tela. `null` quando pode. */
  motivo: string | null;
}

/**
 * Se esta parcela está aprovável, e quando não está, por quê.
 *
 * É a MESMA regra de `listarParcelasPendentes` (o que entra na fila) e de
 * `fn_aprovar_parcela` (o que o banco aceita), escrita em um lugar onde a tela
 * inteira de um pagamento pode explicar a recusa em vez de só esconder o botão.
 * A fila filtra; aqui a pessoa chegou por link direto num pagamento específico e
 * precisa saber o que aconteceu com ele.
 *
 * Isto NÃO é a autorização: quem autoriza é a permissão na Server Action e a RLS.
 * É a explicação para o humano, e o botão que ela esconde é conveniência.
 *
 * A ordem das checagens é a ordem da pergunta que a pessoa está fazendo: o que
 * aconteceu com a PARCELA vem antes do que falta no LANÇAMENTO, senão uma parcela
 * já paga sem conta bancária apareceria como "falta escolher a conta", mandando
 * alguém mexer num lançamento resolvido.
 */
export function situacaoDaParcela(entrada: EntradaSituacao): SituacaoParcela {
  const recusa = (motivo: string): SituacaoParcela => ({
    podeAprovar: false,
    motivo,
  });

  switch (entrada.statusParcela) {
    case "aprovado":
      return recusa(
        "Esta parcela já está aprovada: o pagamento foi autorizado e aguarda a data programada.",
      );
    case "pago":
      return recusa("Esta parcela já foi paga.");
    case "em_revisao":
      return recusa(
        "Esta parcela foi devolvida para revisão e está sendo ajustada por quem lançou.",
      );
    case "cancelado":
      return recusa("Esta parcela foi cancelada.");
    case "pendente":
      break;
  }

  if (entrada.statusLancamento === "cancelado") {
    return recusa("O lançamento desta parcela foi cancelado.");
  }
  if (entrada.statusLancamento === "previsto") {
    return recusa(
      "O lançamento está incompleto: as parcelas não somam o valor dele, então nada aqui pode ser aprovado ainda.",
    );
  }
  if (!entrada.contaBancariaId) {
    return recusa(
      "Falta escolher a conta bancária no lançamento: é dela que o dinheiro sai, e sem ela o pagamento não pode ser autorizado.",
    );
  }

  return { podeAprovar: true, motivo: null };
}
