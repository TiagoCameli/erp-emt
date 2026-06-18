import { z } from "zod";

/**
 * Status de um pedido de compra. Igual ao check do banco.
 * Fluxo: rascunho -> pendente_aprovacao -> aprovado | rejeitado, e cancelado.
 */
export const STATUS_PEDIDO = [
  "rascunho",
  "pendente_aprovacao",
  "aprovado",
  "rejeitado",
  "cancelado",
] as const;

export type StatusPedido = (typeof STATUS_PEDIDO)[number];

const QTD_MAXIMA = 99999999999.999;

/**
 * Item do pedido no servidor: quantidade já como número, vínculos validados.
 * deposito_id e observacao são opcionais.
 */
export const pedidoItemSchema = z.object({
  insumoId: z.uuid({ error: "Insumo inválido" }),
  quantidade: z
    .number({ error: "Quantidade inválida" })
    .positive({ error: "A quantidade precisa ser maior que zero" })
    .max(QTD_MAXIMA, { error: "Quantidade acima do permitido" }),
  centroCustoId: z.uuid({ error: "Centro de custo inválido" }),
  depositoId: z.uuid({ error: "Depósito inválido" }).optional(),
  observacao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" })
    .optional()
    .transform((valor) => (valor === "" ? undefined : valor)),
});

export type PedidoItemInput = z.infer<typeof pedidoItemSchema>;

/** Schema do pedido no servidor: justificativa opcional, itens com pelo menos um. */
export const pedidoSchema = z.object({
  justificativa: z
    .string()
    .trim()
    .max(2000, { error: "Máximo de 2000 caracteres" })
    .optional()
    .transform((valor) => (valor === "" ? undefined : valor)),
  itens: z
    .array(pedidoItemSchema)
    .min(1, { error: "Adicione pelo menos um item ao pedido" }),
});

export type PedidoInput = z.infer<typeof pedidoSchema>;

/**
 * Schema do item no formulário (client). Campos ficam como string porque
 * vêm de inputs e selects; a coerção real (número, vazio para undefined)
 * acontece no submit antes de chamar a action.
 */
export const pedidoItemFormSchema = z.object({
  insumoId: z.uuid({ error: "Escolha o insumo" }),
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
  centroCustoId: z.uuid({ error: "Escolha o centro de custo" }),
  depositoId: z.uuid().optional(),
  observacao: z.string().trim().max(500, { error: "Máximo de 500 caracteres" }),
});

export type PedidoItemFormInput = z.infer<typeof pedidoItemFormSchema>;

/** Schema do formulário (client). Itens com pelo menos uma linha. */
export const pedidoFormSchema = z.object({
  justificativa: z
    .string()
    .trim()
    .max(2000, { error: "Máximo de 2000 caracteres" }),
  itens: z
    .array(pedidoItemFormSchema)
    .min(1, { error: "Adicione pelo menos um item ao pedido" }),
});

export type PedidoFormInput = z.infer<typeof pedidoFormSchema>;
