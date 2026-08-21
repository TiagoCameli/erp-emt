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
 * Uma linha de `fn_rel_posicao_bancaria`: o total JÁ SOMADO no banco de uma
 * conta num tipo de movimento. São no máximo quatro linhas por conta (a_pagar,
 * a_receber, transferencia_entrada, transferencia_saida), nunca uma por
 * parcela.
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
 * Os tipos que ENTRAM dinheiro na conta. Todo o resto sai.
 *
 * `a_receber` é a parcela recebida. `transferencia_entrada` é o lado de quem
 * recebeu numa transferência entre contas da própria EMT — a RPC devolve o par
 * entrada/saída desde a migration 20260820210000. Sem o tipo listado aqui, a
 * entrada cairia no `else` e seria SUBTRAÍDA: a conta que recebeu apareceria
 * com o dobro do valor a menos, sem erro nenhum na tela.
 */
const TIPOS_QUE_ENTRAM = new Set(["a_receber", "transferencia_entrada"]);

/**
 * GÊMEA NO BANCO: `fn_saldo_conta` repete esta MESMA regra de sinal em SQL,
 * porque quem barra pagamento por saldo (`fn_pagar_parcela`) precisa dela sem
 * passar pelo Node. Tipo novo de movimento tem que entrar nos DOIS lugares.
 *
 * Não é zelo teórico: o guard do pagamento já teve fórmula própria, sem as
 * transferências, e em 21/08/2026 a conta operacional apareceu com R$ 22.326,46
 * na tela e R$ -33.173.201,31 no guard. Nenhum pagamento passava, e a tela não
 * tinha como saber.
 */

/**
 * Movimento de cada conta, em CENTAVOS inteiros, a partir das linhas agregadas
 * da RPC. Soma (em vez de sobrescrever) porque cada conta chega em até quatro
 * linhas (a_pagar, a_receber, transferencia_entrada, transferencia_saida) e o
 * movimento da conta é a junção de todas.
 *
 * Sinal: ver TIPOS_QUE_ENTRAM. O que sai é a parcela paga (a_pagar) e o que a
 * conta mandou numa transferência — e nessa saída a TARIFA já vem somada pela
 * RPC, porque o banco debita valor mais tarifa da origem e credita só o valor
 * no destino.
 */
export function movimentoPorContaEmCentavos(
  linhas: readonly MovimentoContaAgregado[],
): Map<string, number> {
  const movimento = new Map<string, number>();

  for (const linha of linhas) {
    const sinal = TIPOS_QUE_ENTRAM.has(linha.tipo) ? 1 : -1;
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
