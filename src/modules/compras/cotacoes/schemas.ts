import { z } from "zod";

/** Status possíveis de uma cotação. Igual ao check do banco. */
export const STATUS_COTACAO = ["aberta", "finalizada", "cancelada"] as const;

export type StatusCotacao = (typeof STATUS_COTACAO)[number];

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
 * Cabeçalho da cotação: sempre avulsa. Só observações são editáveis no
 * cabeçalho.
 */
export const cotacaoSchema = z.object({
  observacoes: textoOpcional(2000),
});

export type CotacaoInput = z.infer<typeof cotacaoSchema>;

/** Schema do formulário do cabeçalho (client). */
export const cotacaoFormSchema = z.object({
  observacoes: z
    .string()
    .trim()
    .max(2000, { error: "Máximo de 2000 caracteres" }),
});

export type CotacaoFormInput = z.infer<typeof cotacaoFormSchema>;

/** Dados de um fornecedor que entra na cotação. */
export const fornecedorCotacaoSchema = z.object({
  fornecedorId: z.uuid({ error: "Selecione um fornecedor" }),
  condicaoPagamento: textoOpcional(120),
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
  fornecedorId: z.uuid({ error: "Selecione um fornecedor" }),
  condicaoPagamento: z
    .string()
    .trim()
    .max(120, { error: "Máximo de 120 caracteres" }),
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
  cotacaoFornecedorId: z.uuid({ error: "Fornecedor da cotação inválido" }),
  insumoId: z.uuid({ error: "Insumo inválido" }),
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
  vencedorFornecedorId: z.uuid({ error: "Selecione o fornecedor vencedor" }),
  motivoSelecao: textoOpcional(1000),
});

export type FinalizarCotacaoInput = z.infer<typeof finalizarCotacaoSchema>;
