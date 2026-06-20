import { z } from "zod";

import {
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
 * Schema de servidor do abastecimento (tipos já coeridos), validado na action
 * antes de chamar fn_abastecer. Leitura (horímetro/km), operador, data e
 * observação são opcionais.
 */
export const abastecimentoSchema = z.object({
  tanqueId: z.uuid({ error: "Selecione o tanque" }),
  equipamentoId: z.uuid({ error: "Selecione o equipamento" }),
  quantidade: z
    .number({ error: "Quantidade inválida" })
    .refine((v) => v > 0, { error: "A quantidade precisa ser maior que zero" })
    .refine(quantidadeValida, { error: "Quantidade inválida (até 3 casas)" }),
  horimetro: z
    .number({ error: "Horímetro inválido" })
    .refine((v) => v >= 0, { error: "Horímetro inválido" })
    .optional(),
  km: z
    .number({ error: "Quilometragem inválida" })
    .refine((v) => v >= 0, { error: "Quilometragem inválida" })
    .optional(),
  operadorId: z.uuid({ error: "Operador inválido" }).optional(),
  data: dataOpcionalSchema,
  observacao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" })
    .optional(),
});

export type AbastecimentoInput = z.infer<typeof abastecimentoSchema>;

/**
 * Schema do formulário (client). Números como string pt-BR para casar com os
 * inputs do react-hook-form; campos opcionais aceitam vazio. A coerção real é
 * no submit (abastecimentoFormParaInput).
 */
export const abastecimentoFormSchema = z.object({
  tanqueId: z.uuid({ error: "Selecione o tanque" }),
  equipamentoId: z.uuid({ error: "Selecione o equipamento" }),
  quantidade: z
    .string()
    .trim()
    .refine(numeroPositivo, { error: "Informe uma quantidade maior que zero" }),
  horimetro: z
    .string()
    .trim()
    .refine((v) => v === "" || numeroNaoNegativo(v), {
      error: "Horímetro inválido",
    }),
  km: z
    .string()
    .trim()
    .refine((v) => v === "" || numeroNaoNegativo(v), {
      error: "Quilometragem inválida",
    }),
  operadorId: z.string().trim(),
  data: z.string().trim(),
  observacao: z.string().trim().max(500, { error: "Máximo de 500 caracteres" }),
});

export type AbastecimentoFormInput = z.infer<typeof abastecimentoFormSchema>;

/** Converte o formulário (strings) no input de servidor (números coeridos). */
export function abastecimentoFormParaInput(
  dados: AbastecimentoFormInput,
): AbastecimentoInput {
  return {
    tanqueId: dados.tanqueId,
    equipamentoId: dados.equipamentoId,
    quantidade: paraNumero(dados.quantidade),
    horimetro: dados.horimetro === "" ? undefined : paraNumero(dados.horimetro),
    km: dados.km === "" ? undefined : paraNumero(dados.km),
    operadorId: dados.operadorId === "" ? undefined : dados.operadorId,
    data: dados.data === "" ? undefined : dados.data,
    observacao: dados.observacao === "" ? undefined : dados.observacao,
  };
}
