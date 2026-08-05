import { z } from "zod";

import { idSchemaCom } from "@/lib/id";

/** Status possíveis de uma cotação. Igual ao check do banco. */
export const STATUS_COTACAO = ["aberta", "finalizada", "cancelada"] as const;

export type StatusCotacao = (typeof STATUS_COTACAO)[number];

/**
 * Valores do filtro "OC gerada" da listagem: a cotação já virou ordem de compra
 * ou continua sem OC nenhuma. Vive aqui porque a página valida o parâmetro da
 * URL contra esta lista antes de mandar qualquer coisa para o banco.
 */
export const OC_GERADA_COTACAO = ["com", "sem"] as const;

export type OcGeradaCotacao = (typeof OC_GERADA_COTACAO)[number];

/** Valores do filtro de autoria da listagem: minhas cotações ou dos outros. */
export const AUTORIA_COTACAO = ["eu", "outros"] as const;

export type AutoriaCotacao = (typeof AUTORIA_COTACAO)[number];

/** Texto opcional: vazio vira undefined para não gravar string em branco. */
function textoOpcional(maximo: number) {
  return z
    .string()
    .trim()
    .max(maximo, { error: `Máximo de ${maximo} caracteres` })
    .optional()
    .transform((valor) => (valor === undefined || valor === "" ? undefined : valor));
}

/**
 * Cabeçalho da cotação: sempre avulsa. Descrição e categoria do custo são
 * obrigatórias porque a OC gerada da cotação as herda e leva até o lançamento
 * financeiro: sem elas o custo chega no Financeiro sem classificação.
 */
export const cotacaoSchema = z.object({
  descricao: z
    .string()
    .trim()
    .min(3, { error: "Descreva o que está sendo cotado (mínimo 3 caracteres)" })
    .max(500, { error: "Máximo de 500 caracteres" }),
  categoriaId: idSchemaCom("Selecione a categoria do custo"),
  observacoes: textoOpcional(2000),
});

export type CotacaoInput = z.infer<typeof cotacaoSchema>;

/** Schema do formulário do cabeçalho (client). */
export const cotacaoFormSchema = z.object({
  descricao: z
    .string()
    .trim()
    .min(3, { error: "Descreva o que está sendo cotado (mínimo 3 caracteres)" })
    .max(500, { error: "Máximo de 500 caracteres" }),
  categoriaId: idSchemaCom("Selecione a categoria do custo"),
  observacoes: z
    .string()
    .trim()
    .max(2000, { error: "Máximo de 2000 caracteres" }),
});

export type CotacaoFormInput = z.infer<typeof cotacaoFormSchema>;

/** Dados de um fornecedor que entra na cotação. */
export const fornecedorCotacaoSchema = z.object({
  fornecedorId: idSchemaCom("Selecione um fornecedor"),
  condicaoPagamentoId: idSchemaCom("Condição de pagamento inválida").optional(),
  formaPagamentoId: idSchemaCom("Forma de pagamento inválida").optional(),
  prazoEntregaDias: z
    .number({ error: "Prazo inválido" })
    .int({ error: "Prazo em dias inteiros" })
    .min(0, { error: "O prazo não pode ser negativo" })
    .max(3650, { error: "Prazo acima do permitido" })
    .optional(),
  observacao: textoOpcional(500),
});

export type FornecedorCotacaoInput = z.infer<typeof fornecedorCotacaoSchema>;

/** Schema do formulário de fornecedor (client). Campos texto como string. */
export const fornecedorCotacaoFormSchema = z.object({
  fornecedorId: idSchemaCom("Selecione um fornecedor"),
  condicaoPagamentoId: idSchemaCom("Condição de pagamento inválida").optional(),
  formaPagamentoId: idSchemaCom("Forma de pagamento inválida").optional(),
  prazoEntregaDias: z
    .string()
    .trim()
    .refine(
      (valor) =>
        valor === "" ||
        (Number.isInteger(Number(valor)) && Number(valor) >= 0),
      { error: "Informe um número inteiro de dias, ex: 7" },
    ),
  observacao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" }),
});

export type FornecedorCotacaoFormInput = z.infer<
  typeof fornecedorCotacaoFormSchema
>;

/**
 * Um preço lançado: o insumo, a quantidade cotada e o preço unitário de um
 * fornecedor para aquele insumo. A tela salva o mapa inteiro de uma vez.
 */
export const precoCotacaoSchema = z.object({
  cotacaoFornecedorId: idSchemaCom("Fornecedor da cotação inválido"),
  insumoId: idSchemaCom("Insumo inválido"),
  quantidade: z
    .number({ error: "Quantidade inválida" })
    .gt(0, { error: "A quantidade precisa ser maior que zero" })
    .max(99999999999.999, { error: "Quantidade acima do permitido" }),
  precoUnitario: z
    .number({ error: "Preço inválido" })
    .min(0, { error: "O preço não pode ser negativo" })
    .max(999999999999.99, { error: "Preço acima do permitido" }),
});

export type PrecoCotacaoInput = z.infer<typeof precoCotacaoSchema>;

/** Lote de preços salvo de uma vez (delete + insert no servidor). */
export const salvarPrecosSchema = z.array(precoCotacaoSchema);

export type SalvarPrecosInput = z.infer<typeof salvarPrecosSchema>;

/**
 * Finalização da cotação: escolhe o fornecedor vencedor. O motivo da seleção
 * é exigido na action quando o vencedor não for o menor total (decisão de
 * negócio precisa ser justificada).
 */
export const finalizarCotacaoSchema = z.object({
  vencedorFornecedorId: idSchemaCom("Selecione o fornecedor vencedor"),
  motivoSelecao: textoOpcional(1000),
});

export type FinalizarCotacaoInput = z.infer<typeof finalizarCotacaoSchema>;
