import { z } from "zod";

import { percentualSchema } from "@/modules/rh/percentual";

/** Provisão mensal de 13º e férias: percentual do salário lançado como custo. */
export const provisaoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(60, { error: "Máximo de 60 caracteres" }),
  /**
   * Zero é recusado aqui de propósito, ao contrário do encargo: o check da
   * coluna é `percentual > 0` e provisão de 0% só sujaria o snapshot com
   * linha de valor zero. Desligar uma provisão é `ativo = false`.
   */
  percentual: percentualSchema.refine((valor) => valor > 0, {
    error: "O percentual precisa ser maior que zero",
  }),
  ativo: z.boolean().default(true),
});

/** Saída validada (percentual já número): use nas server actions. */
export type ProvisaoInput = z.infer<typeof provisaoSchema>;

/** Entrada do formulário (percentual como string): use no react-hook-form. */
export type ProvisaoFormInput = z.input<typeof provisaoSchema>;
