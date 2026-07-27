import { z } from "zod";

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

/**
 * Schema de servidor da geração da folha. Os encargos deixaram de ser um % global
 * digitado: agora vêm discriminados da config (folha_encargos ativos) dentro da
 * fn_gerar_folha, então a geração só precisa da competência.
 */
export const gerarFolhaSchema = z.object({
  competencia: competenciaSchema,
});

export type GerarFolhaInput = z.infer<typeof gerarFolhaSchema>;

/** Schema do formulário (client): mês yyyy-MM. */
export const gerarFolhaFormSchema = z.object({
  /** Mês do input type="month" (yyyy-MM). Vira yyyy-MM-01 no input de servidor. */
  competencia: z
    .string()
    .trim()
    .refine((valor) => /^\d{4}-\d{2}$/.test(valor), {
      error: "Informe o mês da competência",
    }),
});

export type GerarFolhaFormInput = z.infer<typeof gerarFolhaFormSchema>;

/** Converte o formulário da folha no input de servidor. */
export function gerarFolhaFormParaInput(
  dados: GerarFolhaFormInput,
): GerarFolhaInput {
  return {
    competencia: `${dados.competencia}-01`,
  };
}
