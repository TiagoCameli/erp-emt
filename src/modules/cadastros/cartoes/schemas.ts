import { z } from "zod";

import { idSchemaCom } from "@/lib/id";

/**
 * Os quatro últimos dígitos, e só eles.
 *
 * Aceita o que a pessoa colar com ruído ("**** 4829", "final 4829") e guarda os
 * dígitos limpos: o campo da tela já filtra a digitação, mas colar não passa
 * pelo `onKeyDown`. A RPC no banco repete esta normalização, porque a fronteira
 * de verdade é lá.
 *
 * Quatro é o teto de propósito. Número de cartão inteiro é dado de pagamento e
 * não tem por que existir num ERP de obra.
 */
const digitosSchema = z
  .string()
  .trim()
  .transform((valor) => valor.replace(/\D/g, ""))
  .refine((valor) => valor.length === 4, {
    error: "Informe os quatro últimos dígitos do cartão",
  });

/** Dia do mês (fechamento, vencimento). Vazio vale "não sei", não zero. */
const diaSchema = z
  .string()
  .trim()
  .refine(
    (valor) => {
      if (valor === "") return true;
      const numero = Number(valor);
      return Number.isInteger(numero) && numero >= 1 && numero <= 31;
    },
    { error: "Informe um dia entre 1 e 31" },
  );

/**
 * Schema do cartão de crédito.
 *
 * O apelido é o que a pessoa lê na hora de escolher na OC; os dígitos são o que
 * casa com a fatura; a conta é por onde a fatura é paga. Bandeira, banco e os
 * dois dias são opcionais: servem para conferência depois.
 */
export const cartaoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(80, { error: "O nome pode ter no máximo 80 caracteres" }),
  ultimosDigitos: digitosSchema,
  /**
   * A conta bancária do cartão: a fatura dele é paga por ela (pedido do Tiago
   * em 08/10/2026). Uma conta tem vários cartões; um cartão, uma conta só.
   */
  contaBancariaId: idSchemaCom("Escolha a conta bancária do cartão"),
  bandeira: z.string().trim().max(40, { error: "Máximo de 40 caracteres" }),
  banco: z.string().trim().max(80, { error: "Máximo de 80 caracteres" }),
  diaFechamento: diaSchema,
  diaVencimento: diaSchema,
  ativo: z.boolean().default(true),
});

/** Saída validada: use nas server actions. */
export type CartaoInput = z.infer<typeof cartaoSchema>;

/**
 * Entrada do formulário: use no react-hook-form.
 *
 * `ativo` tem default e os dígitos têm transform, então entrada e saída são
 * tipos DIFERENTES. Tratar os dois como um só é o que faz o `useForm` reclamar
 * de campo obrigatório que a tela preenche.
 */
export type CartaoFormInput = z.input<typeof cartaoSchema>;

/**
 * "Cartão obra (7712)".
 *
 * O rótulo que aparece no combo da OC e do lançamento, e na tela do documento.
 * Vive aqui, e não em cada tela, porque a mesma string precisa aparecer igual no
 * formulário, no detalhe e no espelho impresso.
 */
export function rotuloDoCartao(cartao: {
  nome: string;
  ultimosDigitos: string;
}): string {
  return `${cartao.nome} (${cartao.ultimosDigitos})`;
}
