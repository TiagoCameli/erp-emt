/** Tamanho padrão de página das listagens de movimento. */
export const TAMANHO_PADRAO = 25;

type Param = string | string[] | undefined;

/** Lê um uuid de filtro da query string (ignora valores inválidos). */
function uuidParam(valor: Param): string | undefined {
  if (typeof valor !== "string") return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    valor,
  )
    ? valor
    : undefined;
}

export interface ParamsMovimentos {
  pagina: number;
  tamanho: number;
  insumoId?: string;
  depositoId?: string;
}

/**
 * Lê paginação (1-based na URL, 0-based aqui) e filtros de insumo/depósito da
 * query string das páginas de movimento. Reaproveitado por entradas, saídas,
 * transferências e inventário.
 */
export function lerParamsMovimentos(
  params: Record<string, Param>,
): ParamsMovimentos {
  const paginaParam = Number(params.pagina);
  const pagina =
    Number.isInteger(paginaParam) && paginaParam > 0 ? paginaParam - 1 : 0;

  const tamanhoParam = Number(params.tamanho);
  const tamanho =
    Number.isInteger(tamanhoParam) && tamanhoParam > 0
      ? tamanhoParam
      : TAMANHO_PADRAO;

  return {
    pagina,
    tamanho,
    insumoId: uuidParam(params.insumo),
    depositoId: uuidParam(params.deposito),
  };
}
