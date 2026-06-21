import { z } from "zod";

import {
  numeroNaoNegativo,
  paraNumero,
  quantidadeMedidaValida,
  reajusteValorValido,
} from "@/modules/medicao/medicoes/numero";

/** Tipos de reajuste aceitos pela medição. */
export const TIPOS_REAJUSTE = ["nenhum", "percentual", "valor"] as const;

/* ------------------------------------------------------------------ */
/* Criar medição (cabeçalho)                                          */
/* ------------------------------------------------------------------ */

/** Competência date-only yyyy-MM-dd, obrigatória. */
const competenciaSchema = z
  .string()
  .trim()
  .refine((valor) => /^\d{4}-\d{2}-\d{2}$/.test(valor), {
    error: "Informe a competência",
  });

/** Schema de servidor da criação da medição (tipos já coeridos). */
export const criarMedicaoSchema = z.object({
  obraId: z.uuid({ error: "Selecione a obra" }),
  planilhaId: z.uuid({ error: "Planilha inválida" }),
  competencia: competenciaSchema,
  descricao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" })
    .optional(),
  reajusteTipo: z.enum(TIPOS_REAJUSTE, { error: "Tipo de reajuste inválido" }),
  reajusteValor: z
    .number({ error: "Valor de reajuste inválido" })
    .refine(reajusteValorValido, {
      error: "Reajuste inválido (não negativo, até 4 casas)",
    }),
});

export type CriarMedicaoInput = z.infer<typeof criarMedicaoSchema>;

/** Schema do formulário (client): números e datas como string pt-BR. */
export const criarMedicaoFormSchema = z.object({
  obraId: z.uuid({ error: "Selecione a obra" }),
  planilhaId: z.uuid({ error: "Selecione uma obra com planilha contratual" }),
  competencia: z.string().trim().min(1, { error: "Informe a competência" }),
  descricao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" }),
  reajusteTipo: z.enum(TIPOS_REAJUSTE, { error: "Tipo de reajuste inválido" }),
  reajusteValor: z
    .string()
    .trim()
    .refine(numeroNaoNegativo, { error: "Informe um valor de reajuste válido" }),
});

export type CriarMedicaoFormInput = z.infer<typeof criarMedicaoFormSchema>;

/** Converte o formulário da medição no input de servidor (números coeridos). */
export function criarMedicaoFormParaInput(
  dados: CriarMedicaoFormInput,
): CriarMedicaoInput {
  const descricao = dados.descricao.trim();
  return {
    obraId: dados.obraId,
    planilhaId: dados.planilhaId,
    competencia: dados.competencia,
    descricao: descricao === "" ? undefined : descricao,
    reajusteTipo: dados.reajusteTipo,
    reajusteValor:
      dados.reajusteTipo === "nenhum" ? 0 : paraNumero(dados.reajusteValor),
  };
}

/* ------------------------------------------------------------------ */
/* Editar cabeçalho (só rascunho, colunas permitidas)                 */
/* ------------------------------------------------------------------ */

/** Schema de servidor da edição do cabeçalho (colunas com grant). */
export const editarCabecalhoSchema = z.object({
  competencia: competenciaSchema,
  descricao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" })
    .optional(),
  reajusteTipo: z.enum(TIPOS_REAJUSTE, { error: "Tipo de reajuste inválido" }),
  reajusteValor: z
    .number({ error: "Valor de reajuste inválido" })
    .refine(reajusteValorValido, {
      error: "Reajuste inválido (não negativo, até 4 casas)",
    }),
});

export type EditarCabecalhoInput = z.infer<typeof editarCabecalhoSchema>;

/** Schema do formulário (client) da edição do cabeçalho. */
export const editarCabecalhoFormSchema = z.object({
  competencia: z.string().trim().min(1, { error: "Informe a competência" }),
  descricao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" }),
  reajusteTipo: z.enum(TIPOS_REAJUSTE, { error: "Tipo de reajuste inválido" }),
  reajusteValor: z
    .string()
    .trim()
    .refine(numeroNaoNegativo, { error: "Informe um valor de reajuste válido" }),
});

