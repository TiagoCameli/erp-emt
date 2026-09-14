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

/** Rótulo pt-BR do vínculo, para a coluna que a folha gerencial também tem. */
export const ROTULO_VINCULO: Record<string, string> = {
  clt: "CLT",
  terceiro: "Terceiro",
  diarista: "Diarista",
};

/**
 * Vínculo por extenso, com fallback para o valor cru.
 *
 * O 13º paga os três vínculos desde 14/09/2026: quem não tem carteira recebe
 * também, e a coluna existe para quem monta o lote saber com quem está lidando
 * na hora de digitar o valor.
 */
export function rotuloVinculo(vinculo: string): string {
  return ROTULO_VINCULO[vinculo] ?? vinculo;
}
