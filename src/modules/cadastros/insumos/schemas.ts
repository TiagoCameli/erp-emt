import { z } from "zod";

/** Schema do formulário de insumo (criação e edição). */
export const insumoSchema = z.object({
  codigo: z
    .string()
    .trim()
    .max(50, { error: "O código pode ter no máximo 50 caracteres" })
    .optional()
    .or(z.literal("")),
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" }),
  categoriaId: z.uuid({ error: "Selecione uma categoria" }),
  unidadeId: z.uuid({ error: "Selecione uma unidade de medida" }),
  descricao: z.string().trim().optional().or(z.literal("")),
  ativo: z.boolean().default(true),
});

export type InsumoInput = z.infer<typeof insumoSchema>;
