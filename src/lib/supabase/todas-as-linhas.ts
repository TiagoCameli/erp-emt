import "server-only";

/**
 * Busca TODAS as linhas de uma consulta, passando por cima do teto do PostgREST.
 *
 * O PostgREST corta a resposta em 1.000 linhas por padrão (`db-max-rows`), e o
 * corte é SILENCIOSO: a consulta não dá erro, só devolve menos. Isso já mordeu de
 * verdade: o Combobox de insumo da ordem de compra recebia 1.000 dos 3.349
 * insumos ativos, e os outros 2.349 ficavam inalcançáveis, nem digitando, porque
 * o filtro da tela roda sobre o que chegou.
 *
 * Uma consulta sem `.limit()` no código não é uma consulta sem limite. Para
 * qualquer lista que possa passar de mil linhas, use isto.
 *
 * Uso:
 *   const linhas = await todasAsLinhas((de, ate) =>
 *     supabase.from("insumos").select("id, nome").eq("ativo", true)
 *       .order("nome").range(de, ate),
 *   );
 */

/** Teto de linhas por requisição do PostgREST. */
const PAGINA = 1000;

/** Trava de segurança: 100 páginas (1 milhão de linhas) é bug, não cadastro. */
const MAX_PAGINAS = 100;

export async function todasAsLinhas<T>(
  buscarFaixa: (
    de: number,
    ate: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ linhas: T[]; erro: string | null }> {
  const linhas: T[] = [];

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const de = pagina * PAGINA;
    const { data, error } = await buscarFaixa(de, de + PAGINA - 1);

    if (error) return { linhas, erro: error.message };

    const lote = data ?? [];
    linhas.push(...lote);

    // Lote menor que a página significa que acabou.
    if (lote.length < PAGINA) break;
  }

  return { linhas, erro: null };
}
