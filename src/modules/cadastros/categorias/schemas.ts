import { z } from "zod";

/** Tipos válidos de categoria de insumo (coluna tipo). */
export const TIPOS_CATEGORIA = [
  "material",
  "peca",
  "oleo",
  "combustivel",
  "betuminoso",
  "servico",
] as const;

export type TipoCategoria = (typeof TIPOS_CATEGORIA)[number];

/** Rótulos em pt-BR de cada tipo, para exibição e filtro. */
export const ROTULO_TIPO_CATEGORIA: Record<TipoCategoria, string> = {
  material: "Material",
  peca: "Peça",
  oleo: "Óleo",
  combustivel: "Combustível",
  betuminoso: "Betuminoso",
  servico: "Serviço",
};

/** Schema do formulário de categoria de insumo. */
export const categoriaSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(120, { error: "O nome pode ter no máximo 120 caracteres" }),
  tipo: z.enum(TIPOS_CATEGORIA, { error: "Escolha um tipo válido" }),
  ativo: z.boolean().default(true),
});

export type CategoriaInput = z.infer<typeof categoriaSchema>;
