import { isoParaDataHoraLocal } from "@/modules/combustivel/_shared/rotulos";

/**
 * Período em DIAS de Rio Branco, para as telas e relatórios do Combustível.
 *
 * A coluna é `timestamptz` e o filtro pensa em dia local: o dia 23/09 em Rio
 * Branco vai de 23/09 00:00 -05:00 até 24/09 00:00 -05:00 (exclusivo). Rio
 * Branco não tem horário de verão, então o deslocamento é fixo.
 *
 * Módulo puro: serve página, query e teste.
 */

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MES = /^(\d{4})-(\d{2})$/;

/** "2026-09-23" válido (31/02 não passa) ou null. */
export function diaValido(valor: string | null | undefined): string | null {
  const texto = (valor ?? "").trim();
  const m = DIA.exec(texto);
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  return texto;
}

/** "2026-09" válido ou null. */
export function mesValido(valor: string | null | undefined): string | null {
  const texto = (valor ?? "").trim();
  const m = MES.exec(texto);
  if (!m) return null;
  const mes = Number(m[2]);
  return mes >= 1 && mes <= 12 ? texto : null;
}

/** Soma dias a um "yyyy-MM-dd", com aritmética de calendário (UTC puro). */
export function somarDias(dia: string, dias: number): string {
  const [ano, mes, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, d + dias)).toISOString().slice(0, 10);
}

/** Primeiro instante do dia em Rio Branco, como ISO com fuso. */
export function inicioDoDia(dia: string): string {
  return `${dia}T00:00:00-05:00`;
}

/** Primeiro instante do dia SEGUINTE: o fim exclusivo do período. */
export function fimExclusivoDoDia(dia: string): string {
  return inicioDoDia(somarDias(dia, 1));
}

/** Instante (ISO) -> "yyyy-MM-dd" em Rio Branco. */
export function diaEmRioBranco(iso: string): string {
  return isoParaDataHoraLocal(iso).slice(0, 10);
}

/** Instante (ISO) -> "yyyy-MM" em Rio Branco. */
export function mesEmRioBranco(iso: string): string {
  return isoParaDataHoraLocal(iso).slice(0, 7);
}

/** "2026-09" -> primeiro e último dia do mês. */
export function diasDoMes(mes: string): { de: string; ate: string } {
  const [ano, numero] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(ano, numero, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

export interface Periodo {
  de: string;
  ate: string;
}

/**
 * Período vindo da URL. Ponta inválida cai no padrão; período invertido troca
 * de lado (senão a lista volta vazia sem dizer por quê).
 */
export function periodoDaUrl(
  de: string | string[] | undefined,
  ate: string | string[] | undefined,
  padrao: Periodo,
): Periodo {
  const primeiro = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor);
  let inicio = diaValido(primeiro(de)) ?? padrao.de;
  let fim = diaValido(primeiro(ate)) ?? padrao.ate;
  if (inicio > fim) [inicio, fim] = [fim, inicio];
  return { de: inicio, ate: fim };
}

/** Os últimos `dias` dias até hoje, inclusive (90 dias = hoje e os 89 anteriores). */
export function ultimosDias(hoje: string, dias: number): Periodo {
  return { de: somarDias(hoje, -(dias - 1)), ate: hoje };
}
