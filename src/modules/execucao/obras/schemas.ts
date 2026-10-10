import { z } from "zod";

import { idSchema } from "@/lib/id";
import { lerNumeroColado } from "@/modules/execucao/_shared/numero";
import { CRITERIOS_PESO, LADOS, TIPOS_LOCAL, TIPOS_OBRA } from "@/modules/execucao/_shared/rotulos";

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const textoOpcional = (max: number) => z.string().trim().max(max).optional();
/** Número digitado (pt-BR) em texto; sai no formato do banco ("1234.5") ou vazio. */
const numeroOpcional = z
  .string()
  .optional()
  .transform((t, ctx) => {
    const lido = lerNumeroColado(t ?? "");
    if (!lido.ok) {
      ctx.addIssue({ code: "custom", message: lido.erro });
      return z.NEVER;
    }
    return lido.valor;
  });

export const novoCronogramaSchema = z.object({
  obraId: idSchema,
  tipoObra: z.enum(TIPOS_OBRA).optional(),
  codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{0,19}$/, "Código: até 20 letras, números ou hífen, sem espaço"),
  nome: z.string().trim().min(2, "Informe o nome").max(160),
  dataInicio: data,
  calendarioModeloId: idSchema.optional(),
  criterioPeso: z.enum(CRITERIOS_PESO),
  observacoes: textoOpcional(2000),
});
export type NovoCronogramaInput = z.input<typeof novoCronogramaSchema>;

export function payloadDoNovoCronograma(d: z.output<typeof novoCronogramaSchema>) {
  return {
    obra_id: d.obraId,
    tipo_obra: d.tipoObra ?? null,
    codigo: d.codigo,
    nome: d.nome,
    data_inicio: d.dataInicio,
    calendario_modelo_id: d.calendarioModeloId ?? null,
    criterio_peso: d.criterioPeso,
    observacoes: d.observacoes || null,
  };
}

export const configurarObraSchema = z
  .object({
    tipoObra: z.enum(TIPOS_OBRA),
    calendarioId: idSchema.optional(),
    kmInicial: numeroOpcional,
    kmFinal: numeroOpcional,
    metrosPorEstaca: numeroOpcional,
    ppcLimite: numeroOpcional,
    observacoes: textoOpcional(2000),
  })
  .refine((d) => d.tipoObra === "rodovia" || (d.kmInicial === null && d.kmFinal === null), {
    message: "Km inicial e final só valem para obra de rodovia",
    path: ["kmInicial"],
  })
  .refine((d) => (d.kmInicial === null) === (d.kmFinal === null), { message: "Informe km inicial e final juntos", path: ["kmFinal"] });
export type ConfigurarObraInput = z.input<typeof configurarObraSchema>;

export function payloadDaObra(d: z.output<typeof configurarObraSchema>) {
  return {
    tipo_obra: d.tipoObra,
    calendario_id: d.calendarioId ?? null,
    km_inicial: d.kmInicial,
    km_final: d.kmFinal,
    metros_por_estaca: d.metrosPorEstaca,
    ppc_limite: d.ppcLimite,
    observacoes: d.observacoes || null,
  };
}

export const localSchema = z
  .object({
    paiId: idSchema.optional(),
    tipo: z.enum(TIPOS_LOCAL),
    codigo: z.string().trim().min(1, "Informe o código").max(30),
    nome: z.string().trim().min(1, "Informe o nome").max(160),
    ordem: z.number().int(),
    kmInicial: numeroOpcional,
    kmFinal: numeroOpcional,
    lado: z.enum(LADOS).optional(),
    faixa: textoOpcional(30),
  })
  .refine((d) => (d.kmInicial === null) === (d.kmFinal === null), { message: "Informe km inicial e final juntos", path: ["kmFinal"] });
export type LocalInput = z.input<typeof localSchema>;

export function payloadDoLocal(d: z.output<typeof localSchema>) {
  return {
    pai_id: d.paiId ?? null,
    tipo: d.tipo,
    codigo: d.codigo,
    nome: d.nome,
    ordem: d.ordem,
    km_inicial: d.kmInicial,
    km_final: d.kmFinal,
    lado: d.lado ?? null,
    faixa: d.faixa || null,
  };
}
