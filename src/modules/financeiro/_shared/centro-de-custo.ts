/**
 * O centro de custo de um lançamento, como uma célula de tabela pode mostrar.
 *
 * O problema é que um lançamento tem RATEIO, não um centro: ele pode dividir o
 * mesmo custo entre várias obras. Em 22/08/2026 são 131 dos 6.462 lançamentos
 * com mais de um centro — poucos, mas os de maior valor, e justamente os que uma
 * coluna que mostra "o" centro descreveria errado.
 *
 * Por isso a coluna não nomeia o primeiro da lista quando há vários: nomear um
 * faria a linha parecer ser toda dele, e o número ao lado é dinheiro. Com dois ou
 * mais, a célula conta quantos e manda para o detalhe, que mostra a divisão.
 *
 * Módulo puro, sem React e sem banco: as três telas que usam isso (Lançamentos,
 * Pagamentos e Recebimentos) têm que dizer a MESMA coisa sobre o mesmo
 * lançamento, e duas cópias da regra divergem no primeiro caso de três centros.
 */

/** Uma linha de rateio, no mínimo que o rótulo precisa. */
export interface RateioParaRotulo {
  centroNome: string | null;
}

/**
 * Rótulo do centro de custo para a célula da tabela.
 *
 * `null` quando não há rateio — e a tela mostra travessão, nunca string vazia.
 * Lançamento sem centro não deveria existir (o banco recusa desde 22/08/2026),
 * mas o tipo acompanha o banco em vez de mentir sobre o que pode voltar.
 */
export function rotuloCentroCusto(
  rateios: readonly RateioParaRotulo[] | null | undefined,
): string | null {
  const lista = (rateios ?? []).filter(
    (r) => r.centroNome !== null && r.centroNome !== "",
  );
  if (lista.length === 0) return null;
  if (lista.length === 1) return lista[0].centroNome;
  return `${lista.length} centros de custo`;
}

/**
 * Título do `title=` da célula: os nomes, quando são vários.
 *
 * Existe para o rateio de duas ou três obras não obrigar a abrir o detalhe só
 * para saber quais são. Acima de cinco não lista: o atributo vira um parágrafo e
 * o navegador corta onde quiser.
 */
export function nomesDoRateio(
  rateios: readonly RateioParaRotulo[] | null | undefined,
): string | undefined {
  const lista = (rateios ?? [])
    .map((r) => r.centroNome)
    .filter((n): n is string => n !== null && n !== "");
  if (lista.length < 2) return undefined;
  if (lista.length > 5) return `${lista.length} centros de custo`;
  return lista.join(" · ");
}
