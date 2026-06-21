import { z } from "zod";

import { horasValidas, numeroPositivo, paraNumero } from "./numero";

/** Tipos de movimento do banco de horas. */
export const TIPOS_MOVIMENTO = ["credito", "debito"] as const;

export type TipoMovimento = (typeof TIPOS_MOVIMENTO)[number];

/** Rótulos em pt-BR de cada tipo, para exibição e filtro. */
export const ROTULO_TIPO_MOVIMENTO: Record<TipoMovimento, string> = {
  credito: "Crédito",
  debito: "Débito",
};

/** Data no formato yyyy-MM-dd (input date). */
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Schema de servidor do movimento (tipos já coeridos), validado na action
 * antes de gravar. Horas sempre maior que zero (o sinal vem do tipo).
 */
export const movimentoSchema = z.object({
  colaboradorId: z.uuid({ error: "Selecione o colaborador" }),
  data: z.string().trim().regex(DATA_REGEX, { error: "Data inválida" }),
  tipo: z.enum(TIPOS_MOVIMENTO, { error: "Escolha um tipo válido" }),
  horas: z
    .number({ error: "Horas inválidas" })
    .refine((v) => v > 0, { error: "As horas precisam ser maiores que zero" })
    .refine(horasValidas, { error: "Horas inválidas (até 2 casas)" }),
  motivo: z
    .string()
    .trim()
    .max(200, { error: "Máximo de 200 caracteres" })
    .optional(),
  observacao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" })
    .optional(),
});

export type MovimentoInput = z.infer<typeof movimentoSchema>;

/**
 * Schema do formulário (client). Horas como string pt-BR para casar com o input
 * do react-hook-form; a coerção real é no submit.
 */
export const movimentoFormSchema = z.object({
  colaboradorId: z.uuid({ error: "Selecione o colaborador" }),
  data: z.string().trim().regex(DATA_REGEX, { error: "Informe a data" }),
  tipo: z.enum(TIPOS_MOVIMENTO, { error: "Escolha um tipo válido" }),
  horas: z
    .string()
    .trim()
    .refine(numeroPositivo, { error: "Informe horas maiores que zero" }),
  motivo: z.string().trim().max(200, { error: "Máximo de 200 caracteres" }),
  observacao: z.string().trim().max(500, { error: "Máximo de 500 caracteres" }),
});

export type MovimentoFormInput = z.infer<typeof movimentoFormSchema>;

/** Converte o formulário (strings) no input de servidor (horas coeridas). */
export function movimentoFormParaInput(
  dados: MovimentoFormInput,
): MovimentoInput {
  return {
    colaboradorId: dados.colaboradorId,
    data: dados.data,
    tipo: dados.tipo,
    horas: paraNumero(dados.horas),
    motivo: dados.motivo === "" ? undefined : dados.motivo,
    observacao: dados.observacao === "" ? undefined : dados.observacao,
  };
}
