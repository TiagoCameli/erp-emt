import {
  ORDENS_LANCAMENTO,
  type OrdemLancamento,
} from "@/modules/financeiro/lancamentos/schemas";

/**
 * Ordenação da listagem, na ida e na volta entre a URL e a tabela.
 *
 * Mora aqui, fora da tela e fora de `queries.ts` (que é "server-only"), porque
 * é conversão pura e é onde o ciclo de três estados do clique vive: crescente,
 * decrescente, padrão. Dá para testar sem banco e sem render.
 *
 * A ordenação vai para a URL, junto dos filtros, por dois motivos: sobrevive ao
 * F5 e ao voltar do detalhe, e é o mesmo caminho que a página lê no servidor
 * para pedir a ordem ao banco. Guardada só em estado de componente, ela se
 * perderia na primeira navegação e a lista voltaria calada para a ordem padrão.
 */

/** O que a URL carrega: nada, ou uma coluna e um sentido. */
export interface OrdenacaoLancamentos {
  coluna: OrdemLancamento;
  descendente: boolean;
}

/** Nome de coluna que a listagem sabe ordenar, ou null. */
export function ordemValida(valor: unknown): OrdemLancamento | null {
  return typeof valor === "string" &&
    (ORDENS_LANCAMENTO as readonly string[]).includes(valor)
    ? (valor as OrdemLancamento)
    : null;
}

/**
 * Lê a ordenação dos parâmetros da URL. Coluna desconhecida (URL editada à mão,
 * link antigo de uma coluna que saiu) volta para a ordem padrão em vez de virar
 * erro na cara de quem só queria abrir a tela.
 */
export function lerOrdenacao(
  coluna: string | string[] | undefined,
  direcao: string | string[] | undefined,
): OrdenacaoLancamentos | null {
  const valida = ordemValida(coluna);
  if (!valida) return null;
  return { coluna: valida, descendente: direcao === "desc" };
}

/**
 * O ciclo de um clique no cabeçalho: coluna nova começa crescente; a mesma
 * coluna vira decrescente; no terceiro clique some e a lista volta à ordem
 * padrão. Devolve null quando é para voltar ao padrão.
 */
export function proximaOrdenacao(
  atual: OrdenacaoLancamentos | null,
  coluna: OrdemLancamento,
): OrdenacaoLancamentos | null {
  if (atual === null || atual.coluna !== coluna) {
    return { coluna, descendente: false };
  }
  if (!atual.descendente) return { coluna, descendente: true };
  return null;
}

/**
 * Ordenação como parâmetros de URL. `null` em cada chave apaga o parâmetro, que
 * é como `setMuitos` remove. `pagina` volta para a primeira: mudar a ordem muda
 * quem está na página 1, e continuar na página 7 de uma ordem que não existe
 * mais é cair num lugar que ninguém pediu.
 */
export function ordenacaoParaUrl(
  ordenacao: OrdenacaoLancamentos | null,
): Record<string, string | null> {
  return {
    ordem: ordenacao?.coluna ?? null,
    dir: ordenacao?.descendente ? "desc" : null,
    pagina: null,
  };
}
