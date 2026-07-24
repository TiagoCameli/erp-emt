import { z } from "zod";

/** Data de programação: "YYYY-MM-DD" válido, sem hora nem fuso. */
export const dataProgramadaSchema = z.iso.date();

export type DataProgramada = z.infer<typeof dataProgramadaSchema>;

/** Schema do formulário do dialog de programar/reprogramar (react-hook-form). */
export const programarPagamentoFormSchema = z.object({
  data: dataProgramadaSchema,
});

export type ProgramarPagamentoFormInput = z.infer<
  typeof programarPagamentoFormSchema
>;
