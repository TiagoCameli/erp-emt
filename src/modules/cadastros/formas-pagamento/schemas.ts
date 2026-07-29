import { z } from "zod";

import { TIPOS_FORMA_PAGAMENTO } from "@/modules/_shared/forma-pagamento";

/**
 * Schema da forma de pagamento: nome + tipo + ativo.
 *
 * O tipo não é decoração: é o que decide se o pagamento passa pela fila de
 * aprovação, nasce aprovado (dinheiro) ou nasce quitado (cartão de crédito).
 * Espelha o check de `formas_pagamento.tipo` no banco.
 */
export const formaPagamentoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(80, { error: "O nome pode ter no máximo 80 caracteres" }),
  tipo: z.enum(TIPOS_FORMA_PAGAMENTO, { error: "Escolha o tipo" }),
  ativo: z.boolean().default(true),
});

/** Saída validada: use nas server actions. */
export type FormaPagamentoInput = z.infer<typeof formaPagamentoSchema>;

/** Entrada do formulário (ativo tem default): use no react-hook-form. */
export type FormaPagamentoFormInput = z.input<typeof formaPagamentoSchema>;