export type EditarCabecalhoFormInput = z.infer<
  typeof editarCabecalhoFormSchema
>;

/** Converte o formulário do cabeçalho no input de servidor. */
export function editarCabecalhoFormParaInput(
  dados: EditarCabecalhoFormInput,
): EditarCabecalhoInput {
  const descricao = dados.descricao.trim();
  return {
    competencia: dados.competencia,
    descricao: descricao === "" ? undefined : descricao,
    reajusteTipo: dados.reajusteTipo,
    reajusteValor:
      dados.reajusteTipo === "nenhum" ? 0 : paraNumero(dados.reajusteValor),
  };
}

/* ------------------------------------------------------------------ */
/* Item da medição                                                    */
/* ------------------------------------------------------------------ */

/** Schema de servidor de um item medido (tipos já coeridos). */
export const itemSchema = z.object({
  planilhaItemId: z.uuid({ error: "Selecione o item da planilha" }),
  quantidade: z
    .number({ error: "Quantidade inválida" })
    .refine(quantidadeMedidaValida, {
      error: "Quantidade inválida (não negativa, até 3 casas)",
    }),
  memoriaCalculo: z
    .string()
    .trim()
    .max(1000, { error: "Máximo de 1000 caracteres" })
    .optional(),
});

export type ItemInput = z.infer<typeof itemSchema>;

/** Schema do formulário (client) do item: quantidade como string pt-BR. */
export const itemFormSchema = z.object({
  planilhaItemId: z.uuid({ error: "Selecione o item da planilha" }),
  quantidade: z
    .string()
    .trim()
    .refine(numeroNaoNegativo, { error: "Informe uma quantidade válida" }),
  memoriaCalculo: z
    .string()
    .trim()
    .max(1000, { error: "Máximo de 1000 caracteres" }),
});

export type ItemFormInput = z.infer<typeof itemFormSchema>;

/** Converte o formulário do item no input de servidor (número coerido). */
export function itemFormParaInput(dados: ItemFormInput): ItemInput {
  const memoria = dados.memoriaCalculo.trim();
  return {
    planilhaItemId: dados.planilhaItemId,
    quantidade: paraNumero(dados.quantidade),
    memoriaCalculo: memoria === "" ? undefined : memoria,
  };
}

/* ------------------------------------------------------------------ */
/* Aprovar / cancelar / desaprovar                                    */
/* ------------------------------------------------------------------ */

/** Data de vencimento opcional yyyy-MM-dd; string vazia vira undefined. */
const dataVencimentoSchema = z
  .string()
  .trim()
  .optional()
  .refine(
    (valor) =>
      valor === undefined || valor === "" || /^\d{4}-\d{2}-\d{2}$/.test(valor),
    { error: "Data de vencimento inválida" },
  )
  .transform((valor) =>
    valor === undefined || valor === "" ? undefined : valor,
  );

/** Schema de servidor da aprovação (data de vencimento opcional). */
export const aprovarSchema = z.object({
  dataVencimento: dataVencimentoSchema,
});

export type AprovarInput = z.infer<typeof aprovarSchema>;

/** Schema do formulário (client) da aprovação. */
export const aprovarFormSchema = z.object({
  dataVencimento: z.string().trim(),
});

export type AprovarFormInput = z.infer<typeof aprovarFormSchema>;

/** Converte o formulário da aprovação no input de servidor. */
export function aprovarFormParaInput(dados: AprovarFormInput): AprovarInput {
  return {
    dataVencimento:
      dados.dataVencimento.trim() === "" ? undefined : dados.dataVencimento,
  };
}

/** Motivo obrigatório para cancelar/desaprovar. */
export const motivoSchema = z
  .string()
  .trim()
  .min(1, { error: "Informe o motivo" })
  .max(500, { error: "Máximo de 500 caracteres" });
