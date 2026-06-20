import { z } from "zod";

import {
  numeroPositivo,
  paraNumero,
  quantidadeValida,
} from "@/modules/estoque/_shared/numero";

/** Data opcional yyyy-MM-dd; string vazia vira undefined. */
const dataOpcionalSchema = z
  .string()
  .trim()
  .optional()
  .refine(
    (valor) =>
      valor === undefined || valor === "" || /^\d{4}-\d{2}-\d{2}$/.test(valor),
    { error: "Data inválida" },
  )
  .transform((valor) =>
    valor === undefined || valor === "" ? undefined : valor,
  );

/**
 * Schema de servidor da transferência de estoque (tipos já coeridos), validado
 * na action antes de chamar fn_estoque_transferencia. Origem e destino têm de
 * ser depósitos diferentes.
 */
export const transferenciaSchema = z
  .object({
    insumoId: z.uuid({ error: "Selecione o insumo" }),
    origemId: z.uuid({ error: "Selecione o depósito de origem" }),
    destinoId: z.uuid({ error: "Selecione o depósito de destino" }),
    quantidade: z
      .number({ error: "Quantidade inválida" })
      .refine((v) => v > 0, {
        error: "A quantidade precisa ser maior que zero",
      })
      .refine(quantidadeValida, { error: "Quantidade inválida (até 3 casas)" }),
    data: dataOpcionalSchema,
    observacao: z
      .string()
      .trim()
      .max(500, { error: "Máximo de 500 caracteres" })
      .optional(),
  })
  .refine((d) => d.origemId !== d.destinoId, {
    error: "Origem e destino devem ser diferentes",
    path: ["destinoId"],
  });

export type TransferenciaInput = z.infer<typeof transferenciaSchema>;

/**
 * Schema do formulário (client). Quantidade como string pt-BR para casar com
 * os inputs do react-hook-form; a coerção real é no submit.
 */
export const transferenciaFormSchema = z
  .object({
    insumoId: z.uuid({ error: "Selecione o insumo" }),
    origemId: z.uuid({ error: "Selecione o depósito de origem" }),
    destinoId: z.uuid({ error: "Selecione o depósito de destino" }),
    quantidade: z
      .string()
      .trim()
      .refine(numeroPositivo, {
        error: "Informe uma quantidade maior que zero",
      }),
    data: z.string().trim(),
    observacao: z
      .string()
      .trim()
      .max(500, { error: "Máximo de 500 caracteres" }),
  })
  .refine((d) => d.origemId !== d.destinoId, {
    error: "Origem e destino devem ser diferentes",
    path: ["destinoId"],
  });

export type TransferenciaFormInput = z.infer<typeof transferenciaFormSchema>;

/** Converte o formulário (strings) no input de servidor (números coeridos). */
export function transferenciaFormParaInput(
  dados: TransferenciaFormInput,
): TransferenciaInput {
  return {
    insumoId: dados.insumoId,
    origemId: dados.origemId,
    destinoId: dados.destinoId,
    quantidade: paraNumero(dados.quantidade),
    data: dados.data === "" ? undefined : dados.data,
    observacao: dados.observacao === "" ? undefined : dados.observacao,
  };
}
