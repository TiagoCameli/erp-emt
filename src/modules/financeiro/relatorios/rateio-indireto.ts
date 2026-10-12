/**
 * Rateio do custo indireto (PR 3 do controle total, D6/D7/D8, 12/10/2026).
 *
 * O cálculo mora em `fn_rateio_indireto_mes`: custo direto de cada obra no mês,
 * percentual sugerido (pelo custo direto), percentual vigente (o ajustado pelo
 * Tiago, se houver) e o indireto em centavos. Aqui só o formato e a conta da
 * tela de ajuste (quanto falta para 100%).
 */
export type StatusRateio = "automatico" | "ajustado" | "confirmado";

export interface LinhaRateio {
  centroId: string;
  centro: string;
  custoDireto: number;
  pctSugerido: number;
  pctVigente: number;
  indireto: number;
  /** Obra no ajuste do mês que não tem mais custo direto nele. */
  semCusto: boolean;
}

export interface RateioDoMes {
  /** yyyy-MM */
  mes: string;
  status: StatusRateio;
  custoIndiretoMes: number;
  /** Indireto sem obra para receber (mês sem obra com custo). */
  naoRateado: number;
  linhas: LinhaRateio[];
}

export const ROTULO_STATUS_RATEIO: Record<StatusRateio, string> = {
  automatico: "Automático (pelo custo direto)",
  ajustado: "Ajustado (ainda não confirmado)",
  confirmado: "Confirmado",
};

/** "12,5" → 12.5; vazio ou inválido → 0. */
export function lerPercentual(texto: string): number {
  const n = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Diferença da soma para 100, em milionésimos (6 casas, igual ao banco). */
export function faltaPara100(percentuais: readonly number[]): number {
  const soma = percentuais.reduce((s, p) => s + Math.round(p * 1e6), 0);
  return (100 * 1e6 - soma) / 1e6;
}
