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

/**
 * Status de uma parcela de lançamento. `em_revisao` não cancela nada: a parcela
 * sai da fila de aprovação e volta para quem lançou ajustar, e o lançamento
 * continua vivo e contando na previsão de caixa.
 */
export type StatusParcela =
  | "pendente"
  | "em_revisao"
  | "aprovado"
  | "pago"
  | "cancelado";

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
  // Âmbar (atenção), não vermelho: revisão é pedido de ajuste, não recusa.
  em_revisao: { rotulo: "Em revisão", badge: "pendente_aprovacao" },
  aprovado: { rotulo: "Aprovado", badge: "aprovado" },
  pago: { rotulo: "Pago", badge: "pago" },
  cancelado: { rotulo: "Cancelado", badge: "cancelado" },
};

/**
 * Status de parcela que contam como EM ABERTO: dívida viva.
 *
 * Derivado da lista completa menos `pago` e `cancelado`, e não digitado à mão, por
 * dois motivos. Primeiro, a regra verdadeira é a negativa ("não pago e não
 * cancelado"): `em_revisao` é pedido de ajuste, não baixa, e continua devendo.
 * Segundo, status novo em `STATUS_PARCELA` entra aqui sozinho, então o resumo do
 * cabeçalho e o filtro de atraso não podem passar a discordar por esquecimento.
 *
 * Existe como lista (e não só como função) porque o filtro precisa mandar os
 * valores para o banco num `in`, e negação no PostgREST é mais fácil de escrever
 * errado do que uma lista explícita.
 */
export const STATUS_PARCELA_ABERTA: StatusParcela[] = (
  Object.keys(STATUS_PARCELA) as StatusParcela[]
).filter((status) => status !== "pago" && status !== "cancelado");

/** A parcela é dívida viva? Mesma regra do `STATUS_PARCELA_ABERTA`. */
export function ehParcelaAberta(status: string): boolean {
  return (STATUS_PARCELA_ABERTA as string[]).includes(status);
}

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

/**
 * Rótulo canônico de uma parcela: "LAN-2026-0015 · parcela 1 de 3".
 *
 * Existe para todas as telas dizerem a mesma coisa. Antes, a fila de aprovação
 * mostrava a primeira parcela só como "LAN-2026-0015" e as outras como
 * "parcela 2", "parcela 3": quem batia a lista com o documento ficava sem saber
 * se a primeira linha era a parcela 1 ou o lançamento inteiro.
 *
 * Lançamento de parcela única não ganha sufixo: ali "parcela 1 de 1" é ruído.
 */
export function rotuloParcela(
  numeroDocumento: string | null,
  numeroParcela: number,
  totalParcelas: number,
): string {
  const documento = numeroDocumento ?? "Sem número";
  if (totalParcelas <= 1) return documento;
  return `${documento} · parcela ${numeroParcela} de ${totalParcelas}`;
}
