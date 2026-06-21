import { z } from "zod";

import {
  encargosPercentualValido,
  numeroNaoNegativo,
  paraNumero,
} from "@/modules/rh/folha/numero";

/* ------------------------------------------------------------------ */
/* Gerar folha                                                        */
/* ------------------------------------------------------------------ */

/** Competência da folha: 1º dia do mês, yyyy-MM-01, obrigatória. */
const competenciaSchema = z
  .string()
  .trim()
  .refine((valor) => /^\d{4}-\d{2}-01$/.test(valor), {
    error: "Informe a competência (mês)",
  });

/** Schema de servidor da geração da folha (tipos já coeridos). */
export const gerarFolhaSchema = z.object({
  competencia: competenciaSchema,
  encargosPercentual: z
    .number({ error: "Percentual de encargos inválido" })
    .refine(encargosPercentualValido, {
      error: "Encargos inválidos (não negativo, até 2 casas, máximo 999,99)",
    }),
});

export type GerarFolhaInput = z.infer<typeof gerarFolhaSchema>;

/** Schema do formulário (client): percentual como string pt-BR, mês yyyy-MM. */
export const gerarFolhaFormSchema = z.object({
  /** Mês do input type="month" (yyyy-MM). Vira yyyy-MM-01 no input de servidor. */
  competencia: z
    .string()
    .trim()
    .refine((valor) => /^\d{4}-\d{2}$/.test(valor), {
      error: "Informe o mês da competência",
    }),
  encargosPercentual: z
    .string()
    .trim()
    .refine(numeroNaoNegativo, {
      error: "Informe um percentual de encargos válido",
    }),
});

export type GerarFolhaFormInput = z.infer<typeof gerarFolhaFormSchema>;

/** Converte o formulário da folha no input de servidor (número coerido). */
export function gerarFolhaFormParaInput(
  dados: GerarFolhaFormInput,
): GerarFolhaInput {
  return {
    competencia: `${dados.competencia}-01`,
    encargosPercentual: paraNumero(dados.encargosPercentual),
  };
}
