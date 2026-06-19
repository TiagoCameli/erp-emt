import { z } from "zod";

/** Tipos válidos de categoria financeira (plano de contas gerencial). */
export const TIPOS_CATEGORIA_FINANCEIRA = ["receita", "despesa"] as const;

export type TipoCategoriaFinanceira =
  (typeof TIPOS_CATEGORIA_FINANCEIRA)[number];

/** Rótulos em pt-BR de cada tipo, para exibição e filtro. */
export const ROTULO_TIPO_CATEGORIA_FINANCEIRA: Record<
  TipoCategoriaFinanceira,
  string
> = {
  receita: "Receita",
  despesa: "Despesa",
};

/** Schema do formulário de categoria financeira. */
export const categoriaFinanceiraSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(120, { error: "O nome pode ter no máximo 120 caracteres" }),
  tipo: z.enum(TIPOS_CATEGORIA_FINANCEIRA, { error: "Escolha um tipo válido" }),
  paiId: z.uuid({ error: "Categoria pai inválida" }).nullable().default(null),
  ativo: z.boolean().default(true),
});

export type CategoriaFinanceiraInput = z.infer<typeof categoriaFinanceiraSchema>;
