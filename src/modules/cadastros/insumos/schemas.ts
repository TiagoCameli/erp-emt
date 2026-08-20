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
  /**
   * Categoria de custo (categoria FINANCEIRA, a do DRE). Obrigatória porque
   * `fn_aprovar_ordem_compra` recusa a OC que tenha um item sem ela — e não
   * havia tela nenhuma para preencher, então a compra travava sem saída.
   */
  categoriaCustoId: idSchemaCom("Selecione uma categoria de custo"),
  unidadeId: idSchemaCom("Selecione uma unidade de medida"),
  descricao: z.string().trim().optional().or(z.literal("")),
  ativo: z.boolean().default(true),
});

export type InsumoInput = z.infer<typeof insumoSchema>;
