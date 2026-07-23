import { z } from "zod";

/** Data de programação: "YYYY-MM-DD" válido, sem hora nem fuso. */
export const dataProgramadaSchema = z.iso.date();

export type DataProgramada = z.infer<typeof dataProgramadaSchema>;
