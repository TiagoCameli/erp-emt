import type { StatusPadrao } from "@/components/canonicos";

/**
 * Mapas de formatação do módulo Estoque e Combustível.
 *
 * Fonte de verdade dos rótulos pt-BR e do badge (StatusPadrao) de cada tipo
 * de movimento e de cada origem. Sem 'use server': é só dado, importável por
 * Server e Client Components.
 */

/** Tipo de um movimento de estoque. */
export type TipoMovimento =
  | "entrada"
  | "saida"
  | "consumo"
  | "transferencia"
  | "ajuste_positivo"
  | "ajuste_negativo";

/** Origem de um movimento de estoque. */
export type OrigemMovimento =
  | "recebimento"
  | "manual"
  | "transferencia"
  | "inventario"
  | "abastecimento"
  | "os";

/** Rótulo pt-BR + badge canônico para exibição de um tipo de movimento. */
export interface FormatoMovimento {
  rotulo: string;
  badge: StatusPadrao;
}

/**
 * Tipos que aumentam o saldo (entrada de valor) ficam em verde; os que
 * diminuem ficam em âmbar/neutro. Ajuste negativo segue como cancelado
 * (vermelho) por ser perda de inventário.
 */
export const TIPO_MOVIMENTO: Record<TipoMovimento, FormatoMovimento> = {
  entrada: { rotulo: "Entrada", badge: "aprovado" },
  saida: { rotulo: "Saída", badge: "pendente_aprovacao" },
  consumo: { rotulo: "Consumo", badge: "pendente_aprovacao" },
  transferencia: { rotulo: "Transferência", badge: "rascunho" },
  ajuste_positivo: { rotulo: "Ajuste (+)", badge: "aprovado" },
  ajuste_negativo: { rotulo: "Ajuste (-)", badge: "cancelado" },
};

export const ROTULO_ORIGEM: Record<OrigemMovimento, string> = {
  recebimento: "Recebimento",
  manual: "Manual",
  transferencia: "Transferência",
  inventario: "Inventário",
  abastecimento: "Abastecimento",
  os: "Ordem de serviço",
};

/** Rótulo da origem de forma segura mesmo se vier um valor inesperado. */
export function rotuloOrigem(origem: string): string {
  return ROTULO_ORIGEM[origem as OrigemMovimento] ?? origem;
}
