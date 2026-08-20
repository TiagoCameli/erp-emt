/**
 * Geometria do gráfico de custo por centro de custo.
 *
 * Vive fora do componente porque DUAS coisas precisam do mesmo número: o gráfico
 * e o Skeleton que aparece enquanto o Recharts é baixado. O `loading` do
 * `next/dynamic` não recebe props, então se o gráfico decidisse a própria altura
 * o carregamento mediria uma coisa e o gráfico outra, e a página pularia na
 * troca.
 */

/** Limite de barras no gráfico: o resto vira "Outros". A tabela mostra tudo. */
export const MAX_BARRAS = 12;

/** Altura de cada faixa de barra, em px. Barra fina + respiro entre elas. */
const FAIXA = 34;

/** Altura do eixo de valor embaixo, em px. */
const EIXO = 44;

/**
 * Quantas barras o gráfico vai desenhar para N centros: o teto, mais a barra
 * "Outros" quando sobrou alguém de fora dela.
 */
export function barrasDoGrafico(centros: number): number {
  if (centros <= MAX_BARRAS) return centros;
  return MAX_BARRAS + 1;
}

/**
 * Altura em px para N centros. Cresce com o número de barras porque as barras
 * são HORIZONTAIS: com altura fixa, 13 centros esmagam as faixas e 3 centros
 * viram três tarjas gordas em meio metro de branco.
 *
 * O piso existe para o caso de 1 centro não sair achatado contra o eixo.
 */
export function alturaDoGrafico(centros: number): number {
  return Math.max(180, barrasDoGrafico(centros) * FAIXA + EIXO);
}
