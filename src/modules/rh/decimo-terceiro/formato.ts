import type { StatusPadrao } from "@/components/canonicos";
import {
  ROTULO_VINCULO,
  type Vinculo,
} from "@/modules/cadastros/colaboradores/schemas";
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
 * Vínculo por extenso, com fallback para o valor cru.
 *
 * O mapa vem de `cadastros/colaboradores`, que é o dono do cadastro. Eu tinha
 * escrito uma cópia aqui em 14/09/2026 e ela durou um dia: duas listas de
 * rótulo para a mesma coluna divergem no dia em que alguém acrescenta um
 * vínculo.
 *
 * O fallback existe porque `vinculo` chega das queries como `string` solto, e
 * não como o union: valor fora do catálogo mostra algo em vez de quebrar.
 */
export function rotuloVinculo(vinculo: string): string {
  return vinculo in ROTULO_VINCULO
    ? ROTULO_VINCULO[vinculo as Vinculo]
    : vinculo;
}
