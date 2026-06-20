import { z } from "zod";

import {
  numeroNaoNegativo,
  paraNumero,
  quantidadeValida,
} from "@/modules/estoque/_shared/numero";

/**
 * Schema de servidor do mínimo (tipos já coeridos), validado na action antes
 * do upsert em estoque_minimos.
 */
export const minimoSchema = z.object({
  insumoId: z.uuid({ error: "Selecione o insumo" }),
  depositoId: z.uuid({ error: "Selecione o depósito" }),
  minimo: z
    .number({ error: "Mínimo inválido" })
    .refine((v) => v >= 0, { error: "Mínimo inválido" })
    .refine(quantidadeValida, { error: "Mínimo inválido" }),
});

export type MinimoInput = z.infer<typeof minimoSchema>;

/**
 * Schema do formulário (client). O mínimo entra como string pt-BR pra casar
 * com o input do react-hook-form; a coerção real é no submit.
 */
export const minimoFormSchema = z.object({
  insumoId: z.uuid({ error: "Selecione o insumo" }),
  depositoId: z.uuid({ error: "Selecione o depósito" }),
  minimo: z
    .string()
    .trim()
    .refine(numeroNaoNegativo, { error: "Informe um mínimo válido" }),
});

export type MinimoFormInput = z.infer<typeof minimoFormSchema>;

/** Converte o formulário (strings) no input de servidor (número coerido). */
export function minimoFormParaInput(dados: MinimoFormInput): MinimoInput {
  return {
    insumoId: dados.insumoId,
    depositoId: dados.depositoId,
    minimo: paraNumero(dados.minimo),
  };
}
