import { z } from "zod";

/**
 * Schemas de recebimento. O recebimento nasce de uma OC aprovada (ou recebida
 * parcial): confere a NF (número, valor, datas) e as quantidades recebidas por
 * item. A gravação em si vai pela RPC fn_registrar_recebimento, então estes
 * schemas validam só a entrada da tela antes de montar o p_itens jsonb.
 *
 * Não há editar nem excluir recebimento na Fase 2. Cancelar fica para depois
 * (a action documenta isso). Por isso só existe o schema de criação.
 */

/** Datas date-only do input HTML, ex: "2026-06-18". */
const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida");

/** Item recebido: aponta para o oc_item e a quantidade recebida agora. */
export const recebimentoItemSchema = z.object({
  ocItemId: z.uuid("Item da ordem inválido"),
  quantidadeRecebida: z
    .number({ error: "Informe a quantidade recebida" })
    .nonnegative("A quantidade não pode ser negativa")
    .max(9_999_999_999.999, "Quantidade acima do limite"),
});

export type RecebimentoItemInput = z.infer<typeof recebimentoItemSchema>;

/** Cabeçalho do recebimento mais os itens. */
export const recebimentoSchema = z
  .object({
    ordemCompraId: z.uuid("Selecione a ordem de compra"),
    numeroNf: z
      .string()
      .trim()
      .min(1, "Informe o número da nota fiscal")
      .max(60, "Número da nota muito longo"),
    valorNf: z
      .number({ error: "Informe o valor da nota fiscal" })
      .positive("O valor da nota deve ser maior que zero")
      .max(999_999_999_999.99, "Valor acima do limite"),
    dataRecebimento: dataSchema,
    dataVencimento: dataSchema,
    observacoes: z.string().trim().max(2000, "Observação muito longa").optional(),
    itens: z
      .array(recebimentoItemSchema)
      .min(1, "A ordem precisa ter ao menos um item para receber"),
  })
  .refine(
    (dados) => dados.itens.some((item) => item.quantidadeRecebida > 0),
    {
      message: "Informe a quantidade recebida em ao menos um item",
      path: ["itens"],
    },
  );

export type RecebimentoInput = z.infer<typeof recebimentoSchema>;

/** Form do drawer: campos numéricos chegam como string do input. */
export const recebimentoItemFormSchema = z.object({
  ocItemId: z.string(),
  quantidadeRecebida: z.string(),
});

export const recebimentoFormSchema = z.object({
  ordemCompraId: z.string().min(1, "Selecione a ordem de compra"),
  numeroNf: z.string().trim().min(1, "Informe o número da nota fiscal"),
  valorNf: z.string().min(1, "Informe o valor da nota fiscal"),
  dataRecebimento: z.string().min(1, "Informe a data de recebimento"),
  dataVencimento: z.string().min(1, "Informe a data de vencimento"),
  observacoes: z.string().optional(),
  itens: z.array(recebimentoItemFormSchema),
});

export type RecebimentoFormInput = z.infer<typeof recebimentoFormSchema>;
