import { z } from "zod";

/**
 * Status de ordem de compra, igual ao check do banco. O status custom
 * (recebido_parcial, recebido) sai das RPCs de recebimento; o app só transita
 * rascunho > pendente_aprovacao > aprovado/rejeitado e cancelado.
 */
export const STATUS_OC = [
  "rascunho",
  "pendente_aprovacao",
  "aprovado",
  "rejeitado",
  "cancelado",
  "recebido_parcial",
  "recebido",
] as const;

export type StatusOcSchema = (typeof STATUS_OC)[number];

/** Quantidade NUMERIC(14,3): positiva, no máximo 3 casas. */
const quantidadeSchema = z
  .number({ error: "Quantidade inválida" })
  .positive({ error: "A quantidade precisa ser maior que zero" })
  .max(99999999999.999, { error: "Quantidade acima do permitido" });

/** Preço unitário NUMERIC(14,2): não negativo, no máximo 2 casas. */
const precoSchema = z
  .number({ error: "Preço inválido" })
  .min(0, { error: "O preço não pode ser negativo" })
  .max(999999999999.99, { error: "Preço acima do permitido" });

/** Texto opcional: vazio vira undefined para não gravar string em branco. */
function textoOpcional(maximo: number) {
  return z
    .string()
    .trim()
    .max(maximo, { error: `Máximo de ${maximo} caracteres` })
    .optional()
    .transform((valor) => (valor === "" ? undefined : valor));
}

/** Item da OC validado no servidor: tipos já coeridos. */
export const ocItemSchema = z.object({
  insumoId: z.uuid({ error: "Insumo inválido" }),
  quantidade: quantidadeSchema,
  precoUnitario: precoSchema,
  centroCustoId: z.uuid({ error: "Centro de custo inválido" }),
});

export type OcItemInput = z.infer<typeof ocItemSchema>;

/** Schema da OC validado no servidor (criar e editar). */
export const ordemCompraSchema = z.object({
  fornecedorId: z.uuid({ error: "Fornecedor inválido" }),
  condicaoPagamento: textoOpcional(120),
  cotacaoId: z.uuid({ error: "Cotação inválida" }).optional(),
  dataEmissao: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data de emissão inválida" }),
  observacoes: textoOpcional(2000),
  itens: z
    .array(ocItemSchema)
    .min(1, { error: "Adicione ao menos um item à ordem de compra" }),
});

export type OrdemCompraInput = z.infer<typeof ordemCompraSchema>;

/**
 * Schema do item no formulário (client). Quantidade e preço continuam como
 * string para casar input e output do react-hook-form; a coerção real
 * acontece no submit antes de chamar a action.
 */
export const ocItemFormSchema = z.object({
  insumoId: z.uuid({ error: "Selecione o insumo" }),
  quantidade: z
    .string()
    .trim()
    .refine(
      (valor) => {
        const numero = Number(valor.replace(",", "."));
        return valor !== "" && !Number.isNaN(numero) && numero > 0;
      },
      { error: "Informe uma quantidade maior que zero" },
    ),
  precoUnitario: z
    .string()
    .trim()
    .refine(
      (valor) => {
        const numero = Number(valor.replace(",", "."));
        return valor !== "" && !Number.isNaN(numero) && numero >= 0;
      },
      { error: "Informe um preço válido" },
    ),
  centroCustoId: z.uuid({ error: "Selecione o centro de custo" }),
});

export type OcItemFormInput = z.infer<typeof ocItemFormSchema>;

/** Schema do formulário da OC (client). */
export const ordemCompraFormSchema = z.object({
  fornecedorId: z.uuid({ error: "Selecione o fornecedor" }),
  condicaoPagamento: z
    .string()
    .trim()
    .max(120, { error: "Máximo de 120 caracteres" }),
  cotacaoId: z.uuid().optional(),
  dataEmissao: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe a data de emissão" }),
  observacoes: z
    .string()
    .trim()
    .max(2000, { error: "Máximo de 2000 caracteres" }),
  itens: z
    .array(ocItemFormSchema)
    .min(1, { error: "Adicione ao menos um item à ordem de compra" }),
});

export type OrdemCompraFormInput = z.infer<typeof ordemCompraFormSchema>;
