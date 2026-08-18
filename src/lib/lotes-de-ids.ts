/**
 * Quantos ids cabem num `in.(...)` do PostgREST por requisição.
 *
 * **Medido no projeto vivo em 13/08/2026, não escolhido por gosto.** O filtro
 * `in` vai na QUERY STRING de um GET, então cada uuid custa 37 caracteres de URL
 * (36 mais a vírgula):
 *
 * - 1000 ids = 37 KB de URL  -> HTTP 400 Bad Request
 * -  500 ids = 18,5 KB       -> passa
 * -  100 ids = 3,7 KB        -> passa
 *
 * O 400 acontece ANTES de qualquer checagem de permissão ou RLS, então ele não
 * se confunde com "sem acesso": some a resposta inteira, e do lado do app chega
 * como um erro genérico de consulta.
 *
 * 200 dá ~7,5 KB, abaixo dos 8 KB em que proxy e CDN costumam cortar, e evita
 * virar uma consulta por lançamento. Subir isto de volta para perto de 1000
 * quebra a exportação com dado real E PASSA EM TODO TESTE, porque teste roda com
 * dois registros: foi exatamente assim que a primeira versão desta exportação
 * subiu quebrada.
 */
export const LOTE_IDS_POSTGREST = 200;

/**
 * Quebra uma lista em pedaços de no máximo `tamanho`. Lista vazia devolve nenhum
 * pedaço (e não um pedaço vazio), porque quem chama roda uma consulta por pedaço
 * e `in.()` sem id nenhum é erro no PostgREST.
 */
export function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let inicio = 0; inicio < itens.length; inicio += tamanho) {
    lotes.push(itens.slice(inicio, inicio + tamanho));
  }
  return lotes;
}
