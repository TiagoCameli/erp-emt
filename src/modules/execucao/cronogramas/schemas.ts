import { z } from "zod";

import { CRITERIOS_PESO } from "@/modules/execucao/_shared/rotulos";

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

/** Dados do cronograma (cabeçalho). A obra e o calendário não mudam por aqui. */
export const cronogramaSchema = z.object({
  codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{0,19}$/, "Código: até 20 letras, números ou hífen, sem espaço"),
  nome: z.string().trim().min(2, "Informe o nome").max(160),
  dataInicio: data,
  dataCorte: z.union([data, z.literal("")]).optional(),
  criterioPeso: z.enum(CRITERIOS_PESO),
  observacoes: z.string().trim().max(2000).optional(),
});
export type CronogramaInput = z.input<typeof cronogramaSchema>;

export function payloadDoCronograma(d: z.output<typeof cronogramaSchema>) {
  return {
    codigo: d.codigo,
    nome: d.nome,
    data_inicio: d.dataInicio,
    data_corte: d.dataCorte || null,
    criterio_peso: d.criterioPeso,
    observacoes: d.observacoes || null,
  };
}

export const motivoSchema = z.string().trim().min(3, "Informe o motivo");
