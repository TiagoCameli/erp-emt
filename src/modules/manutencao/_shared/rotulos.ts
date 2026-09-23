/**
 * Domínios da Manutenção, espelhando os CHECKs de 20260923100000_fase2_manutencao_banco.sql.
 * Módulo puro (sem "use client" e sem server-only): serve tela, schema e action.
 */

export const STATUS_OS = ["aberta", "em_execucao", "concluida", "cancelada"] as const;
export type StatusOs = (typeof STATUS_OS)[number];

export const ROTULO_STATUS_OS: Record<StatusOs, string> = {
  aberta: "Aberta",
  em_execucao: "Em execução",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

/**
 * Cor do StatusBadge canônico para cada status da OS. Concluída é "executado" (cor de efeito,
 * regra 8), não "aprovado": a OS não passa por aprovação. O rótulo vai sempre por ROTULO_STATUS_OS.
 */
export const BADGE_STATUS_OS: Record<StatusOs, "rascunho" | "pendente_aprovacao" | "executado" | "cancelado"> = {
  aberta: "rascunho",
  em_execucao: "pendente_aprovacao",
  concluida: "executado",
  cancelada: "cancelado",
};

export const TIPOS_OS = [
  "corretiva",
  "preventiva",
  "preditiva",
  "troca_oleo",
  "lubrificacao",
  "pneu",
  "solda",
  "eletrica",
  "revisao_geral",
  "melhoria",
  "garantia",
  "recall",
  "outro",
] as const;
export type TipoOs = (typeof TIPOS_OS)[number];

export const ROTULO_TIPO_OS: Record<TipoOs, string> = {
  corretiva: "Corretiva",
  preventiva: "Preventiva",
  preditiva: "Preditiva",
  troca_oleo: "Troca de óleo",
  lubrificacao: "Lubrificação",
  pneu: "Pneu",
  solda: "Solda",
  eletrica: "Elétrica",
  revisao_geral: "Revisão geral",
  melhoria: "Melhoria",
  garantia: "Garantia",
  recall: "Recall",
  outro: "Outro",
};

export const PRIORIDADES_OS = ["baixa", "media", "alta", "critica"] as const;
export type PrioridadeOs = (typeof PRIORIDADES_OS)[number];

export const ROTULO_PRIORIDADE_OS: Record<PrioridadeOs, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

export const APLICACOES_OLEO = ["motor", "hidraulico", "transmissao", "diferencial", "graxa", "outro"] as const;
export type AplicacaoOleo = (typeof APLICACOES_OLEO)[number];

export const ROTULO_APLICACAO_OLEO: Record<AplicacaoOleo, string> = {
  motor: "Motor",
  hidraulico: "Hidráulico",
  transmissao: "Transmissão",
  diferencial: "Diferencial",
  graxa: "Graxa",
  outro: "Outro",
};

export const UNIDADES_OLEO = ["L", "kg"] as const;
export type UnidadeOleo = (typeof UNIDADES_OLEO)[number];

/** OS nesses status aceitam linha nova e edição do cabeçalho (regra do banco). */
export function osEditavel(status: StatusOs): boolean {
  return status === "aberta" || status === "em_execucao";
}
