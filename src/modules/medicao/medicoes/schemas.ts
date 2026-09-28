import { z } from "zod";

import { idSchemaCom } from "@/lib/id";

/** "yyyy-mm-dd", o mesmo formato do `type="date"` do navegador e da coluna `date` do banco. */
export const dataMedicaoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

/**
 * Só o período (o que o formulário do drawer edita). A comparação de string funciona porque as
 * duas datas chegam sempre em "yyyy-mm-dd": a ordem lexicográfica é a ordem cronológica.
 */
export const periodoMedicaoSchema = z
  .object({
    inicio: dataMedicaoSchema,
    fim: dataMedicaoSchema,
  })
  .refine((p) => p.fim >= p.inicio, {
    message: "O fim tem de ser igual ou depois do início",
    path: ["fim"],
  });

export type PeriodoMedicaoInput = z.infer<typeof periodoMedicaoSchema>;

/** Payload de `abrirMedicao`: o período + o contrato, validado de novo no servidor. */
export const abrirMedicaoSchema = z
  .object({
    contratoId: idSchemaCom("Escolha o contrato"),
    inicio: dataMedicaoSchema,
    fim: dataMedicaoSchema,
  })
  .refine((d) => d.fim >= d.inicio, {
    message: "O fim tem de ser igual ou depois do início",
    path: ["fim"],
  });

export type AbrirMedicaoInput = z.infer<typeof abrirMedicaoSchema>;
