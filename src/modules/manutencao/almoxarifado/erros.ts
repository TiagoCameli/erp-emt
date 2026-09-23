/**
 * Tradução dos erros do banco do almoxarifado em frase que diz o que fazer.
 *
 * Módulo PURO (sem "use server" e sem server-only), no padrão de
 * `@/lib/erros-banco`: o Vitest importa direto e a action só repassa.
 */

import type { ErroDeBanco } from "@/lib/erros-banco";

/** SQLSTATE de check violation: é o que a trava de saldo levanta. */
const CHECK_VIOLATION = "23514";

/** SQLSTATE de unique violation. */
const UNIQUE_VIOLATION = "23505";

/** Começo da mensagem da trava de saldo (`fn_almox_recalcular_saldo`). */
const TEXTO_SALDO_INSUFICIENTE = "saldo insuficiente";

export const ERRO_ENTRADA_JA_USADA =
  "Esta entrada já foi usada em ordem de serviço: com a mudança, o saldo da peça no depósito ficaria negativo. Tire a peça da OS (ou reduza a quantidade usada) antes de mexer na entrada";

export const ERRO_PECA_REPETIDA = "Esta peça já está no almoxarifado";

export const ERRO_DEPOSITO_REPETIDO = "Já existe um depósito com este nome";

/**
 * A trava de saldo pegou? Vale pelo código (23514, que a função levanta de
 * propósito) ou pelo texto, porque o supabase-js às vezes entrega o código
 * dentro da mensagem.
 */
export function ehSaldoInsuficiente(erro: ErroDeBanco | null | undefined): boolean {
  if (!erro) return false;
  const mensagem = (erro.message ?? "").toLowerCase();
  if (mensagem.includes(TEXTO_SALDO_INSUFICIENTE)) return true;
  return erro.code === CHECK_VIOLATION && mensagem.includes("almoxarifado_saldo");
}

/**
 * Erro de editar ou excluir entrada. Saldo insuficiente vira a frase da OS;
 * `raise exception` nosso (P0001: "Entrada não encontrada", "Quantidade
 * inválida") passa como está; o resto é infraestrutura e volta o `fallback`.
 */
export function traduzErroEntrada(
  erro: ErroDeBanco | null | undefined,
  fallback: string,
): string {
  if (ehSaldoInsuficiente(erro)) return ERRO_ENTRADA_JA_USADA;
  if (erro?.code === "P0001" && erro.message) return erro.message;
  return fallback;
}

/** Unique violation, pelo código ou pelo texto. */
export function ehRepetido(erro: ErroDeBanco | null | undefined): boolean {
  if (!erro) return false;
  return (
    erro.code === UNIQUE_VIOLATION ||
    (erro.message ?? "").includes(UNIQUE_VIOLATION) ||
    (erro.message ?? "").toLowerCase().includes("duplicate key")
  );
}
