/**
 * Tradução dos erros do banco do Combustível (transferência e esvaziamento).
 *
 * Módulo PURO (sem "use server" e sem server-only): o Vitest importa direto e a
 * action só repassa.
 *
 * As travas de 20260924100000_fase3_combustivel_banco.sql falam o que fazer
 * ("Saldo insuficiente no tanque nessa data: 120,50 L disponíveis", "Movimento
 * de ciclo fechado ..."), então a mensagem delas vai para a tela. Duas origens:
 *
 * - `raise exception` sem errcode (P0001): todas as travas e RPCs;
 * - a trava de saldo negativo na linha do tempo (`fn_comb_exigir_saldo`), que
 *   levanta 23514 de propósito, com texto próprio.
 *
 * Qualquer outro 23514 é check constraint (texto técnico do Postgres) e fica no
 * fallback, assim como permissão, RLS e conexão.
 */

import type { ErroDeBanco } from "@/lib/erros-banco";

const RAISE_EXCEPTION = "P0001";
const CHECK_VIOLATION = "23514";
const TEXTO_SALDO_NEGATIVO = "saldo negativo";

export function traduzErroMovimento(erro: ErroDeBanco | null | undefined, fallback: string): string {
  if (!erro?.message) return fallback;
  if (erro.code === RAISE_EXCEPTION) return erro.message;
  if (erro.code === CHECK_VIOLATION && erro.message.toLowerCase().includes(TEXTO_SALDO_NEGATIVO)) {
    return erro.message;
  }
  return fallback;
}
