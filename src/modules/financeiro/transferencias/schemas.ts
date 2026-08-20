import { z } from "zod";

import { idSchemaCom } from "@/lib/id";

/**
 * Schemas da aba Financeiro > Transferências entre contas.
 *
 * Transferência NÃO é lançamento: ela mexe em saldo de conta, não em resultado.
 * Por isso não há centro de custo, categoria nem mês de competência aqui — o
 * porquê está na migration 20260820210000_transferencia_entre_contas.sql.
 */

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Schema do SERVIDOR: o valor já chega como número, porque a conversão de
 * "1.234,56" para 1234.56 acontece no cliente, com o mesmo `paraNumero` que o
 * resto do app usa.
 */
export const transferenciaSchema = z
  .object({
    contaOrigemId: idSchemaCom("Selecione a conta de origem"),
    contaDestinoId: idSchemaCom("Selecione a conta de destino"),
    dataTransferencia: z
      .string()
      .trim()
      .regex(DATA_ISO, { error: "Informe a data da transferência" }),
    valor: z
      .number({ error: "Valor inválido" })
      .positive({ error: "O valor precisa ser maior que zero" })
      .max(9999999999.99, { error: "Valor acima do permitido" }),
    tarifa: z
      .number({ error: "Tarifa inválida" })
      .min(0, { error: "A tarifa não pode ser negativa" })
      .max(9999999999.99, { error: "Tarifa acima do permitido" }),
    descricao: z
      .string()
      .trim()
      .max(200, { error: "Máximo de 200 caracteres" })
      .optional(),
    observacoes: z
      .string()
      .trim()
      .max(1000, { error: "Máximo de 1000 caracteres" })
      .optional(),
  })
  // A mesma trava do CHECK da tabela e da RPC. Aqui ela existe para a pessoa
  // ver a mensagem no campo, em vez de receber o erro cru do Postgres.
  .refine((dados) => dados.contaOrigemId !== dados.contaDestinoId, {
    error: "A conta de destino precisa ser diferente da de origem",
    path: ["contaDestinoId"],
  });

export type TransferenciaInput = z.infer<typeof transferenciaSchema>;

/**
 * Schema do FORMULÁRIO (client). Valor e tarifa continuam string porque é isso
 * que o InputMoeda guarda ("1234,56"); manter o tipo do campo igual ao que o
 * input escreve é o que faz input e output do react-hook-form baterem.
 *
 * Campo de texto opcional é declarado obrigatório aceitando vazio, e não
 * `.optional()`: com `.optional()` o input do zod difere do output e o resolver
 * do react-hook-form passa a reclamar de um campo que a pessoa nem viu.
 */
export const transferenciaFormSchema = z
  .object({
    contaOrigemId: idSchemaCom("Selecione a conta de origem"),
    contaDestinoId: idSchemaCom("Selecione a conta de destino"),
    dataTransferencia: z
      .string()
      .trim()
      .regex(DATA_ISO, { error: "Informe a data da transferência" }),
    valor: z
      .string()
      .trim()
      .min(1, { error: "Informe o valor da transferência" }),
    tarifa: z.string().trim(),
    descricao: z
      .string()
      .trim()
      .max(200, { error: "Máximo de 200 caracteres" }),
    observacoes: z
      .string()
      .trim()
      .max(1000, { error: "Máximo de 1000 caracteres" }),
  })
  .refine((dados) => dados.contaOrigemId !== dados.contaDestinoId, {
    error: "A conta de destino precisa ser diferente da de origem",
    path: ["contaDestinoId"],
  });

export type TransferenciaFormInput = z.infer<typeof transferenciaFormSchema>;
