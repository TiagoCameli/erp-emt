import { z } from "zod";

import { idSchemaCom } from "@/lib/id";

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
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .refine((valor) => !/^\d+$/.test(valor), {
      error: "Nome do insumo não pode ser só números",
    }),
  categoriaId: idSchemaCom("Selecione uma categoria"),
  /*
   * A categoria de CUSTO saiu do insumo em 28/08/2026. Ela é da SUBCATEGORIA
   * agora (`categorias_insumo.categoria_financeira_id`), configurada uma vez para
   * todos os insumos dela. Campo que a tela não desenha não pode ser campo do
   * schema: com ele aqui, salvar um insumo morreria calado.
   */
  unidadeId: idSchemaCom("Selecione uma unidade de medida"),
  descricao: z.string().trim().optional().or(z.literal("")),
  ativo: z.boolean().default(true),
});

export type InsumoInput = z.infer<typeof insumoSchema>;
