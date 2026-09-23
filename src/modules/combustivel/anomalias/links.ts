/**
 * Onde a anomalia leva. Módulo puro (tela e painel).
 *
 * A saída abre na página de detalhe do abastecimento (`/combustivel/abastecimentos/<id>`),
 * que já existe e mostra camadas, conta corrente e alocações. Um lugar só monta o link.
 */
export function linkDaSaida(saidaId: string): string {
  return `/combustivel/abastecimentos/${encodeURIComponent(saidaId)}`;
}

export const ROTA_ANOMALIAS = "/combustivel/anomalias";
