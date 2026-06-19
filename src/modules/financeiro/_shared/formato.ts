import type { StatusPadrao } from "@/components/canonicos";

/**
 * Mapas de formatação do módulo Financeiro.
 *
 * Fonte de verdade para rótulos pt-BR e para o `badge` (StatusPadrao) que
 * cada status de domínio usa no StatusBadge canônico. Como os status do
 * financeiro não batem 1:1 com a status machine padrão do ERP, este arquivo
 * traduz cada um para o StatusPadrao mais próximo, preservando a cor certa:
 * neutro para previsto, âmbar para pendente, verde para aprovado, efeito
 * para pago e vermelho para cancelado.
 *
 * Sem 'use server': é só dado, importável por Server e Client Components.
 */

/** Status de um lançamento financeiro. */
export type StatusLancamento =
  | "previsto"
  | "a_pagar"
  | "aprovado"
  | "pago"
  | "cancelado";

/** Status de uma parcela de lançamento. */
export type StatusParcela = "pendente" | "aprovado" | "pago" | "cancelado";

/** Banco de uma conta bancária. */
export type BancoConta = "caixa" | "bb" | "sicredi" | "outro";

/** Tipo de um lançamento financeiro. */
export type TipoLancamento = "a_pagar" | "a_receber";

/** Rótulo pt-BR + badge canônico para exibição de um status. */
export interface FormatoStatus {
  rotulo: string;
  badge: StatusPadrao;
}

export const STATUS_LANCAMENTO: Record<StatusLancamento, FormatoStatus> = {
  previsto: { rotulo: "Previsto", badge: "rascunho" },
  a_pagar: { rotulo: "A pagar", badge: "pendente_aprovacao" },
  aprovado: { rotulo: "Aprovado", badge: "aprovado" },
  pago: { rotulo: "Pago", badge: "pago" },
  cancelado: { rotulo: "Cancelado", badge: "cancelado" },
};

export const STATUS_PARCELA: Record<StatusParcela, FormatoStatus> = {
  pendente: { rotulo: "Pendente", badge: "pendente_aprovacao" },
  aprovado: { rotulo: "Aprovado", badge: "aprovado" },
  pago: { rotulo: "Pago", badge: "pago" },
  cancelado: { rotulo: "Cancelado", badge: "cancelado" },
};

export const ROTULO_BANCO: Record<BancoConta, string> = {
  caixa: "Caixa",
  bb: "Banco do Brasil",
  sicredi: "Sicredi",
  outro: "Outro",
};

export const ROTULO_TIPO_LANCAMENTO: Record<TipoLancamento, string> = {
  a_pagar: "A pagar",
  a_receber: "A receber",
};
