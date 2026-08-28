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
  /**
   * Categoria de custo (a do DRE) de tudo que estiver nesta subcategoria.
   *
   * Passou a morar aqui em 28/08/2026, quando saiu do insumo: eram 3.391 insumos
   * carregando um campo que 28 subcategorias já determinavam, e as divergências
   * eram sujeira (283 insumos de Hidráulica em "Materiais de construção" contra
   * 21 espalhados em outras três).
   *
   * Aceita vazio, e vazio NÃO é um erro de digitação: é a subcategoria nova que
   * ainda não foi classificada. Quem cobra é a aprovação da OC, que recusa a
   * ordem, e a tela da OC avisa antes. Exigir aqui impediria de cadastrar a
   * subcategoria antes de decidir onde ela entra no DRE.
   */
  categoriaCustoId: z.string().trim(),
  ativo: z.boolean().default(true),
});

export type CategoriaInput = z.infer<typeof categoriaSchema>;

/** Entrada do formulário (ativo tem default): use no react-hook-form. */
export type CategoriaFormInput = z.input<typeof categoriaSchema>;
