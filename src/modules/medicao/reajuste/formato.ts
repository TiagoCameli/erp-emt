import { comparar, lerDecimal } from "@/modules/medicao/_shared/decimal";
import { dinheiroTexto } from "@/modules/medicao/alertas/formato";

import type { SituacaoFiltroReajuste } from "./tipos";

/**
 * Textos do reajuste (Fase 6). Dinheiro vem do banco como texto e só é formatado (BigInt, sem
 * Number, D7). Datas "aaaa-mm-dd" viram texto sem passar por Date (sem deslocamento de fuso).
 */

const ROTULO_SITUACAO: Record<string, string> = { provisorio: "Provisório", definitivo: "Definitivo" };
const ROTULO_ORIGEM: Record<string, string> = { siac: "SIAC", manual: "Manual" };

export function rotuloSituacaoReajuste(situacao: string): string {
  return ROTULO_SITUACAO[situacao] ?? situacao;
}

export function rotuloOrigemReajuste(origem: string): string {
  return ROTULO_ORIGEM[origem] ?? origem;
}

/** Filtro de situação da aba Reajuste (`?situacao=`), na ordem da tela. */
export const ROTULO_FILTRO_SITUACAO_REAJUSTE: Record<SituacaoFiltroReajuste, string> = {
  sem_relatorio: "Sem relatório",
  provisorio: "Provisório",
  definitivo: "Definitivo",
};

/** `?situacao=` válido, ou undefined (inclusive chave herdada do protótipo, como "toString"). */
export function situacaoFiltroReajuste(valor: string): SituacaoFiltroReajuste | undefined {
  return Object.prototype.hasOwnProperty.call(ROTULO_FILTRO_SITUACAO_REAJUSTE, valor) ? (valor as SituacaoFiltroReajuste) : undefined;
}

/**
 * Em qual opção do filtro de situação a linha da aba cai: sem relatório que valha, ou a situação
 * dele. É o predicado do filtro (`listarReajustes`) e a chave da faceta (`facetasReajustes`).
 */
export function situacaoDaLinhaReajuste(linha: { relatorioId: string | null; situacao: string | null }): string {
  return linha.relatorioId === null ? "sem_relatorio" : (linha.situacao ?? "");
}

/** O reajuste entra só em medição enviada ou aprovada (a RPC confere de novo). */
export function medicaoRecebeReajuste(status: string): boolean {
  return status === "enviada" || status === "aprovada";
}

/** Diferença para o relatório anterior: + a receber, - a devolver. */
export function diferencaReajuste(texto: string): { texto: string; sinal: -1 | 0 | 1 } {
  const sinal = comparar(lerDecimal(texto), lerDecimal("0"));
  if (sinal === 0) return { texto: "sem diferença", sinal };
  const valor = dinheiroTexto(texto.trim().replace(/^-/, ""));
  return { texto: `${valor} ${sinal > 0 ? "a receber" : "a devolver"}`, sinal };
}

/** "2025-01-01" -> "01/2025". */
export function mesAno(iso: string | null | undefined): string {
  const m = iso ? /^(\d{4})-(\d{2})/.exec(iso) : null;
  return m ? `${m[2]}/${m[1]}` : "";
}

/** Mês do aniversário: data-base + periodicidade ("2025-01-01" + 12 = "01/2026"). */
export function aniversario(dataBase: string | null | undefined, periodicidadeMeses: number): string {
  const m = dataBase ? /^(\d{4})-(\d{2})/.exec(dataBase) : null;
  if (!m) return "";
  const total = Number.parseInt(m[1], 10) * 12 + (Number.parseInt(m[2], 10) - 1) + periodicidadeMeses;
  return `${String((total % 12) + 1).padStart(2, "0")}/${Math.floor(total / 12)}`;
}
