import { z } from "zod";

/**
 * Entradas das ações de Anomalias do Frete. Módulo puro (tela e action).
 *
 * A chave é o id determinístico da detecção (F1-<frete>, F3-<pedreira>-<material>,
 * F4-nf-<nota>, F4-carga-<placa|peso|material|data>...). O F4 carrega texto digitado
 * (nota e placa), então a regra só exige o prefixo da regra e recusa caractere de
 * controle (o Postgres não guarda o NUL em texto).
 */

const CHAVE_ANOMALIA = /^F[1-6]-[^\p{Cc}]+$/u;

export const MAXIMO_MOTIVO = 500;

export const conferirAnomaliaSchema = z.strictObject({
  chave: z.string().trim().max(1000, { error: "Anomalia inválida" }).regex(CHAVE_ANOMALIA, { error: "Anomalia inválida" }),
  conferida: z.boolean(),
  motivo: z
    .string()
    .trim()
    .max(MAXIMO_MOTIVO, { error: `No máximo ${MAXIMO_MOTIVO} caracteres` })
    .nullable()
    .optional()
    .transform((valor) => (valor ? valor : null)),
});
export type ConferirAnomaliaInput = z.input<typeof conferirAnomaliaSchema>;

export const SITUACOES = ["pendentes", "conferidas", "todas"] as const;
export type Situacao = (typeof SITUACOES)[number];

export function situacaoDaUrl(valor: string | string[] | undefined): Situacao {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return (SITUACOES as readonly string[]).includes(texto ?? "") ? (texto as Situacao) : "pendentes";
}
