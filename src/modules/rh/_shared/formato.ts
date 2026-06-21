import type { StatusPadrao } from "@/components/canonicos";

/**
 * Mapas de formatação do módulo RH (espinha). Rótulos pt-BR e badge canônico.
 * Só dado, sem 'use server'.
 */

/** Status do ponto do dia. */
export type StatusPonto = "aberto" | "aprovado";

/** Status da folha gerencial. */
export type StatusFolha = "rascunho" | "fechada";

/** Tipo de apontamento do dia. */
export type TipoApontamento = "normal" | "falta" | "atestado" | "folga";

/** Vínculo do colaborador. */
export type Vinculo = "clt" | "diarista" | "terceiro";

export interface FormatoBadge {
  rotulo: string;
  badge: StatusPadrao;
}

export const STATUS_PONTO: Record<StatusPonto, FormatoBadge> = {
  aberto: { rotulo: "Aberto", badge: "rascunho" },
  aprovado: { rotulo: "Aprovado", badge: "aprovado" },
};

export const STATUS_FOLHA: Record<StatusFolha, FormatoBadge> = {
  rascunho: { rotulo: "Rascunho", badge: "rascunho" },
  fechada: { rotulo: "Fechada", badge: "aprovado" },
};

export const ROTULO_TIPO_APONTAMENTO: Record<TipoApontamento, string> = {
  normal: "Normal",
  falta: "Falta",
  atestado: "Atestado",
  folga: "Folga",
};

export const ROTULO_VINCULO: Record<Vinculo, string> = {
  clt: "CLT",
  diarista: "Diarista",
  terceiro: "Terceiro",
};
