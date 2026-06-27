import { z } from "zod";

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

// ---------------------------------------------------------------------------
// Cálculo (espelha as triggers do banco, para o preview ao vivo no formulário)
// ---------------------------------------------------------------------------

/** Arredonda para `casas` casas decimais, evitando sobra de ponto flutuante. */
function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * fator) / fator;
}

/**
 * Totais derivados de um item folha, no modo "preço = custo × (1 + BDI)".
 * Igual ao que a trigger `fn_orcamento_item_calc` grava no banco; aqui só serve
 * pro preview enquanto o usuário digita.
 */
export function calcularTotaisItem(entrada: {
  quantidade?: number | null;
  custoUnitario?: number | null;
  bdi?: number | null;
}): {
  precoUnitario: number;
  custoTotal: number;
  precoTotal: number;
} {
  const quantidade = entrada.quantidade ?? 0;
  const custoUnitario = entrada.custoUnitario ?? 0;
  const bdi = entrada.bdi ?? 0;
  const precoUnitario = arredondar(custoUnitario * (1 + bdi / 100), 4);
  return {
    precoUnitario,
    custoTotal: arredondar(quantidade * custoUnitario, 2),
    precoTotal: arredondar(quantidade * precoUnitario, 2),
  };
}

// ---------------------------------------------------------------------------
// Schemas de criação/edição de itens da árvore
// ---------------------------------------------------------------------------

const uuidSchema = z.uuid({ error: "Registro inválido" });

const descricaoSchema = z
  .string()
  .trim()
  .min(2, { error: "A descrição precisa ter pelo menos 2 caracteres" })
  .max(300, { error: "A descrição pode ter no máximo 300 caracteres" });

const textoCurtoSchema = z
  .string()
  .trim()
  .max(40, { error: "Use no máximo 40 caracteres" })
  .optional();

const unidadeSchema = z
  .string()
  .trim()
  .max(20, { error: "Use no máximo 20 caracteres" })
  .optional();

const quantidadeSchema = z
  .number({ error: "Informe um número" })
  .nonnegative({ error: "A quantidade não pode ser negativa" })
  .max(9_999_999_999.9999, { error: "Quantidade alta demais" })
  .optional();

const custoSchema = z
  .number({ error: "Informe um número" })
  .nonnegative({ error: "O custo não pode ser negativo" })
  .max(9_999_999_999.9999, { error: "Custo alto demais" })
  .optional();

const bdiSchema = z
  .number({ error: "Informe um número" })
  .min(0, { error: "O BDI não pode ser negativo" })
  .max(999, { error: "BDI alto demais" })
  .optional();

/**
 * Criar um grupo (etapa ou subetapa). Etapa só na raiz (sem pai); subetapa
 * sempre sob um pai. Totais vêm da soma dos filhos, então não tem valor aqui.
 */
export const criarGrupoSchema = z.object({
  orcamentoId: uuidSchema,
  parentId: uuidSchema.nullable(),
  tipo: z.enum(["etapa", "subetapa"], { error: "Tipo inválido" }),
  descricao: descricaoSchema,
  indice: textoCurtoSchema,
  codigo: textoCurtoSchema,
});

export type CriarGrupoInput = z.infer<typeof criarGrupoSchema>;

/** Criar um item folha sob um pai. Aceita quantidade, custo unitário e BDI. */
export const criarItemSchema = z.object({
  orcamentoId: uuidSchema,
  parentId: uuidSchema,
  descricao: descricaoSchema,
  unidade: unidadeSchema,
  quantidade: quantidadeSchema,
  custoUnitario: custoSchema,
  bdi: bdiSchema,
  indice: textoCurtoSchema,
  codigo: textoCurtoSchema,
});

export type CriarItemInput = z.infer<typeof criarItemSchema>;

/** Editar um grupo: só descrição, índice e código (totais são soma). */
export const editarGrupoSchema = z.object({
  descricao: descricaoSchema,
  indice: textoCurtoSchema,
  codigo: textoCurtoSchema,
});

export type EditarGrupoInput = z.infer<typeof editarGrupoSchema>;

/** Editar um item folha: descrição + os campos que entram no cálculo. */
export const editarItemSchema = z.object({
  descricao: descricaoSchema,
  unidade: unidadeSchema,
  quantidade: quantidadeSchema,
  custoUnitario: custoSchema,
  bdi: bdiSchema,
  indice: textoCurtoSchema,
  codigo: textoCurtoSchema,
});

export type EditarItemInput = z.infer<typeof editarItemSchema>;
