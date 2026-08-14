import { z } from "zod";

import { percentualSchema } from "@/modules/rh/percentual";

/**
 * Menor percentual positivo que a coluna `numeric(6,3)` representa. Piso
 * explícito (fix round 1 da Task 1): antes, `valor > 0` sozinho deixava
 * passar algo como `1e-7`, que a coluna arredonda para `0.000` e o check
 * `percentual > 0` do banco rejeitava como erro genérico de "23514" em vez
 * de mensagem de campo — a extração de percentual.ts já fecha esse caso
 * específico (`casasDecimais` conta certo a notação exponencial), mas o piso
 * documenta a regra de negócio de forma independente de como o número foi
 * digitado.
 */
const PERCENTUAL_MINIMO = 0.001;

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
  percentual: percentualSchema.refine((valor) => valor >= PERCENTUAL_MINIMO, {
    error: "O percentual precisa ser de pelo menos 0,001",
  }),
  ativo: z.boolean().default(true),
});

/** Saída validada (percentual já número): use nas server actions. */
export type ProvisaoInput = z.infer<typeof provisaoSchema>;

/** Entrada do formulário (percentual como string): use no react-hook-form. */
export type ProvisaoFormInput = z.input<typeof provisaoSchema>;
