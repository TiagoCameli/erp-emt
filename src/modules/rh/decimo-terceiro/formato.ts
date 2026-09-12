import type { StatusPadrao } from "@/components/canonicos";
import type { StatusLote } from "@/modules/rh/decimo-terceiro/schemas";

/**
 * Rótulo e badge de cada status do lote.
 *
 * O badge de "aprovado" usa o verde de status (#15803D), que **não** é o verde
 * da marca (#3E7744): fundir os dois faria o selo ter a cor do botão primário
 * e a cor deixaria de dizer "isto passou pela aprovação".
 */
export const STATUS_LOTE_INFO: Record<
  StatusLote,
  { rotulo: string; badge: StatusPadrao }
> = {
  rascunho: { rotulo: "Rascunho", badge: "rascunho" },
  pendente_aprovacao: {
    rotulo: "Pendente de aprovação",
    badge: "pendente_aprovacao",
  },
  aprovado: { rotulo: "Aprovado", badge: "aprovado" },
  rejeitado: { rotulo: "Rejeitado", badge: "rejeitado" },
};

/** "1ª parcela", "2ª parcela". */
export function rotuloParcela(parcela: number): string {
  return `${parcela}ª parcela`;
}

/** "13º 2026, 1ª parcela". */
export function rotuloLote(ano: number, parcela: number): string {
  return `13º ${ano}, ${rotuloParcela(parcela)}`;
}

/**
 * A fração do banco (0,5) vira o percentual da tela ("50%").
 *
 * Sem casas quando é inteiro, com até duas quando não é: "50%" e "33,33%".
 */
export function formatarPercentual(fracao: number): string {
  const pontos = fracao * 100;
  const casas = Number.isInteger(pontos) ? 0 : 2;
  return `${pontos.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: 2,
  })}%`;
}
