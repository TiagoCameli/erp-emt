import { z } from "zod";

import { percentualSchema } from "@/modules/rh/percentual";

/** Schema do encargo da folha (INSS patronal, FGTS, RAT/SAT, Terceiros...). */
export const encargoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" }),
  /**
   * Percentual do encargo: obrigatório — diferente das horas de jornada,
   * vazio não vira 0: não existe encargo sem alíquota cadastrada. A validação
   * de formato (pt-BR, 0..100, até 3 casas) vem de percentualSchema,
   * compartilhada com rh/provisoes.
   */
  percentual: percentualSchema,
  ativo: z.boolean().default(true),
  /**
   * Grupo de recolhimento (INSS, FGTS, IRRF...): em qual guia esse encargo
   * patronal entra quando a folha for aprovada (Bloco 8a, Task 4). Ausente
   * (undefined) é o normal, não um erro — encargo sem grupo não vira guia.
   * O componente é um Combobox alimentado pelos grupos já cadastrados (casa
   * por igualdade exata de texto na geração), então "" (nada selecionado)
   * vira `undefined` antes de chegar aqui, no formulário: se chegasse "" até
   * este schema, min(1) rejeitaria e a mensagem confundiria com "obrigatório".
   */
  grupoRecolhimento: z
    .string()
    .trim()
    .min(1, { error: "Informe o grupo ou deixe vazio" })
    .max(60, { error: "Máximo de 60 caracteres" })
    .optional(),
});

/** Saída validada (ativo já resolvido para boolean, percentual já número): use nas server actions. */
export type EncargoInput = z.infer<typeof encargoSchema>;

/** Entrada do formulário (percentual como string, ativo opcional): use no react-hook-form. */
export type EncargoFormInput = z.input<typeof encargoSchema>;
