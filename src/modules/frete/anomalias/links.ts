/**
 * Onde a anomalia do Frete leva. Módulo puro (tela e painel). Um lugar só monta o link.
 */
export function linkDoFrete(freteId: string): string {
  return `/frete/fretes/${encodeURIComponent(freteId)}`;
}

export const ROTA_ANOMALIAS_FRETE = "/frete/anomalias";
