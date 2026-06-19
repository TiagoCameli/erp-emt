import { z } from "zod";

import type { BancoConta } from "@/modules/financeiro/_shared/formato";

/** Bancos possíveis de uma conta. Igual ao check do banco. */
export const BANCO_CONTA = ["caixa", "bb", "sicredi", "outro"] as const;

/** Tipos de conta possíveis. Igual ao check do banco. */
export const TIPO_CONTA = ["corrente", "poupanca", "caixa"] as const;

export type TipoConta = (typeof TIPO_CONTA)[number];

/** Rótulo pt-BR de cada tipo de conta, para select e exibição. */
export const ROTULO_TIPO_CONTA: Record<TipoConta, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  caixa: "Caixa",
};

/**
 * Schema de conta bancária para o servidor: já coage o número e normaliza
 * texto opcional para null. É o que a action valida antes de gravar.
 */
export const contaSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(120, { error: "Máximo de 120 caracteres" }),
  banco: z.enum(BANCO_CONTA, { error: "Banco inválido" }),
  agencia: z
    .string()
    .trim()
    .max(20, { error: "Máximo de 20 caracteres" })
    .optional()
    .transform((valor) => (valor === "" ? undefined : valor)),
  conta: z
    .string()
    .trim()
    .max(30, { error: "Máximo de 30 caracteres" })
    .optional()
    .transform((valor) => (valor === "" ? undefined : valor)),
  tipo: z.enum(TIPO_CONTA, { error: "Tipo inválido" }),
  saldoInicial: z
    .number({ error: "Saldo inicial inválido" })
    .min(-9999999999.99, { error: "Saldo abaixo do permitido" })
    .max(9999999999.99, { error: "Saldo acima do permitido" }),
  ativo: z.boolean(),
});

export type ContaInput = z.infer<typeof contaSchema>;

/**
 * Schema do formulário (client). Campos texto e o saldo continuam string para
 * casar input e output do react-hook-form. A coerção real (saldo para número,
 * vazio para null) acontece no servidor com contaSchema.
 */
export const contaFormSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(120, { error: "Máximo de 120 caracteres" }),
  banco: z.enum(BANCO_CONTA, { error: "Banco inválido" }),
  agencia: z.string().trim().max(20, { error: "Máximo de 20 caracteres" }),
  conta: z.string().trim().max(30, { error: "Máximo de 30 caracteres" }),
  tipo: z.enum(TIPO_CONTA, { error: "Tipo inválido" }),
  saldoInicial: z
    .string()
    .trim()
    .refine(
      (valor) => valor === "" || !Number.isNaN(Number(valor.replace(",", "."))),
      { error: "Informe um número, ex: 1.000,00" },
    ),
  ativo: z.boolean(),
});

export type ContaFormInput = z.infer<typeof contaFormSchema>;

/** Reexporta o tipo do banco para quem importa só dos schemas da aba. */
export type { BancoConta };
