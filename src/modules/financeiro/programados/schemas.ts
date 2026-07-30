import { z } from "zod";

/** Data de programação: "YYYY-MM-DD" válido, sem hora nem fuso. */
export const dataProgramadaSchema = z.iso.date();

export type DataProgramada = z.infer<typeof dataProgramadaSchema>;

/**
 * Schema do formulário de reprogramar a data autorizada (react-hook-form).
 *
 * O motivo é obrigatório porque a data programada deixou de ser agendamento
 * solto e passou a ser autorização de pagamento: mudar a data é mudar o que foi
 * autorizado, e isso não acontece sem justificativa na trilha. O banco exige o
 * mesmo em `fn_reprogramar_parcela`.
 */
export const reprogramarPagamentoFormSchema = z.object({
  data: dataProgramadaSchema,
  motivo: z
    .string()
    .trim()
    .min(3, "Explique o motivo da reprogramação em pelo menos 3 caracteres"),
});

export type ReprogramarPagamentoFormInput = z.infer<
  typeof reprogramarPagamentoFormSchema
>;
