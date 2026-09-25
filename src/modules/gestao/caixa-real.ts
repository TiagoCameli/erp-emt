/**
 * Caixa real do painel de Gestão: o dinheiro que a empresa consegue usar hoje.
 *
 *   contas correntes (e poupança e caixinha)
 * + subcontas de investimento
 * − posição das aplicações que NÃO têm liquidez diária (carência, D+n)
 *
 * Pedido do Tiago (25/09/2026): "contas correntes + aplicações com liquidez
 * diária". A subconta entra pelo SALDO dela (que é a soma das posições mais o
 * movimento depois), e o que está preso sai pela posição da aplicação presa.
 *
 * Conta sem permissão de saldo não vem de `fn_saldos_das_contas`: fica fora
 * e é CONTADA, nunca somada como zero. Somando centavos inteiros.
 */

export interface SaldoDeConta {
  contaId: string;
  tipo: string;
  ativo: boolean;
  saldo: number;
}

export interface AplicacaoPresa {
  contaId: string;
  /** Posição líquida da aplicação que não tem liquidez diária. */
  posicao: number;
}

export interface CaixaReal {
  total: number;
  correntes: number;
  aplicacoesDiarias: number;
  /** Contas ativas cujo saldo a pessoa não pode ver. */
  contasOcultas: number;
}

const centavos = (v: number) => Math.round(v * 100);

export function calcularCaixaReal(
  saldos: readonly SaldoDeConta[],
  presas: readonly AplicacaoPresa[],
  contasAtivas: number,
): CaixaReal {
  const ativas = saldos.filter((s) => s.ativo);
  const correntes = ativas
    .filter((s) => s.tipo !== "investimento")
    .reduce((soma, s) => soma + centavos(s.saldo), 0);
  const subcontas = new Set(ativas.filter((s) => s.tipo === "investimento").map((s) => s.contaId));
  const investido = ativas
    .filter((s) => s.tipo === "investimento")
    .reduce((soma, s) => soma + centavos(s.saldo), 0);
  const preso = presas
    .filter((p) => subcontas.has(p.contaId))
    .reduce((soma, p) => soma + centavos(p.posicao), 0);
  const diarias = investido - preso;
  return {
    total: (correntes + diarias) / 100,
    correntes: correntes / 100,
    aplicacoesDiarias: diarias / 100,
    contasOcultas: Math.max(0, contasAtivas - ativas.length),
  };
}
