import { z } from "zod";

import { idSchema } from "@/lib/id";

/**
 * Entradas das ações de Anomalias. Módulo puro (tela e action).
 *
 * A chave da anomalia é o id determinístico da detecção (D1-<saída>,
 * D4-<ids>...). O formato é conferido aqui para a conferência não gravar uma
 * chave que nenhuma anomalia jamais vai ter.
 */

const CHAVE_ANOMALIA = /^D[1-5]-[0-9a-f-]+$/i;

export const MAXIMO_MOTIVO = 500;

const textoOpcional = z
  .string()
  .trim()
  .max(MAXIMO_MOTIVO, { error: `No máximo ${MAXIMO_MOTIVO} caracteres` })
  .nullable()
  .optional()
  .transform((valor) => (valor ? valor : null));

export const conferirAnomaliaSchema = z.strictObject({
  chave: z
    .string()
    .trim()
    .max(2000, { error: "Anomalia inválida" })
    .regex(CHAVE_ANOMALIA, { error: "Anomalia inválida" }),
  conferida: z.boolean(),
  motivo: textoOpcional,
});
export type ConferirAnomaliaInput = z.input<typeof conferirAnomaliaSchema>;

export const revisarSemSuprimentoSchema = z.strictObject({
  saidaId: idSchema,
  revisado: z.boolean(),
  observacao: textoOpcional,
});
export type RevisarSemSuprimentoInput = z.input<typeof revisarSemSuprimentoSchema>;

/** Filtro de situação das duas listas. */
export const SITUACOES = ["pendentes", "conferidas", "todas"] as const;
export type Situacao = (typeof SITUACOES)[number];

export function situacaoDaUrl(valor: string | string[] | undefined): Situacao {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return (SITUACOES as readonly string[]).includes(texto ?? "") ? (texto as Situacao) : "pendentes";
}
