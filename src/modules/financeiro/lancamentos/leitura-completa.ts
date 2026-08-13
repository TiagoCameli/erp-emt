import type { LancamentoLista } from "@/modules/financeiro/lancamentos/queries";

/**
 * Leitura do conjunto FILTRADO inteiro, página por página.
 *
 * Serve a exportação para Excel e o resumo do cabeçalho: os dois precisam de
 * todas as linhas do filtro, não da página aberta, e os dois têm que enxergar
 * exatamente o que a lista enxerga. Por isso recebe o leitor de página por
 * parâmetro em vez de montar consulta: quem chama passa `listarLancamentos` com
 * os mesmos filtros da tela, e não existe um segundo lugar montando filtro.
 *
 * Módulo puro (nada de banco, nada de exceljs), então é testável direto.
 */

/**
 * Linhas por requisição.
 *
 * Mil, e não "tudo de uma vez", porque o PostgREST corta a resposta num teto
 * invisível: pedir oito mil linhas numa tacada pode devolver menos, e aí a
 * planilha sai faltando lançamento e o resumo mostra total menor sem ninguém
 * perceber. É o mesmo tamanho que `lerEmPaginas` usa nas consultas auxiliares de
 * filtro, pelo mesmo motivo.
 */
export const PAGINA_LEITURA = 1000;

/**
 * Uma página da listagem, com o total exato do filtro.
 *
 * Genérica em `T` porque a exportação lê a MESMA página e depois a enriquece
 * (observações, rateio, conta): o leitor devolve `LancamentoPlanilha` e a
 * deduplicação por id continua valendo sem cópia desta função.
 */
export interface PaginaDeLancamentos<T extends LancamentoLista = LancamentoLista> {
  itens: T[];
  total: number;
}

/** Quem busca uma página. Injetado para esta função não depender do banco. */
export type LeitorDePagina<T extends LancamentoLista = LancamentoLista> = (
  pagina: number,
  tamanho: number,
) => Promise<PaginaDeLancamentos<T>>;

export interface LeituraCompleta<T extends LancamentoLista = LancamentoLista> {
  /** Linhas lidas, na ordem da listagem, sem repetição. */
  itens: T[];
  /** Total exato do filtro, direto do count do banco. */
  total: number;
}

/**
 * Lê o filtro inteiro, página por página, até fechar o total.
 *
 * `itens.length < total` no retorno significa leitura incompleta, e quem chamou
 * tem que tratar como erro em vez de usar o que veio: planilha com metade dos
 * lançamentos, ou resumo somando metade do dinheiro, é pior que a operação que
 * falhou avisando.
 *
 * Deduplica por id de propósito. Se alguém criar um lançamento no meio da
 * leitura, o novo entra na frente e empurra as linhas uma casa para baixo, o que
 * faria uma linha aparecer em duas páginas. Somar dois lançamentos iguais é o
 * tipo de erro que ninguém confere.
 *
 * `teto` é freio de disparada, não regra de negócio: passando dele a função
 * devolve `itens` vazio com o `total` real, para a tela dizer o número.
 */
export async function lerLancamentosEmPaginas<
  T extends LancamentoLista = LancamentoLista,
>(
  ler: LeitorDePagina<T>,
  teto: number,
  tamanhoPagina: number = PAGINA_LEITURA,
): Promise<LeituraCompleta<T>> {
  const vistos = new Set<string>();
  const itens: T[] = [];
  let total = 0;

  const maximoDePaginas = Math.ceil(teto / tamanhoPagina);
  for (let pagina = 0; pagina < maximoDePaginas; pagina += 1) {
    const lote = await ler(pagina, tamanhoPagina);
    total = lote.total;

    // Passou do teto: para na primeira página, sem varrer o banco à toa.
    if (total > teto) return { itens: [], total };

    for (const item of lote.itens) {
      if (vistos.has(item.id)) continue;
      vistos.add(item.id);
      itens.push(item);
    }

    // Página curta é fim de lista. E o total fechado também: sem essa saída, um
    // filtro de 1000 exatas pediria uma página a mais só para ouvir "vazio".
    if (lote.itens.length < tamanhoPagina) break;
    if (itens.length >= total) break;
  }

  return { itens, total };
}
