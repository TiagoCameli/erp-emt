import { z } from "zod";

/** Data, yyyy-MM-dd. */
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Status de férias. */
export const STATUS_FERIAS = ["programada", "gozada"] as const;
export type StatusFerias = (typeof STATUS_FERIAS)[number];

/** Rótulos pt-BR dos status, para a UI. */
export const ROTULO_STATUS_FERIAS: Record<StatusFerias, string> = {
  programada: "Programada",
  gozada: "Gozada",
};

/**
 * Schema de servidor das férias (tipos já coeridos), validado na action antes
 * de gravar. Datas de gozo são opcionais (período só programado ainda não tem
 * início/fim).
 */
export const feriasSchema = z
  .object({
    colaboradorId: z.uuid({ error: "Selecione o colaborador" }),
    periodoAquisitivoInicio: z
      .string()
      .trim()
      .regex(DATA_REGEX, { error: "Início do período aquisitivo inválido" }),
    periodoAquisitivoFim: z
      .string()
      .trim()
      .regex(DATA_REGEX, { error: "Fim do período aquisitivo inválido" }),
    dataInicio: z
      .string()
      .trim()
      .regex(DATA_REGEX, { error: "Data de início inválida" })
      .optional(),
    dataFim: z
      .string()
      .trim()
      .regex(DATA_REGEX, { error: "Data de fim inválida" })
      .optional(),
    dias: z
      .number({ error: "Dias inválidos" })
      .int({ error: "Dias precisa ser um número inteiro" })
      .min(0, { error: "Dias não pode ser negativo" }),
    status: z.enum(STATUS_FERIAS, { error: "Status inválido" }),
    observacao: z
      .string()
      .trim()
      .max(500, { error: "Máximo de 500 caracteres" })
      .optional(),
  })
  .refine(
    (dados) => dados.periodoAquisitivoFim >= dados.periodoAquisitivoInicio,
    {
      error: "Fim do período aquisitivo não pode ser antes do início",
      path: ["periodoAquisitivoFim"],
    },
  )
  .refine(
    (dados) =>
      !dados.dataInicio || !dados.dataFim || dados.dataFim >= dados.dataInicio,
    { error: "Fim do gozo não pode ser antes do início", path: ["dataFim"] },
  );

export type FeriasInput = z.infer<typeof feriasSchema>;

/**
 * Schema do formulário (client). Dias como string para casar com o input do
 * react-hook-form; a coerção real é no submit.
 */
export const feriasFormSchema = z.object({
  colaboradorId: z.uuid({ error: "Selecione o colaborador" }),
  periodoAquisitivoInicio: z
    .string()
    .trim()
    .regex(DATA_REGEX, { error: "Informe o início do período aquisitivo" }),
  periodoAquisitivoFim: z
    .string()
    .trim()
    .regex(DATA_REGEX, { error: "Informe o fim do período aquisitivo" }),
  dataInicio: z.string().trim(),
  dataFim: z.string().trim(),
  dias: z
    .string()
    .trim()
    .refine((valor) => diasValido(valor), {
      error: "Informe os dias (inteiro, 0 ou mais)",
    }),
  status: z.enum(STATUS_FERIAS, { error: "Selecione o status" }),
  observacao: z.string().trim().max(500, { error: "Máximo de 500 caracteres" }),
});

export type FeriasFormInput = z.infer<typeof feriasFormSchema>;

/** String representa um inteiro finito maior ou igual a zero. */
export function diasValido(valor: string): boolean {
  const limpo = valor.trim();
  if (limpo === "") return false;
  const numero = Number(limpo);
  return Number.isInteger(numero) && numero >= 0;
}

/** Converte o formulário (strings) no input de servidor (números coeridos). */
export function feriasFormParaInput(dados: FeriasFormInput): FeriasInput {
  return {
    colaboradorId: dados.colaboradorId,
    periodoAquisitivoInicio: dados.periodoAquisitivoInicio,
    periodoAquisitivoFim: dados.periodoAquisitivoFim,
    dataInicio: dados.dataInicio === "" ? undefined : dados.dataInicio,
    dataFim: dados.dataFim === "" ? undefined : dados.dataFim,
    dias: Number(dados.dias.trim()),
    status: dados.status,
    observacao: dados.observacao === "" ? undefined : dados.observacao,
  };
}
