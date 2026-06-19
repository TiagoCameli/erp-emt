import { z } from "zod";

/**
 * Schemas do lançamento financeiro manual (a pagar / a receber), com parcelas
 * e rateio por centro de custo.
 *
 * Dois pares de schema, igual ao padrão de compras/ordens:
 * - *FormSchema (client): valores monetários como string para casar com os
 *   inputs do react-hook-form. A coerção real acontece no submit.
 * - *Schema (servidor): tipos já coeridos (number), validado na Server Action
 *   antes de chamar a RPC.
 *
 * As somas (parcelas = valor, rateios = valor) são validadas no client via
 * refine para evitar uma ida ao servidor; a RPC do banco revalida por garantia.
 */

/** Centavos de tolerância na comparação de somas (erro de arredondamento). */
const TOLERANCIA = 0.005;

/** Quantas casas decimais o número tem (até 2 é o aceito pela coluna). */
function ateDuasCasas(valor: number): boolean {
  return Number.isInteger(Math.round(valor * 100));
}

/** Valor monetário NUMERIC(14,2): não negativo, no máximo 2 casas decimais. */
const valorSchema = z
  .number({ error: "Valor inválido" })
  .min(0, { error: "O valor não pode ser negativo" })
  .max(999999999999.99, { error: "Valor acima do permitido" })
  .refine(ateDuasCasas, { error: "Use no máximo 2 casas decimais" });

/** Data opcional no formato yyyy-MM-dd; string vazia vira undefined. */
const dataOpcionalSchema = z
  .string()
  .trim()
  .optional()
  .refine((valor) => valor === undefined || valor === "" || /^\d{4}-\d{2}-\d{2}$/.test(valor), {
    error: "Data inválida",
  })
  .transform((valor) => (valor === undefined || valor === "" ? undefined : valor));

/** Converte string do form ("1.234,56") em número, ou NaN se inválida. */
export function paraNumero(valor: string): number {
  const limpo = valor.trim().replace(/\./g, "").replace(",", ".");
  if (limpo === "") return Number.NaN;
  return Number(limpo);
}

// ---------------------------------------------------------------------------
// Schemas de servidor (tipos coeridos, validados na action)
// ---------------------------------------------------------------------------

/** Parcela validada no servidor. */
export const parcelaSchema = z.object({
  numeroParcela: z
    .number({ error: "Número da parcela inválido" })
    .int({ error: "Número da parcela inválido" })
    .min(1, { error: "Número da parcela inválido" }),
  valor: valorSchema,
  dataVencimento: dataOpcionalSchema,
});

export type ParcelaInput = z.infer<typeof parcelaSchema>;

/** Rateio por centro de custo validado no servidor. */
export const rateioSchema = z.object({
  centroCustoId: z.uuid({ error: "Centro de custo inválido" }),
  valor: valorSchema,
});

export type RateioInput = z.infer<typeof rateioSchema>;

/**
 * Lançamento validado no servidor. A soma das parcelas precisa bater com o
 * valor e, quando há rateio, a soma do rateio também. A RPC revalida.
 */
export const lancamentoSchema = z
  .object({
    tipo: z.enum(["a_pagar", "a_receber"], { error: "Tipo inválido" }),
    fornecedorId: z.uuid({ error: "Fornecedor inválido" }).optional(),
    categoriaId: z.uuid({ error: "Categoria inválida" }).optional(),
    descricao: z
      .string()
      .trim()
      .min(1, { error: "Informe a descrição" })
      .max(500, { error: "Máximo de 500 caracteres" }),
    valor: valorSchema.refine((v) => v > 0, {
      error: "O valor precisa ser maior que zero",
    }),
    competencia: dataOpcionalSchema,
    dataVencimento: dataOpcionalSchema,
    parcelas: z
      .array(parcelaSchema)
      .min(1, { error: "Adicione ao menos uma parcela" }),
    rateios: z.array(rateioSchema),
  })
  .refine(
    (dados) => {
      const soma = dados.parcelas.reduce((total, p) => total + p.valor, 0);
      return Math.abs(soma - dados.valor) <= TOLERANCIA;
    },
    { error: "A soma das parcelas precisa ser igual ao valor", path: ["parcelas"] },
  )
  .refine(
    (dados) => {
      if (dados.rateios.length === 0) return true;
      const soma = dados.rateios.reduce((total, r) => total + r.valor, 0);
      return Math.abs(soma - dados.valor) <= TOLERANCIA;
    },
    { error: "A soma do rateio precisa ser igual ao valor", path: ["rateios"] },
  );

