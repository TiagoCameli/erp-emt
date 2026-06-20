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
 * Schema de servidor da saída/consumo de estoque (tipos já coeridos),
 * validado na action antes de chamar fn_estoque_saida. O centro de custo é
 * obrigatório: toda saída de consumo precisa de um destino contábil.
 */
export const saidaSchema = z.object({
  insumoId: z.uuid({ error: "Selecione o insumo" }),
  depositoId: z.uuid({ error: "Selecione o depósito" }),
  quantidade: z
    .number({ error: "Quantidade inválida" })
    .refine((v) => v > 0, { error: "A quantidade precisa ser maior que zero" })
    .refine(quantidadeValida, { error: "Quantidade inválida (até 3 casas)" }),
  centroCustoId: z.uuid({ error: "Informe o centro de custo do consumo" }),
  data: dataOpcionalSchema,
  observacao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" })
    .optional(),
});

export type SaidaInput = z.infer<typeof saidaSchema>;

/**
 * Schema do formulário (client). Quantidade como string pt-BR para casar com
 * os inputs do react-hook-form; a coerção real é no submit.
 */
export const saidaFormSchema = z.object({
  insumoId: z.uuid({ error: "Selecione o insumo" }),
  depositoId: z.uuid({ error: "Selecione o depósito" }),
  quantidade: z
    .string()
    .trim()
    .refine(numeroPositivo, { error: "Informe uma quantidade maior que zero" }),
  centroCustoId: z.uuid({ error: "Informe o centro de custo do consumo" }),
  data: z.string().trim(),
  observacao: z.string().trim().max(500, { error: "Máximo de 500 caracteres" }),
});

export type SaidaFormInput = z.infer<typeof saidaFormSchema>;

/** Converte o formulário (strings) no input de servidor (números coeridos). */
export function saidaFormParaInput(dados: SaidaFormInput): SaidaInput {
  return {
    insumoId: dados.insumoId,
    depositoId: dados.depositoId,
    quantidade: paraNumero(dados.quantidade),
    centroCustoId: dados.centroCustoId,
    data: dados.data === "" ? undefined : dados.data,
    observacao: dados.observacao === "" ? undefined : dados.observacao,
  };
}
