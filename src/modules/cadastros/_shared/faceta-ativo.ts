import type { Faceta } from "@/modules/_shared/filtros-facetados";

/**
 * Faceta do filtro de status ativo/inativo dos cadastros (ver
 * `_shared/filtros-facetados`). "todos" e "" são o filtro solto; valor
 * desconhecido também não filtra, como o `if` que ela substitui.
 */
export function facetaAtivo<T extends { ativo: boolean }>(status: string): Faceta<T>;
export function facetaAtivo<T>(
  status: string,
  ehAtivo: (linha: T) => boolean,
): Faceta<T>;
export function facetaAtivo<T>(
  status: string,
  ehAtivo: (linha: T) => boolean = (linha) =>
    (linha as unknown as { ativo: boolean }).ativo,
): Faceta<T> {
  return {
    selecionados: status === "" || status === "todos" ? [] : [status],
    casa: (linha, valor) =>
      valor === "ativos"
        ? ehAtivo(linha)
        : valor === "inativos"
          ? !ehAtivo(linha)
          : true,
  };
}
