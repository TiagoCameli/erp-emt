import { z } from "zod";

import {
  custoUnitarioValido,
  numeroNaoNegativo,
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
 * Schema de servidor da entrada manual de estoque (tipos já coeridos),
 * validado na action antes de chamar fn_estoque_entrada.
 */
export const entradaSchema = z.object({
  insumoId: z.uuid({ error: "Selecione o insumo" }),
  depositoId: z.uuid({ error: "Selecione o depósito" }),
  quantidade: z
    .number({ error: "Quantidade inválida" })
    .refine((v) => v > 0, { error: "A quantidade precisa ser maior que zero" })
    .refine(quantidadeValida, { error: "Quantidade inválida (até 3 casas)" }),
  custoUnitario: z
    .number({ error: "Custo inválido" })
    .refine(custoUnitarioValido, { error: "Custo inválido (até 4 casas)" }),
  data: dataOpcionalSchema,
  observacao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" })
    .optional(),
});

export type EntradaInput = z.infer<typeof entradaSchema>;

/**
 * Schema do formulário (client). Quantidade e custo como string pt-BR para
 * casar com os inputs do react-hook-form; a coerção real é no submit.
 */
export const entradaFormSchema = z.object({
  insumoId: z.uuid({ error: "Selecione o insumo" }),
  depositoId: z.uuid({ error: "Selecione o depósito" }),
  quantidade: z
    .string()
    .trim()
    .refine(numeroPositivo, { error: "Informe uma quantidade maior que zero" }),
  custoUnitario: z
    .string()
    .trim()
    .refine(numeroNaoNegativo, { error: "Informe um custo válido" }),
  data: z.string().trim(),
  observacao: z.string().trim().max(500, { error: "Máximo de 500 caracteres" }),
});

export type EntradaFormInput = z.infer<typeof entradaFormSchema>;

/** Converte o formulário (strings) no input de servidor (números coeridos). */
export function entradaFormParaInput(dados: EntradaFormInput): EntradaInput {
  return {
    insumoId: dados.insumoId,
    depositoId: dados.depositoId,
    quantidade: paraNumero(dados.quantidade),
    custoUnitario: paraNumero(dados.custoUnitario),
    data: dados.data === "" ? undefined : dados.data,
    observacao: dados.observacao === "" ? undefined : dados.observacao,
  };
}
