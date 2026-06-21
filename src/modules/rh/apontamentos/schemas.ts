import { z } from "zod";

import type { TipoApontamento } from "@/modules/rh/_shared/formato";
import {
  numeroOpcionalNaoNegativo,
  paraNumero,
} from "@/modules/rh/apontamentos/numero";

/** Tipos de apontamento aceitos (espelha o check do banco). */
export const TIPOS_APONTAMENTO = [
  "normal",
  "falta",
  "atestado",
  "folga",
] as const satisfies readonly TipoApontamento[];

/** Horas NUMERIC(5,2) com check 0..24 no banco. */
const HORAS_MAX = 24;

/** Horas: número finito entre 0 e 24. */
function horasValidas(valor: number): boolean {
  return Number.isFinite(valor) && valor >= 0 && valor <= HORAS_MAX;
}

/** Data yyyy-MM-dd obrigatória. */
const dataSchema = z
  .string()
  .trim()
  .refine((valor) => /^\d{4}-\d{2}-\d{2}$/.test(valor), {
    error: "Informe a data do ponto",
  });

/** Observação opcional; string vazia vira undefined. */
const observacaoSchema = z
  .string()
  .trim()
  .max(500, { error: "Máximo de 500 caracteres" })
  .optional()
  .transform((valor) => (valor === undefined || valor === "" ? undefined : valor));

/* ------------------------------------------------------------------ */
/* Ponto (cabeçalho do dia)                                           */
/* ------------------------------------------------------------------ */

/** Schema de servidor da criação/edição do ponto. */
export const pontoSchema = z.object({
  obraId: z.uuid({ error: "Selecione a obra" }),
  data: dataSchema,
  encarregadoId: z.uuid({ error: "Encarregado inválido" }).optional(),
  observacao: observacaoSchema,
});

export type PontoInput = z.infer<typeof pontoSchema>;

/** Schema do formulário do ponto (client). Encarregado vazio = sem encarregado. */
export const pontoFormSchema = z.object({
  obraId: z.uuid({ error: "Selecione a obra" }),
  data: dataSchema,
  encarregadoId: z.string().trim(),
  observacao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" }),
});

export type PontoFormInput = z.infer<typeof pontoFormSchema>;

/** Converte o formulário do ponto no input de servidor. */
export function pontoFormParaInput(dados: PontoFormInput): PontoInput {
  return {
    obraId: dados.obraId,
    data: dados.data,
    encarregadoId:
      dados.encarregadoId && dados.encarregadoId !== ""
        ? dados.encarregadoId
        : undefined,
    observacao: dados.observacao.trim() === "" ? undefined : dados.observacao,
  };
}

/* ------------------------------------------------------------------ */
/* Apontamento (horas de um colaborador no dia)                       */
/* ------------------------------------------------------------------ */

/** Schema de servidor do apontamento (tipos já coeridos). */
export const apontamentoSchema = z.object({
  colaboradorId: z.uuid({ error: "Selecione o colaborador" }),
  horasNormais: z
    .number({ error: "Horas inválidas" })
    .refine(horasValidas, { error: "As horas normais vão de 0 a 24" }),
  horasExtras: z
    .number({ error: "Horas inválidas" })
    .refine(horasValidas, { error: "As horas extras vão de 0 a 24" }),
  tipo: z.enum(TIPOS_APONTAMENTO, { error: "Selecione o tipo" }),
  observacao: observacaoSchema,
});

export type ApontamentoInput = z.infer<typeof apontamentoSchema>;

/** Schema do formulário do apontamento (client): horas como string pt-BR. */
export const apontamentoFormSchema = z.object({
  colaboradorId: z.uuid({ error: "Selecione o colaborador" }),
  horasNormais: z
    .string()
    .trim()
    .refine(numeroOpcionalNaoNegativo, { error: "Horas normais inválidas" }),
  horasExtras: z
    .string()
    .trim()
    .refine(numeroOpcionalNaoNegativo, { error: "Horas extras inválidas" }),
  tipo: z.enum(TIPOS_APONTAMENTO, { error: "Selecione o tipo" }),
  observacao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" }),
});

export type ApontamentoFormInput = z.infer<typeof apontamentoFormSchema>;

/** Converte o formulário do apontamento no input de servidor (vazio = 0). */
export function apontamentoFormParaInput(
  dados: ApontamentoFormInput,
): ApontamentoInput {
  return {
    colaboradorId: dados.colaboradorId,
    horasNormais:
      dados.horasNormais.trim() === "" ? 0 : paraNumero(dados.horasNormais),
    horasExtras:
      dados.horasExtras.trim() === "" ? 0 : paraNumero(dados.horasExtras),
    tipo: dados.tipo,
    observacao: dados.observacao.trim() === "" ? undefined : dados.observacao,
  };
}
