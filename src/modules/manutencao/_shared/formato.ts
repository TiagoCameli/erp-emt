import type { StatusPadrao } from "@/components/canonicos";

/**
 * Mapas de formatação do módulo Manutenção. Rótulos pt-BR e badge canônico
 * (StatusPadrao) de cada status, tipo e prioridade. Só dado, sem 'use server'.
 */

/** Status de uma ordem de serviço. */
export type StatusOS = "aberta" | "em_execucao" | "concluida" | "cancelada";

/** Tipo de uma ordem de serviço. */
export type TipoOS = "corretiva" | "preventiva";

/** Prioridade de uma ordem de serviço. */
export type PrioridadeOS = "baixa" | "media" | "alta";

/** Origem de uma ordem de serviço. */
export type OrigemOS = "manual" | "preventiva" | "checklist";

/** Status de uma execução de checklist. */
export type StatusChecklist = "ok" | "com_pendencia";

export interface FormatoBadge {
  rotulo: string;
  badge: StatusPadrao;
}

export const STATUS_OS: Record<StatusOS, FormatoBadge> = {
  aberta: { rotulo: "Aberta", badge: "rascunho" },
  em_execucao: { rotulo: "Em execução", badge: "pendente_aprovacao" },
  concluida: { rotulo: "Concluída", badge: "aprovado" },
  cancelada: { rotulo: "Cancelada", badge: "cancelado" },
};

export const ROTULO_TIPO_OS: Record<TipoOS, string> = {
  corretiva: "Corretiva",
  preventiva: "Preventiva",
};

export const PRIORIDADE_OS: Record<PrioridadeOS, FormatoBadge> = {
  baixa: { rotulo: "Baixa", badge: "rascunho" },
  media: { rotulo: "Média", badge: "pendente_aprovacao" },
  alta: { rotulo: "Alta", badge: "cancelado" },
};

export const ROTULO_ORIGEM_OS: Record<OrigemOS, string> = {
  manual: "Manual",
  preventiva: "Preventiva",
  checklist: "Checklist",
};

export const STATUS_CHECKLIST: Record<StatusChecklist, FormatoBadge> = {
  ok: { rotulo: "OK", badge: "aprovado" },
  com_pendencia: { rotulo: "Com pendência", badge: "cancelado" },
};

/** Status de frota derivado das OS abertas/em execução do equipamento. */
export type StatusFrota = "operando" | "em_manutencao";

export const STATUS_FROTA: Record<StatusFrota, FormatoBadge> = {
  operando: { rotulo: "Operando", badge: "aprovado" },
  em_manutencao: { rotulo: "Em manutenção", badge: "pendente_aprovacao" },
};

/** Rótulo de prioridade seguro mesmo com valor inesperado. */
export function rotuloPrioridade(prioridade: string): string {
  return PRIORIDADE_OS[prioridade as PrioridadeOS]?.rotulo ?? prioridade;
}
