import { z } from "zod";

import { numeroPositivo, paraNumero, valorValido } from "./numero";

/** Competência completa: 1o dia do mês, yyyy-MM-01. */
const COMPETENCIA_REGEX = /^\d{4}-\d{2}-01$/;
/** Mês do formulário, yyyy-MM (input month). */
const MES_REGEX = /^\d{4}-\d{2}$/;
/** Data do adiantamento, yyyy-MM-dd. */
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Converte o mês do formulário (yyyy-MM) na competência (yyyy-MM-01). */
export function mesParaCompetencia(mes: string): string {
  return `${mes}-01`;
}

/** Extrai o mês (yyyy-MM) de uma competência (yyyy-MM-01) para o input month. */
export function competenciaParaMes(competencia: string): string {
  return competencia.slice(0, 7);
}

/**
 * Schema de servidor do adiantamento (tipos já coeridos), validado na action
 * antes de gravar. Competência é sempre o 1o dia do mês.
 */
export const adiantamentoSchema = z.object({
  colaboradorId: z.uuid({ error: "Selecione o colaborador" }),
  competencia: z
    .string()
    .trim()
    .regex(COMPETENCIA_REGEX, { error: "Competência inválida" }),
  valor: z
    .number({ error: "Valor inválido" })
    .refine((v) => v > 0, { error: "O valor precisa ser maior que zero" })
    .refine(valorValido, { error: "Valor inválido (até 2 casas)" }),
  data: z.string().trim().regex(DATA_REGEX, { error: "Data inválida" }),
  descricao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" })
    .optional(),
});

export type AdiantamentoInput = z.infer<typeof adiantamentoSchema>;

/**
 * Schema do formulário (client). Valor como string pt-BR e competência como
 * mês (yyyy-MM) para casar com os inputs do react-hook-form; a coerção real é
 * no submit.
 */
export const adiantamentoFormSchema = z.object({
  colaboradorId: z.uuid({ error: "Selecione o colaborador" }),
  competencia: z
    .string()
    .trim()
    .regex(MES_REGEX, { error: "Escolha o mês de competência" }),
  valor: z
    .string()
    .trim()
    .refine(numeroPositivo, { error: "Informe um valor maior que zero" }),
  data: z.string().trim().regex(DATA_REGEX, { error: "Informe a data" }),
  descricao: z.string().trim().max(500, { error: "Máximo de 500 caracteres" }),
});

export type AdiantamentoFormInput = z.infer<typeof adiantamentoFormSchema>;

/** Converte o formulário (strings) no input de servidor (números coeridos). */
export function adiantamentoFormParaInput(
  dados: AdiantamentoFormInput,
): AdiantamentoInput {
  return {
    colaboradorId: dados.colaboradorId,
    competencia: mesParaCompetencia(dados.competencia),
    valor: paraNumero(dados.valor),
    data: dados.data,
    descricao: dados.descricao === "" ? undefined : dados.descricao,
  };
}
