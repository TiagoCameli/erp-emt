/**
 * Regra pura do lote de conta bancária. Nada de banco, nada de React.
 *
 * O lote existe porque a carga do Mais Controle deixou milhares de lançamentos
 * sem conta bancária, e a conta é o portão da aprovação: parcela sem conta não
 * entra na fila de pagamento. Definir uma por uma, abrindo o detalhe de cada
 * lançamento, é o atrito que isto remove.
 */

import type { FiltroRevisao } from "@/modules/financeiro/lancamentos/schemas";

/**
 * Teto de lançamentos por chamada.
 *
 * É o MESMO número que a `fn_definir_conta_lancamentos_lote` recusa passar, e
 * existe um teste amarrando os dois: se divergirem, o usuário recebe erro cru do
 * banco em vez do aviso da tela.
 *
 * O motivo do teto não é a rede, é o lock: sem ele um clique vira `update` em
 * milhares de parcelas dentro de uma transação, segurando a tabela que o resto da
 * empresa está usando.
 */
export const LIMITE_LOTE = 500;

/** O que a função do banco devolve, já em camelCase. */
export interface ResumoLote {
  definidos: number;
  puladosComConta: number;
  puladosSemParcelaPendente: number;
  naoEncontrados: number;
}

/**
 * Lançamento em que o lote tem o que fazer.
 *
 * `parcial` entra: é um estado quebrado (a conta deveria ser a mesma em todas as
 * parcelas pendentes) e o lote completa as vazias sem tocar na que já tem conta.
 *
 * `em_revisao` não entra: é outra pergunta (parcela devolvida pelo aprovador), e
 * o lote não pode adivinhar se ela já tem conta ou não.
 */
export function ehElegivelParaLote(linha: { revisao: FiltroRevisao }): boolean {
  return linha.revisao === "sem_conta" || linha.revisao === "parcial";
}

function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

/**
 * Frase do toast depois do lote.
 *
 * Diz o que foi feito E o que não foi. Toast que só diz "pronto" depois de uma
 * ação em massa esconde justamente o que o usuário precisa saber: que 12 ficaram
 * de fora, e por quê.
 */
export function textoResumoLote(resumo: ResumoLote): string {
  const feito =
    resumo.definidos === 0
      ? "Nenhuma conta definida"
      : `Conta definida em ${plural(resumo.definidos, "lançamento", "lançamentos")}`;

  const ressalvas: string[] = [];
  if (resumo.puladosComConta > 0) {
    ressalvas.push(`${resumo.puladosComConta} já tinham conta`);
  }
  if (resumo.puladosSemParcelaPendente > 0) {
    ressalvas.push(
      `${resumo.puladosSemParcelaPendente} não tinham parcela em aberto`,
    );
  }

  const partes = [feito];
  if (ressalvas.length > 0) {
    partes.push(`${ressalvas.join(" e ")}: pulados`);
  }
  if (resumo.naoEncontrados > 0) {
    partes.push(
      `${resumo.naoEncontrados} não foram encontrados: a lista estava velha, recarregue a tela`,
    );
  }
  return partes.join(". ");
}
