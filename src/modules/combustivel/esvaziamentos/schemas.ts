import { z } from "zod";

import { idSchemaCom } from "@/lib/id";

/**
 * Esvaziamento de tanque, como o EsvaziarTanqueModal do Gestão Obras: descarta
 * o nível INTEIRO do tanque, agora. A pessoa só escolhe o tanque e diz o
 * motivo (pelo menos 3 caracteres); litros e data não se digitam, quem grava é
 * a RPC (`fn_comb_registrar_esvaziamento`, nível atual e `now()`). Não tem
 * edição: errou, exclui com motivo e registra de novo.
 */

export const MOTIVO_MINIMO = 3;

const motivoSchema = z
  .string()
  .trim()
  .min(MOTIVO_MINIMO, { error: `Informe um motivo com pelo menos ${MOTIVO_MINIMO} caracteres` });

export const esvaziamentoFormSchema = z.object({
  tanqueId: idSchemaCom("Selecione o tanque"),
  motivo: motivoSchema,
});

export type EsvaziamentoFormInput = z.infer<typeof esvaziamentoFormSchema>;

export const esvaziamentoSchema = z.object({
  tanqueId: idSchemaCom("Selecione o tanque"),
  motivo: motivoSchema,
});

export type EsvaziamentoInput = z.infer<typeof esvaziamentoSchema>;

/** Formulário validado para o contrato da action. */
export function esvaziamentoDoForm(form: EsvaziamentoFormInput): EsvaziamentoInput {
  return { tanqueId: form.tanqueId, motivo: form.motivo.trim() };
}

/**
 * Litros que o esvaziamento vai descartar: o nível atual do tanque, como a
 * origem (`litrosDescartados: tanque.nivelAtualLitros`). É o que a RPC grava.
 */
export function litrosDescartados(tanque: { nivel: number } | null | undefined): number {
  return tanque ? tanque.nivel : 0;
}

/** Só tanque com combustível se esvazia (a origem mostra o botão com nível > 0). */
export function podeEsvaziar(tanque: { nivel: number; ehExterno?: boolean }): boolean {
  return !tanque.ehExterno && tanque.nivel > 0;
}
