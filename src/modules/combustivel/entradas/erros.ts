import type { ErroDeBanco } from "@/lib/erros-banco";

/**
 * Erro das RPCs do Combustível em frase para a tela.
 *
 * As travas do banco (20260924100000_fase3_combustivel_banco.sql) já falam
 * português e dizem o que fazer: capacidade, mistura de combustível, tanque
 * externo, data no futuro, ciclo fechado, saldo insuficiente. Quase todas são
 * `raise exception` sem código (P0001). A trava de saldo negativo na linha do
 * tempo (`fn_comb_exigir_saldo`) usa 23514 de propósito, e é a única 23514 com
 * texto nosso: um CHECK de tabela também chega como 23514, mas com o nome da
 * constraint em inglês, e esse não pode ir para a tela.
 *
 * Usado pelas duas abas (entradas e abastecimentos). Módulo puro: o Vitest
 * importa direto e a action só repassa.
 */

const RAISE_EXCEPTION = "P0001";
const CHECK_VIOLATION = "23514";
const PERMISSAO_NEGADA = "42501";

/** Começo da mensagem de `fn_comb_exigir_saldo`. */
const TEXTO_SALDO_NEGATIVO = /saldo negativo/i;

export const ERRO_SEM_PERMISSAO_BANCO = "Você não tem permissão para esta ação no Combustível";

export function traduzirErroCombustivel(
  erro: ErroDeBanco | null | undefined,
  fallback: string,
): string {
  if (!erro) return fallback;
  const mensagem = erro.message ?? "";
  if (erro.code === PERMISSAO_NEGADA) return ERRO_SEM_PERMISSAO_BANCO;
  if (erro.code === CHECK_VIOLATION && TEXTO_SALDO_NEGATIVO.test(mensagem)) return mensagem;
  if (erro.code === RAISE_EXCEPTION && mensagem) return mensagem;
  return fallback;
}
