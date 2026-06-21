import { z } from "zod";

import { numeroPositivo, paraNumero, valorValido } from "./numero";

/** Competência completa: 1o dia do mês, yyyy-MM-01. */
const COMPETENCIA_REGEX = /^\d{4}-\d{2}-01$/;
/** Data da diária, yyyy-MM-dd. */
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Deriva a competência (yyyy-MM-01) a partir da data (yyyy-MM-dd). */
export function dataParaCompetencia(data: string): string {
  return `${data.slice(0, 7)}-01`;
}

/** Competência (yyyy-MM-01) como MM/AAAA, para exibição. */
export function formatarCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

/**
 * Schema de servidor da diária (tipos já coeridos), validado na action antes
 * de gravar. A competência é sempre o 1o dia do mês: derivamos da data, então
 * aqui só confirmamos o formato. Obra é opcional.
 */
export const diariaSchema = z.object({
  colaboradorId: z.uuid({ error: "Selecione o diarista" }),
  obraId: z.uuid({ error: "Obra inválida" }).optional(),
  data: z.string().trim().regex(DATA_REGEX, { error: "Data inválida" }),
  competencia: z
    .string()
    .trim()
    .regex(COMPETENCIA_REGEX, { error: "Competência inválida" }),
  valor: z
    .number({ error: "Valor inválido" })
    .refine((v) => v >= 0, { error: "O valor não pode ser negativo" })
    .refine((v) => v === 0 || valorValido(v), {
      error: "Valor inválido (até 2 casas)",
    }),
  observacao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" })
    .optional(),
});

export type DiariaInput = z.infer<typeof diariaSchema>;

/**
 * Schema do formulário (client). Valor como string pt-BR e obra como string
 * (vazia = sem obra) para casar com os inputs do react-hook-form; a coerção
 * real é no submit. A competência é derivada da data no submit.
 */
export const diariaFormSchema = z.object({
  colaboradorId: z.uuid({ error: "Selecione o diarista" }),
  obraId: z.string().trim(),
  data: z.string().trim().regex(DATA_REGEX, { error: "Informe a data" }),
  valor: z
    .string()
    .trim()
    .refine(numeroPositivo, { error: "Informe um valor maior que zero" }),
  observacao: z.string().trim().max(500, { error: "Máximo de 500 caracteres" }),
});

export type DiariaFormInput = z.infer<typeof diariaFormSchema>;

/** Converte o formulário (strings) no input de servidor (números coeridos). */
export function diariaFormParaInput(dados: DiariaFormInput): DiariaInput {
  return {
    colaboradorId: dados.colaboradorId,
    obraId: dados.obraId === "" ? undefined : dados.obraId,
    data: dados.data,
    competencia: dataParaCompetencia(dados.data),
    valor: paraNumero(dados.valor),
    observacao: dados.observacao === "" ? undefined : dados.observacao,
  };
}

/** Data de vencimento do fechamento, yyyy-MM-dd. */
const VENC_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Schema do fechamento (servidor). Gera UM lançamento a pagar somando as
 * diárias em aberto do colaborador na competência. Vencimento é opcional.
 */
export const fecharSchema = z.object({
  colaboradorId: z.uuid({ error: "Diarista inválido" }),
  competencia: z
    .string()
    .trim()
    .regex(COMPETENCIA_REGEX, { error: "Competência inválida" }),
  dataVencimento: z
    .string()
    .trim()
    .regex(VENC_REGEX, { error: "Data de vencimento inválida" })
    .optional(),
});

export type FecharInput = z.infer<typeof fecharSchema>;
