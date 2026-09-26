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

export const REGRAS_ARREDONDAMENTO = ["item_por_medicao", "item_por_acumulado", "sem_arredondar"] as const;
export type RegraArredondamento = (typeof REGRAS_ARREDONDAMENTO)[number];
export const ROTULO_REGRA: Record<RegraArredondamento, string> = {
  item_por_medicao: "Por item, em cada medição",
  item_por_acumulado: "Por item, no acumulado",
  sem_arredondar: "Sem arredondar, só no total",
};

export const TIPOS_ADITIVO = ["quantidade", "valor", "prazo", "inclusao_item"] as const;
export type TipoAditivo = (typeof TIPOS_ADITIVO)[number];
export const ROTULO_TIPO_ADITIVO: Record<TipoAditivo, string> = {
  quantidade: "Quantidade", valor: "Valor", prazo: "Prazo", inclusao_item: "Inclusão de item",
};

export const ROTULO_STATUS_VERSAO = { rascunho: "Rascunho", vigente: "Vigente" } as const;
