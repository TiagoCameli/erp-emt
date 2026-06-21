import type { StatusPadrao } from "@/components/canonicos";

/**
 * Mapas de formatação do módulo Medição. Rótulos pt-BR e badge canônico de
 * cada status e tipo de reajuste. Só dado, sem 'use server'.
 */

/** Status de uma medição. */
export type StatusMedicao = "rascunho" | "aprovada" | "cancelada";

/** Tipo de reajuste informado no fechamento. */
export type ReajusteTipo = "nenhum" | "percentual" | "valor";

/** Status de uma fatura. */
export type StatusFatura = "aberta" | "cancelada";

export interface FormatoBadge {
  rotulo: string;
  badge: StatusPadrao;
}

export const STATUS_MEDICAO: Record<StatusMedicao, FormatoBadge> = {
  rascunho: { rotulo: "Rascunho", badge: "rascunho" },
  aprovada: { rotulo: "Aprovada", badge: "aprovado" },
  cancelada: { rotulo: "Cancelada", badge: "cancelado" },
};

export const ROTULO_REAJUSTE: Record<ReajusteTipo, string> = {
  nenhum: "Sem reajuste",
  percentual: "Percentual",
  valor: "Valor fixo",
};

export const STATUS_FATURA: Record<StatusFatura, FormatoBadge> = {
  aberta: { rotulo: "Aberta", badge: "aprovado" },
  cancelada: { rotulo: "Cancelada", badge: "cancelado" },
};
