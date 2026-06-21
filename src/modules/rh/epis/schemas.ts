import { z } from "zod";

/** Data, yyyy-MM-dd. */
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Schema de servidor do EPI (tipos já coeridos), validado na action antes de
 * gravar. Quantidade é inteiro positivo; devolução é opcional.
 */
export const epiSchema = z
  .object({
    colaboradorId: z.uuid({ error: "Selecione o colaborador" }),
    descricao: z
      .string()
      .trim()
      .min(1, { error: "Informe o EPI" })
      .max(200, { error: "Máximo de 200 caracteres" }),
    ca: z
      .string()
      .trim()
      .max(50, { error: "Máximo de 50 caracteres" })
      .optional(),
    quantidade: z
      .number({ error: "Quantidade inválida" })
      .int({ error: "Quantidade precisa ser um número inteiro" })
      .min(1, { error: "A quantidade precisa ser maior que zero" }),
    dataEntrega: z
      .string()
      .trim()
      .regex(DATA_REGEX, { error: "Data de entrega inválida" }),
    dataDevolucao: z
      .string()
      .trim()
      .regex(DATA_REGEX, { error: "Data de devolução inválida" })
      .optional(),
    assinado: z.boolean(),
    observacao: z
      .string()
      .trim()
      .max(500, { error: "Máximo de 500 caracteres" })
      .optional(),
  })
  .refine(
    (dados) => !dados.dataDevolucao || dados.dataDevolucao >= dados.dataEntrega,
    {
      error: "A devolução não pode ser antes da entrega",
      path: ["dataDevolucao"],
    },
  );

export type EpiInput = z.infer<typeof epiSchema>;

/** Schema do formulário (client). Quantidade como string; assinado booleano. */
export const epiFormSchema = z.object({
  colaboradorId: z.uuid({ error: "Selecione o colaborador" }),
  descricao: z
    .string()
    .trim()
    .min(1, { error: "Informe o EPI" })
    .max(200, { error: "Máximo de 200 caracteres" }),
  ca: z.string().trim().max(50, { error: "Máximo de 50 caracteres" }),
  quantidade: z
    .string()
    .trim()
    .refine((valor) => quantidadeValida(valor), {
      error: "Informe a quantidade (inteiro maior que zero)",
    }),
  dataEntrega: z
    .string()
    .trim()
    .regex(DATA_REGEX, { error: "Informe a data de entrega" }),
  dataDevolucao: z.string().trim(),
  assinado: z.boolean(),
  observacao: z.string().trim().max(500, { error: "Máximo de 500 caracteres" }),
});

export type EpiFormInput = z.infer<typeof epiFormSchema>;

/** String representa um inteiro finito maior que zero. */
export function quantidadeValida(valor: string): boolean {
  const limpo = valor.trim();
  if (limpo === "") return false;
  const numero = Number(limpo);
  return Number.isInteger(numero) && numero > 0;
}

/** Converte o formulário (strings) no input de servidor (números coeridos). */
export function epiFormParaInput(dados: EpiFormInput): EpiInput {
  return {
    colaboradorId: dados.colaboradorId,
    descricao: dados.descricao,
    ca: dados.ca === "" ? undefined : dados.ca,
    quantidade: Number(dados.quantidade.trim()),
    dataEntrega: dados.dataEntrega,
    dataDevolucao: dados.dataDevolucao === "" ? undefined : dados.dataDevolucao,
    assinado: dados.assinado,
    observacao: dados.observacao === "" ? undefined : dados.observacao,
  };
}
