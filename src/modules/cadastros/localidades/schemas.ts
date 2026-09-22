import { z } from "zod";

/** Schema do formulário de localidade (origem e destino do frete). */
export const localidadeSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(120, { error: "O nome pode ter no máximo 120 caracteres" }),
  endereco: z
    .string()
    .trim()
    .max(300, { error: "O endereço pode ter no máximo 300 caracteres" }),
  ativo: z.boolean().default(true),
});

/** Saída validada (ativo já resolvido para boolean): use nas server actions. */
export type LocalidadeInput = z.infer<typeof localidadeSchema>;

/** Entrada do formulário (ativo opcional por causa do default): use no react-hook-form. */
export type LocalidadeFormInput = z.input<typeof localidadeSchema>;
