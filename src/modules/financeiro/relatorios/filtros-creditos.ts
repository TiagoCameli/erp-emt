import {
  lerOpcaoDaUrl,
  type ParametrosUrl,
} from "@/modules/financeiro/relatorios/filtros-periodo";

/**
 * Contrato da URL do relatório de Créditos: a situação do contrato.
 *
 * ## Por que só a situação, e não o credor também
 *
 * Porque a situação é o único corte que a tela inteira consegue acompanhar sem
 * mudar RPC. O relatório tem QUATRO leituras do mesmo dinheiro (os cartões, os
 * contratos do centro de Empréstimos, a tabela por lançamento e o "o que vence
 * pela frente"), e as duas últimas vêm de funções diferentes:
 * `fn_rel_creditos` responde por lançamento e `fn_rel_creditos_por_mes` soma as
 * parcelas em aberto dos próximos doze meses, sem devolver de quem é cada uma.
 *
 * Filtrar por CREDOR sobre o que já chegou recortaria as três primeiras e
 * deixaria a quarta inteira: a tela mostraria "Vence em 12 meses R$ 4,1 mi" ao
 * lado de uma tabela de um credor só. É a divergência que este módulo mais
 * pagou caro. O credor precisa de `p_credor` nas duas funções — está descrito no
 * relatório da tarefa como proposta.
 *
 * Já a SITUAÇÃO se resolve por construção: quitado é o contrato sem parcela em
 * aberto (`proximo_vencimento` nulo, que é o `min(data_vencimento) filter (where
 * status <> 'pago')` da RPC), e `fn_rel_creditos_por_mes` só soma parcela com
 * `status <> 'pago'` e vencimento não nulo. Um contrato quitado contribui zero
 * para os próximos meses — então filtrar "quitado" zera aquele bloco em vez de
 * discordar dele, e filtrar "em aberto" não tira nada de lá.
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** A situação de um contrato de crédito. */
export type SituacaoCredito = "em_aberto" | "quitado";

export const SITUACOES_CREDITO: readonly SituacaoCredito[] = [
  "em_aberto",
  "quitado",
];

/** Como cada situação aparece no seletor e na coluna da tabela. */
export const ROTULO_SITUACAO_CREDITO: Record<SituacaoCredito, string> = {
  em_aberto: "Em aberto",
  quitado: "Quitado",
};

export interface FiltrosCreditos {
  /** Vazio = todos os contratos, que é o padrão do relatório. */
  situacao: SituacaoCredito | "";
}

/** Lê e valida a URL do relatório de créditos. */
export function lerFiltrosCreditos(params: ParametrosUrl): FiltrosCreditos {
  return {
    situacao: lerOpcaoDaUrl(params.situacao, SITUACOES_CREDITO) ?? "",
  };
}

/**
 * O contrato passa no filtro de situação?
 *
 * "Em aberto" é ter próxima parcela a vencer. Não é "saldo devedor maior que
 * zero": as duas coisas quase sempre andam juntas, mas o saldo é a soma dos
 * valores e a próxima parcela é a existência dela — um contrato com parcela em
 * aberto de valor zero continua sendo um contrato aberto, e é essa a definição
 * que a tabela já usa para escrever "Quitado" na linha.
 */
export function passaNaSituacao(
  proximoVencimento: string | null,
  situacao: FiltrosCreditos["situacao"],
): boolean {
  if (situacao === "") return true;
  return situacao === "em_aberto"
    ? proximoVencimento !== null
    : proximoVencimento === null;
}

/**
 * Recorta o relatório de créditos pela situação, RECALCULANDO os totais.
 *
 * Os totais não podem vir do servidor quando há filtro: eles são a soma da
 * carteira inteira, e mostrá-los embaixo de uma tabela recortada são dois
 * números que não se explicam um ao outro. Aqui os cartões passam a somar
 * exatamente as linhas que ficaram, que é a regra do módulo.
 *
 * `proximosMeses` NÃO é recortado, e é de propósito: ele é a curva de
 * vencimentos, e todo vencimento futuro vem de contrato em aberto — filtrar por
 * "quitado" devolveria uma curva vazia, que é a resposta certa, e por
 * "em aberto" devolveria a mesma curva. Recalculá-lo seria trabalho para chegar
 * onde já se está.
 */
export function recortarCreditosPorSituacao<
  T extends {
    contratos: readonly { proximoVencimento: string | null; valorContratado: number; totalPago: number; saldoDevedor: number }[];
    totalContratado: number;
    totalPago: number;
    totalSaldo: number;
  },
>(dados: T, situacao: FiltrosCreditos["situacao"]): T {
  if (situacao === "") return dados;

  const contratos = dados.contratos.filter((contrato) =>
    passaNaSituacao(contrato.proximoVencimento, situacao),
  );

  return {
    ...dados,
    contratos,
    totalContratado: somar(contratos, (c) => c.valorContratado),
    totalPago: somar(contratos, (c) => c.totalPago),
    totalSaldo: somar(contratos, (c) => c.saldoDevedor),
  };
}

/**
 * Soma em CENTAVOS inteiros e devolve reais.
 *
 * Somar `number` de dinheiro dezenas de vezes é o caminho conhecido para o total
 * do cartão fechar um centavo longe do total da tabela — o mesmo cuidado que
 * `creditos.ts` já toma ao montar os totais originais.
 */
function somar<T>(itens: readonly T[], valor: (item: T) => number): number {
  const centavos = itens.reduce(
    (soma, item) => soma + Math.round(valor(item) * 100),
    0,
  );
  return centavos / 100;
}
