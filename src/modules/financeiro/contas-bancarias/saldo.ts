/**
 * Saldo derivado de conta bancária: a parte que sobra para o Node.
 *
 * O que este módulo NÃO faz, e é o motivo dele existir nesta forma: ele não
 * recebe uma linha por parcela paga. A soma sai do Postgres, agregada por
 * `fn_rel_posicao_bancaria`, que devolve UMA linha por conta e tipo. Somar
 * parcela por parcela aqui era um defeito silencioso: o PostgREST corta a
 * resposta em 1.000 linhas sem erro nenhum, e a carga da BR-364 cria 1.696
 * parcelas pagas. A coluna "Saldo atual" ignoraria umas 696 saídas e mostraria
 * saldo mais alto do que a conta tem, discordando de Relatórios > Posição
 * bancária, que já passa por essa mesma RPC.
 *
 * Por isso o `valor_liquido` (valor menos desconto) não aparece mais aqui: ele
 * mora dentro da RPC, junto com a regra de ignorar lançamento cancelado. O que
 * resta em TypeScript, e ainda pode errar, é o que este módulo guarda:
 *   1. o SINAL de cada tipo (a_receber soma, a_pagar subtrai);
 *   2. NUMERIC que chega do PostgREST como string virar o real certo;
 *   3. a aritmética em centavos inteiros, para o KPI "Total em contas" e a
 *      coluna não divergirem por arredondamento.
 *
 * A conversão é a MESMA de financeiro/relatorios (paraCentavos/paraReais), de
 * propósito: as duas telas leem a mesma função do banco pelo mesmo conversor,
 * então não há como uma mostrar um centavo diferente da outra.
 */

import {
  paraCentavos,
  paraReais,
} from "@/modules/financeiro/relatorios/calculo";

/**
 * Uma linha de `fn_rel_posicao_bancaria`: o total JÁ SOMADO no banco das
 * parcelas pagas de uma conta num tipo de lançamento. São no máximo duas linhas
 * por conta (a_pagar e a_receber), não uma por parcela.
 *
 * `total` aceita string porque NUMERIC pode chegar assim do PostgREST; o tipo
 * gerado diz `number` e essa é a parte em que ele mente.
 */
export interface MovimentoContaAgregado {
  contaBancariaId: string;
  tipo: string;
  total: number | string | null;
}

/**
 * Movimento de cada conta, em CENTAVOS inteiros, a partir das linhas agregadas
 * da RPC. Soma (em vez de sobrescrever) porque cada conta chega em até duas
 * linhas, uma por tipo, e o movimento da conta é a junção das duas.
 *
 * Sinal: a_receber entra somando (dinheiro entrou na conta), qualquer outro
 * tipo entra subtraindo (saiu). `lancamentos.tipo` só admite a_pagar e
 * a_receber, então "qualquer outro" é a_pagar; é o mesmo tratamento do
 * relatório Posição bancária.
 */
export function movimentoPorContaEmCentavos(
  linhas: readonly MovimentoContaAgregado[],
): Map<string, number> {
  const movimento = new Map<string, number>();

  for (const linha of linhas) {
    const sinal = linha.tipo === "a_receber" ? 1 : -1;
    const centavos = paraCentavos(linha.total) * sinal;
    movimento.set(
      linha.contaBancariaId,
      (movimento.get(linha.contaBancariaId) ?? 0) + centavos,
    );
  }

  return movimento;
}

/**
 * Saldo atual de uma conta em reais: saldo inicial mais o movimento das
 * parcelas pagas nela. Conta sem nenhuma parcela paga não aparece na RPC e fica
 * com o próprio saldo inicial, que é o certo.
 */
export function saldoAtualDaConta(
  saldoInicial: number | string | null,
  movimentoCentavos: number,
): number {
  return paraReais(paraCentavos(saldoInicial) + movimentoCentavos);
}