export type LancamentoInput = z.infer<typeof lancamentoSchema>;

// ---------------------------------------------------------------------------
// Schemas de formulário (client, valores como string)
// ---------------------------------------------------------------------------

/** Refine reaproveitado em valores monetários string (vazio = inválido). */
function valorStringValido(valor: string): boolean {
  const numero = paraNumero(valor);
  return valor.trim() !== "" && !Number.isNaN(numero) && numero >= 0;
}

/** Parcela no formulário. Valor como string; vencimento opcional. */
export const parcelaFormSchema = z.object({
  valor: z
    .string()
    .trim()
    .refine(valorStringValido, { error: "Informe um valor válido" }),
  dataVencimento: z.string().trim(),
});

export type ParcelaFormInput = z.infer<typeof parcelaFormSchema>;

/** Rateio no formulário. Centro de custo + valor como string. */
export const rateioFormSchema = z.object({
  centroCustoId: z.uuid({ error: "Selecione o centro de custo" }),
  valor: z
    .string()
    .trim()
    .refine(valorStringValido, { error: "Informe um valor válido" }),
});

export type RateioFormInput = z.infer<typeof rateioFormSchema>;

/**
 * Formulário do lançamento (client). As somas são validadas aqui via refine,
 * com a tolerância de centavos, antes de chamar a action.
 */
export const lancamentoFormSchema = z
  .object({
    tipo: z.enum(["a_pagar", "a_receber"], { error: "Selecione o tipo" }),
    fornecedorId: z.uuid().optional(),
    categoriaId: z.uuid().optional(),
    descricao: z
      .string()
      .trim()
      .min(1, { error: "Informe a descrição" })
      .max(500, { error: "Máximo de 500 caracteres" }),
    valor: z
      .string()
      .trim()
      .refine((v) => valorStringValido(v) && paraNumero(v) > 0, {
        error: "Informe um valor maior que zero",
      }),
    competencia: z.string().trim(),
    dataVencimento: z.string().trim(),
    parcelas: z
      .array(parcelaFormSchema)
      .min(1, { error: "Adicione ao menos uma parcela" }),
    rateios: z.array(rateioFormSchema),
  })
  .refine(
    (dados) => {
      const valor = paraNumero(dados.valor);
      if (Number.isNaN(valor)) return true;
      const soma = dados.parcelas.reduce(
        (total, p) => total + (Number.isNaN(paraNumero(p.valor)) ? 0 : paraNumero(p.valor)),
        0,
      );
      return Math.abs(soma - valor) <= TOLERANCIA;
    },
    { error: "A soma das parcelas precisa ser igual ao valor", path: ["parcelas"] },
  )
  .refine(
    (dados) => {
      if (dados.rateios.length === 0) return true;
      const valor = paraNumero(dados.valor);
      if (Number.isNaN(valor)) return true;
      const soma = dados.rateios.reduce(
        (total, r) => total + (Number.isNaN(paraNumero(r.valor)) ? 0 : paraNumero(r.valor)),
        0,
      );
      return Math.abs(soma - valor) <= TOLERANCIA;
    },
    { error: "A soma do rateio precisa ser igual ao valor", path: ["rateios"] },
  );

export type LancamentoFormInput = z.infer<typeof lancamentoFormSchema>;

export { TOLERANCIA as TOLERANCIA_SOMA };
