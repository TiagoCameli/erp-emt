import { z } from "zod";

import {
  numeroNaoNegativo,
  paraNumero,
  quantidadeValida,
} from "@/modules/estoque/_shared/numero";

/**
 * Schema de servidor do ajuste de inventário (tipos já coeridos), validado na
 * action antes de chamar fn_estoque_ajuste. A quantidade nova é a contagem
 * física (>= 0) e o motivo é obrigatório (fica auditado na observação).
 */
export const ajusteSchema = z.object({
  insumoId: z.uuid({ error: "Selecione o insumo" }),
  depositoId: z.uuid({ error: "Selecione o depósito" }),
  quantidadeNova: z
    .number({ error: "Quantidade inválida" })
    .refine((v) => v >= 0, {
      error: "A quantidade não pode ser negativa",
    })
    .refine(quantidadeValida, { error: "Quantidade inválida (até 3 casas)" }),
  motivo: z
    .string()
    .trim()
    .min(1, { error: "Informe o motivo do ajuste" })
    .max(500, { error: "Máximo de 500 caracteres" }),
});

export type AjusteInput = z.infer<typeof ajusteSchema>;

/**
 * Schema do formulário (client). Quantidade como string pt-BR para casar com
 * os inputs do react-hook-form; a coerção real é no submit.
 */
export const ajusteFormSchema = z.object({
  insumoId: z.uuid({ error: "Selecione o insumo" }),
  depositoId: z.uuid({ error: "Selecione o depósito" }),
  quantidadeNova: z
    .string()
    .trim()
    .refine(numeroNaoNegativo, { error: "Informe uma quantidade válida" }),
  motivo: z
    .string()
    .trim()
    .min(1, { error: "Informe o motivo do ajuste" })
    .max(500, { error: "Máximo de 500 caracteres" }),
});

export type AjusteFormInput = z.infer<typeof ajusteFormSchema>;

/** Converte o formulário (strings) no input de servidor (números coeridos). */
export function ajusteFormParaInput(dados: AjusteFormInput): AjusteInput {
  return {
    insumoId: dados.insumoId,
    depositoId: dados.depositoId,
    quantidadeNova: paraNumero(dados.quantidadeNova),
    motivo: dados.motivo,
  };
}
