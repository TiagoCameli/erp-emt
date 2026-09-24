import { z } from "zod";

import { numeroSchema } from "@/modules/combustivel/entradas/schemas";
import {
  CASAS_QUANTIDADE_PEDIDO,
  CASAS_VALOR_UNITARIO_PEDIDO,
} from "@/modules/frete/pedidos-material/regras";

/**
 * Schemas do pedido de material. Mensagens da origem
 * (schemas/frete/pedidoMaterial.schema.ts). Os itens ficam fora do react-hook-form, como
 * na origem (array local com linhas dinâmicas); a action valida tudo de novo.
 */

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export const pedidoFormSchema = z.object({
  data: z.string().trim().regex(DIA, { error: "Data do pedido obrigatória" }),
  fornecedorId: z.string().trim().min(1, { error: "Selecione o fornecedor" }),
  observacoes: z.string().trim().max(500, { error: "Máximo 500 caracteres" }),
});
export type PedidoFormInput = z.infer<typeof pedidoFormSchema>;

/** Teto de numeric(18,6): 12 dígitos inteiros. */
const TETO_QUANTIDADE = 999_999_999_999.999999;

const quantidadeSchema = z
  .number({ error: "Quantidade inválida" })
  .refine((v) => Number.isFinite(v) && v > 0, { error: "Quantidade precisa ser maior que zero" })
  .refine((v) => v <= TETO_QUANTIDADE, { error: "Quantidade acima do permitido" })
  .refine(
    (v) => {
      const escala = 10 ** CASAS_QUANTIDADE_PEDIDO;
      return Math.abs(Math.round(v * escala) - v * escala) <= 1e-4;
    },
    { error: `Quantidade aceita no máximo ${CASAS_QUANTIDADE_PEDIDO} casas decimais` },
  );

export const pedidoSchema = z.strictObject({
  data: z.string().regex(DIA, { error: "Data do pedido obrigatória" }),
  fornecedorId: z.guid({ error: "Selecione o fornecedor" }),
  observacoes: z.string().trim().max(500, { error: "Máximo 500 caracteres" }).nullable(),
  itens: z
    .array(
      z.strictObject({
        insumoId: z.guid({ error: "Selecione o material" }),
        quantidade: quantidadeSchema,
        valorUnitario: numeroSchema(CASAS_VALOR_UNITARIO_PEDIDO, "Valor unitário", "positivo"),
      }),
    )
    .min(1, { error: "Adicione ao menos um material" }),
});
