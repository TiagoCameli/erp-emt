import { z } from "zod";

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
 * casa com a fatura. Bandeira, banco e os dois dias são opcionais: servem para
 * conferência depois e ninguém tem essa informação à mão no meio de uma compra.
 */
export const cartaoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(80, { error: "O nome pode ter no máximo 80 caracteres" }),
  ultimosDigitos: digitosSchema,
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

/**
 * O cartão que o texto digitado no combo descreve, para o cadastro rápido feito
 * de dentro da OC ou do lançamento.
 *
 * O texto PRECISA trazer os quatro dígitos: é o que identifica o cartão, e não
 * há de onde inferir. "Cartão obra 7712" vira nome "Cartão obra 7712" com final
 * 7712; "7712" sozinho vira "Cartão 7712". Sem quatro dígitos devolve null, e a
 * action recusa com a instrução — melhor do que nascer um cartão que não
 * identifica nada.
 *
 * Mora aqui e não na action porque é regra, não efeito: assim tem teste.
 */
export function cartaoDoTextoRapido(
  texto: string,
): { nome: string; ultimosDigitos: string } | null {
  const limpo = texto.trim();
  // O ÚLTIMO grupo de 4+ dígitos: "Cartão 2 final 4829" tem que dar 4829, não 2.
  const grupos = limpo.match(/\d{4,}/g);
  const ultimosDigitos = grupos?.[grupos.length - 1]?.slice(-4) ?? "";
  if (ultimosDigitos.length !== 4) return null;

  return {
    nome: /^\d+$/.test(limpo) ? `Cartão ${ultimosDigitos}` : limpo,
    ultimosDigitos,
  };
}
