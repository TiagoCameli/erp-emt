/**
 * Rótulos e enums compartilhados da Medição de Contratos (spec 2026-09-25).
 * Espelham os `check` do banco: o valor sai da tela igual ao que a coluna aceita.
 */

export const TIPOS_CONTRATANTE = ["federal", "estadual", "municipal", "privado"] as const;
export type TipoContratante = (typeof TIPOS_CONTRATANTE)[number];
export const ROTULO_TIPO_CONTRATANTE: Record<TipoContratante, string> = {
  federal: "Federal", estadual: "Estadual", municipal: "Municipal", privado: "Privado",
};

export const STATUS_CONTRATO = ["ativo", "paralisado", "encerrado"] as const;
export type StatusContrato = (typeof STATUS_CONTRATO)[number];
export const ROTULO_STATUS_CONTRATO: Record<StatusContrato, string> = {
  ativo: "Ativo", paralisado: "Paralisado", encerrado: "Encerrado",
};

export const REGRAS_ARREDONDAMENTO = ["item_por_medicao", "item_por_acumulado", "sem_arredondar", "item_truncado"] as const;
export type RegraArredondamento = (typeof REGRAS_ARREDONDAMENTO)[number];
export const ROTULO_REGRA: Record<RegraArredondamento, string> = {
  item_por_medicao: "Por item, em cada medição",
  item_por_acumulado: "Por item, no acumulado",
  sem_arredondar: "Sem arredondar, só no total",
  item_truncado: "Truncado por item, em cada medição",
};

export const TIPOS_ADITIVO = ["quantidade", "valor", "prazo", "inclusao_item"] as const;
export type TipoAditivo = (typeof TIPOS_ADITIVO)[number];
export const ROTULO_TIPO_ADITIVO: Record<TipoAditivo, string> = {
  quantidade: "Quantidade", valor: "Valor", prazo: "Prazo", inclusao_item: "Inclusão de item",
};

export const ROTULO_STATUS_VERSAO = { rascunho: "Rascunho", vigente: "Vigente" } as const;

export const STATUS_MEDICAO = ["aberta", "em_conferencia", "enviada", "aprovada"] as const;
export type StatusMedicao = (typeof STATUS_MEDICAO)[number];
export const ROTULO_STATUS_MEDICAO: Record<StatusMedicao, string> = {
  aberta: "Aberta", em_conferencia: "Em conferência", enviada: "Enviada", aprovada: "Aprovada",
};

export const STATUS_REVISAO = ["em_aberto", "enviada", "aprovada", "substituida"] as const;
export type StatusRevisao = (typeof STATUS_REVISAO)[number];
export const ROTULO_STATUS_REVISAO: Record<StatusRevisao, string> = {
  em_aberto: "Em aberto", enviada: "Enviada", aprovada: "Aprovada", substituida: "Substituída",
};

export const FASES_REVISAO = ["antes_aprovacao", "pos_aprovacao"] as const;
export type FaseRevisao = (typeof FASES_REVISAO)[number];
export const ROTULO_FASE_REVISAO: Record<FaseRevisao, string> = {
  antes_aprovacao: "Antes da aprovação", pos_aprovacao: "Pós-aprovação",
};

/** "REV00", "REV01"...: o mesmo `lpad(numero, 2, '0')` das mensagens do banco. */
export function rotuloRevisao(numero: number): string {
  return `REV${String(numero).padStart(2, "0")}`;
}

/** Rótulo de um status de revisão vindo do banco; valor desconhecido volta como veio. */
export function rotuloStatusRevisao(status: string): string {
  return status in ROTULO_STATUS_REVISAO ? ROTULO_STATUS_REVISAO[status as StatusRevisao] : status;
}

/** Rótulo de um status de medição vindo do banco; valor desconhecido volta como veio. */
export function rotuloStatusMedicao(status: string): string {
  return status in ROTULO_STATUS_MEDICAO ? ROTULO_STATUS_MEDICAO[status as StatusMedicao] : status;
}
