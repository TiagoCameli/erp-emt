import type { StatusPadrao } from "@/components/canonicos";

/**
 * Rótulos e cor de badge dos status de Compras. Helpers puros, sem 'use server',
 * compartilhados pelas telas. `badge` é o StatusPadrao que dá a cor do StatusBadge;
 * `rotulo` é o texto pt-BR exibido. Para status custom (aberta, finalizada)
 * escolhemos o StatusPadrao de cor mais próxima e passamos o
 * rótulo certo: <StatusBadge status={info.badge} rotulo={info.rotulo} />.
 */
export interface InfoStatus {
  rotulo: string;
  badge: StatusPadrao;
}

/** Status de cotação: aberta | finalizada | cancelada. */
export const ROTULO_STATUS_COTACAO = {
  aberta: { rotulo: "Aberta", badge: "pendente_aprovacao" },
  finalizada: { rotulo: "Finalizada", badge: "aprovado" },
  cancelada: { rotulo: "Cancelada", badge: "cancelado" },
} as const satisfies Record<string, InfoStatus>;

export type StatusCotacao = keyof typeof ROTULO_STATUS_COTACAO;

/** Status de ordem de compra: rascunho | pendente_aprovacao | aprovado | rejeitado | cancelado | recebido | pago. */
export const ROTULO_STATUS_OC = {
  rascunho: { rotulo: "Rascunho", badge: "rascunho" },
  pendente_aprovacao: { rotulo: "Pendente de aprovação", badge: "pendente_aprovacao" },
  aprovado: { rotulo: "Aprovada", badge: "aprovado" },
  rejeitado: { rotulo: "Rejeitada", badge: "rejeitado" },
  cancelado: { rotulo: "Cancelada", badge: "cancelado" },
  recebido: { rotulo: "Recebida", badge: "recebido" },
  // Bug #5 (QA): fecha o ciclo quando o lançamento da OC quita todas as parcelas.
  pago: { rotulo: "Paga", badge: "pago" },
} as const satisfies Record<string, InfoStatus>;

export type StatusOC = keyof typeof ROTULO_STATUS_OC;

/** Info de status com fallback neutro se vier um status desconhecido do banco. */
function infoComFallback(
  mapa: Record<string, InfoStatus>,
  status: string,
): InfoStatus {
  return mapa[status] ?? { rotulo: status, badge: "rascunho" };
}

export function infoStatusCotacao(status: string): InfoStatus {
  return infoComFallback(ROTULO_STATUS_COTACAO, status);
}

export function infoStatusOC(status: string): InfoStatus {
  return infoComFallback(ROTULO_STATUS_OC, status);
}

const KILO = 1024;
const MEGA = KILO * KILO;

/** Tamanho de arquivo legível: B, KB ou MB com vírgula decimal pt-BR. */
export function formatarTamanhoArquivo(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes) || bytes < 0) {
    return "";
  }
  if (bytes < KILO) return `${bytes} B`;
  if (bytes < MEGA) {
    return `${(bytes / KILO).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB`;
  }
  return `${(bytes / MEGA).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}
