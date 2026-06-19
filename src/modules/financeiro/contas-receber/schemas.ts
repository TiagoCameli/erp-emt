import { z } from "zod";

/** Tamanho padrão de página da listagem de contas a receber. */
export const TAMANHO_PAGINA_PADRAO = 25;

/**
 * Schemas da aba Contas a receber.
 *
 * Um lançamento a receber é o mesmo `lancamentos` da Fase 3 com tipo
 * 'a_receber'. Por ora não há cadastro de cliente vinculado direto: o
 * recebível se descreve por `descricao` + `categoria` (receita) e quebra em
 * parcelas. O rateio por centro de custo é opcional. A action chama
 * `fn_salvar_lancamento`, que valida no banco que a soma das parcelas e a
 * soma do rateio batem com o valor; aqui validamos o que dá para validar antes
 * de bater no banco, para o usuário ver o erro sem ida e volta.
 *
 * Há dois pares de schema, como nas outras abas: o de servidor (tipos já
 * coeridos, usado na action) e o de formulário (valores monetários como string
 * para casar com o react-hook-form, coeridos no submit).
 */

/** Valor em dinheiro NUMERIC(14,2): positivo, no máximo 2 casas. */
const valorSchema = z
  .number({ error: "Valor inválido" })
  .positive({ error: "O valor precisa ser maior que zero" })
  .max(999999999999.99, { error: "Valor acima do permitido" });

/** Data no formato date-only do Postgres (yyyy-MM-dd), opcional. */
const dataOpcionalSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data inválida" })
  .optional()
  .or(z.literal("").transform(() => undefined));

/** Parcela validada no servidor: tipos já coeridos. */
export const receberParcelaSchema = z.object({
  numeroParcela: z
    .number({ error: "Número da parcela inválido" })
    .int({ error: "Número da parcela inválido" })
    .positive({ error: "Número da parcela inválido" }),
  valor: valorSchema,
  dataVencimento: dataOpcionalSchema,
});

export type ReceberParcelaInput = z.infer<typeof receberParcelaSchema>;

/** Rateio por centro de custo validado no servidor. */
export const receberRateioSchema = z.object({
  centroCustoId: z.uuid({ error: "Centro de custo inválido" }),
  valor: valorSchema,
});

export type ReceberRateioInput = z.infer<typeof receberRateioSchema>;

/**
 * Lançamento a receber validado no servidor (avulso). Sem fornecedor: o
 * recebível se identifica por descrição e categoria de receita. A categoria é
 * opcional para não travar o lançamento rápido, mas recomendada.
 */
export const receberSchema = z.object({
  descricao: z
    .string()
    .trim()
    .min(1, { error: "Descreva o recebível" })
    .max(300, { error: "Máximo de 300 caracteres" }),
  categoriaId: z.uuid({ error: "Categoria inválida" }).optional(),
  valor: valorSchema,
  competencia: dataOpcionalSchema,
  dataVencimento: dataOpcionalSchema,
  parcelas: z
    .array(receberParcelaSchema)
    .min(1, { error: "Informe ao menos uma parcela" }),
  rateios: z.array(receberRateioSchema),
});

export type ReceberInput = z.infer<typeof receberSchema>;

/**
 * Schema do formulário (client). Valor continua como string para casar input
 * e output do react-hook-form; a coerção real acontece no submit antes de
 * chamar a action. O formulário simples cobre o caso comum: parcela única, sem
 * rateio. As parcelas e rateios reais são montados no submit.
 */
export const receberFormSchema = z.object({
  descricao: z
    .string()
    .trim()
    .min(1, { error: "Descreva o recebível" })
    .max(300, { error: "Máximo de 300 caracteres" }),
  categoriaId: z.uuid().optional(),
  valor: z
    .string()
    .trim()
    .refine(
      (valor) => {
        const numero = Number(valor.replace(",", "."));
        return valor !== "" && !Number.isNaN(numero) && numero > 0;
      },
      { error: "Informe um valor maior que zero" },
    ),
  competencia: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data inválida" })
    .or(z.literal("")),
  dataVencimento: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data inválida" })
    .or(z.literal("")),
});

export type ReceberFormInput = z.infer<typeof receberFormSchema>;

/** Schema do formulário de baixa de recebimento (client). */
export const baixaRecebimentoFormSchema = z.object({
  contaId: z.uuid({ error: "Selecione a conta bancária" }),
  dataRecebimento: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe a data do recebimento" }),
});

export type BaixaRecebimentoFormInput = z.infer<
  typeof baixaRecebimentoFormSchema
>;
