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

const chaveAnomalia = z
  .string()
  .trim()
  .max(2000, { error: "Anomalia inválida" })
  .regex(CHAVE_ANOMALIA, { error: "Anomalia inválida" });

export const conferirAnomaliaSchema = z.strictObject({
  chave: chaveAnomalia,
  conferida: z.boolean(),
  motivo: textoOpcional,
});
export type ConferirAnomaliaInput = z.input<typeof conferirAnomaliaSchema>;

/** Teto de anomalias por conferência em lote (uma chamada da RPC por chave). */
export const MAXIMO_CONFERENCIA_LOTE = 500;

/** Marcar várias anomalias como conferidas de uma vez, com o mesmo motivo. */
export const conferirAnomaliasSchema = z.strictObject({
  chaves: z
    .array(chaveAnomalia)
    .min(1, { error: "Selecione ao menos uma anomalia" })
    .max(MAXIMO_CONFERENCIA_LOTE, { error: `No máximo ${MAXIMO_CONFERENCIA_LOTE} anomalias por vez` }),
  motivo: textoOpcional,
});
export type ConferirAnomaliasInput = z.input<typeof conferirAnomaliasSchema>;

export const revisarSemSuprimentoSchema = z.strictObject({
  saidaId: idSchema,
  revisado: z.boolean(),
  observacao: textoOpcional,
});
export type RevisarSemSuprimentoInput = z.input<typeof revisarSemSuprimentoSchema>;

/** Teto de saídas por atribuição (a lista vai num array do Postgres, sem estourar URL). */
export const MAXIMO_SAIDAS_ATRIBUICAO = 1000;

/**
 * Atribuir equipamento às saídas do sentinela ("Outros"): o AtribuirSentinelModal e a
 * atribuição do AnomaliaDrawer da origem. Um equipamento para uma ou várias saídas.
 */
export const atribuirEquipamentoSchema = z.strictObject({
  saidaIds: z
    .array(idSchema)
    .min(1, { error: "Selecione ao menos uma saída" })
    .max(MAXIMO_SAIDAS_ATRIBUICAO, { error: `No máximo ${MAXIMO_SAIDAS_ATRIBUICAO} saídas por vez` }),
  equipamentoId: idSchema,
});
export type AtribuirEquipamentoInput = z.input<typeof atribuirEquipamentoSchema>;

/** Filtro de situação das duas listas. */
export const SITUACOES = ["pendentes", "conferidas", "todas"] as const;
export type Situacao = (typeof SITUACOES)[number];

export function situacaoDaUrl(valor: string | string[] | undefined): Situacao {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return (SITUACOES as readonly string[]).includes(texto ?? "") ? (texto as Situacao) : "pendentes";
}
