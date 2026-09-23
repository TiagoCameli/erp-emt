import { modoDaUrl, type Modo } from "@/modules/combustivel/anomalias/base";
import { periodoAnterior } from "@/modules/combustivel/painel/calculo";
import { periodoDaUrl, ultimosDias, type Periodo } from "@/modules/combustivel/relatorios/periodo";

/**
 * O recorte das abas analíticas, lido da URL como a Visão Geral lê: modo (`?modo=carretas`,
 * padrão próprios) e período (`de`/`ate`, padrão os últimos 30 dias da origem). O período
 * anterior, de mesma duração, alimenta os deltas. Módulo puro.
 */

/** Padrão da origem: preset "ultimos_30". */
export const DIAS_PADRAO_ANALITICO = 30;

export interface RecorteAnalitico {
  modo: Modo;
  periodo: Periodo;
  anterior: Periodo;
}

export function recorteDaUrl(params: Record<string, string | string[] | undefined>, hoje: string): RecorteAnalitico {
  const periodo = periodoDaUrl(params.de, params.ate, ultimosDias(hoje, DIAS_PADRAO_ANALITICO));
  return { modo: modoDaUrl(params.modo), periodo, anterior: periodoAnterior(periodo.de, periodo.ate) };
}
