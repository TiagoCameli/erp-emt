/** Status possíveis de um orçamento. Igual ao default/check do banco. */
export const STATUS_ORCAMENTO = ["rascunho", "ativo", "arquivado"] as const;

export type StatusOrcamento = (typeof STATUS_ORCAMENTO)[number];

/** Rótulo e cor de cada status, para o StatusBadge custom da tabela. */
export const STATUS_ORCAMENTO_CONFIG: Record<
  StatusOrcamento,
  { rotulo: string; classes: string }
> = {
  rascunho: {
    rotulo: "Rascunho",
    classes: "bg-status-rascunho/10 text-status-rascunho",
  },
  ativo: {
    rotulo: "Ativo",
    classes: "bg-status-aprovado/10 text-status-aprovado",
  },
  arquivado: {
    rotulo: "Arquivado",
    classes: "bg-status-rascunho/10 text-status-rascunho",
  },
};

/** Tipos de linha da árvore de itens de orçamento. */
export const TIPO_ITEM_ORCAMENTO = ["etapa", "subetapa", "item"] as const;

export type TipoItemOrcamento = (typeof TIPO_ITEM_ORCAMENTO)[number];
