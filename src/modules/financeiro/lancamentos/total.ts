/**
 * Soma de dinheiro da listagem de lançamentos.
 *
 * Mora fora de `queries.ts` porque `queries.ts` é "server-only" e isto é regra
 * pura: dá para testar sem banco, e é o que precisa de teste. A soma do total
 * filtrado passa por milhares de valores de duas casas, e somar float direto
 * erra no centavo justamente quando o número é grande — o caso em que ninguém
 * confere de cabeça.
 */

/**
 * Soma valores em reais sem erro de float, passando por centavos inteiros.
 *
 * `Math.round` em cada parcela, e não só no fim: `0.1 + 0.2` já nasce
 * `0.30000000000000004`, então arredondar depois de acumular é arredondar um
 * número que já errou.
 */
export function somarValores(valores: readonly number[]): number {
  let centavos = 0;
  for (const valor of valores) centavos += Math.round(valor * 100);
  return centavos / 100;
}
