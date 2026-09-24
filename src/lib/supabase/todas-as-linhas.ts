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
 *
 * Velocidade: a primeira página vai sozinha (lista pequena = uma requisição só).
 * Se ela vier cheia, as seguintes saem em ONDAS PARALELAS de `ONDA` páginas.
 * Antes eram pedidas uma atrás da outra, e cada ida ao banco custava de 100 a
 * 400 ms: os 6,7 mil lançamentos esperavam 7 viagens em fila (~2,6 s) antes de
 * a tela aparecer. Em ondas são 3. O preço é pedir, no fim, até `ONDA - 1`
 * páginas que voltam vazias, e página vazia é barata.
 *
 * A ordem das linhas é a das páginas, não a de chegada das respostas.
 */

/** Teto de linhas por requisição do PostgREST. */
const PAGINA = 1000;

/** Páginas pedidas ao mesmo tempo depois da primeira. */
const ONDA = 5;

/** Trava de segurança: 100 páginas (1 milhão de linhas) é bug, não cadastro. */
const MAX_PAGINAS = 100;

type Faixa<T> = { data: T[] | null; error: { message: string } | null };

export async function todasAsLinhas<T>(
  buscarFaixa: (de: number, ate: number) => PromiseLike<Faixa<T>>,
): Promise<{ linhas: T[]; erro: string | null }> {
  const linhas: T[] = [];
  const pedir = (pagina: number) =>
    buscarFaixa(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);

  let proxima = 0;
  let tamanhoDaOnda = 1;

  while (proxima < MAX_PAGINAS) {
    const paginas = Array.from(
      { length: Math.min(tamanhoDaOnda, MAX_PAGINAS - proxima) },
      (_, i) => proxima + i,
    );
    const respostas = await Promise.all(paginas.map(pedir));

    // Processa NA ORDEM das páginas: a primeira que falhar ou vier incompleta
    // encerra, e o que veio depois dela na mesma onda é descartado.
    for (const { data, error } of respostas) {
      if (error) return { linhas, erro: error.message };

      const lote = data ?? [];
      linhas.push(...lote);

      // Lote menor que a página significa que acabou.
      if (lote.length < PAGINA) return { linhas, erro: null };
    }

    proxima += paginas.length;
    tamanhoDaOnda = ONDA;
  }

  return { linhas, erro: null };
}
