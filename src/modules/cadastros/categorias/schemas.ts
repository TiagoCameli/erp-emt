import { z } from "zod";

import { idSchemaCom } from "@/lib/id";

/**
 * Schema da subcategoria de insumo. O tipo antigo (material/peca/oleo/...) saiu
 * com a migration 20260729200001: quem agrupa agora é o grupo, e categoria é a
 * subcategoria específica dentro dele.
 */
export const categoriaSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(80, { error: "O nome pode ter no máximo 80 caracteres" }),
  grupoId: idSchemaCom("Escolha o grupo"),
  ativo: z.boolean().default(true),
});

export type CategoriaInput = z.infer<typeof categoriaSchema>;

/** Entrada do formulário (ativo tem default): use no react-hook-form. */
export type CategoriaFormInput = z.input<typeof categoriaSchema>;
