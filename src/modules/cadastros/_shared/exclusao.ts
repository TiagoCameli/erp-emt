/**
 * Helpers de exclusão física dos cadastros que vão para a lixeira.
 * Server-compatible: sem React, sem 'use server'. Os actions.ts dos cadastros
 * chamam supabase.rpc('fn_excluir_cadastro', ...) e passam o erro por aqui.
 */

/** Mensagem amigável quando o registro está referenciado por outra tabela. */
export const ERRO_EXCLUSAO_EM_USO =
  "Este registro está em uso e não pode ser excluído. Desative-o no lugar.";

/**
 * Traduz o erro do banco para uma mensagem amigável. Retorna a mensagem de
 * registro em uso quando é violação de chave estrangeira ('23503' ou
 * 'foreign key'), senão null (o chamador decide o que fazer com outros erros).
 */
export function traduzErroExclusao(
  error: { message?: string } | null,
): string | null {
  const mensagem = error?.message?.toLowerCase() ?? "";
  if (mensagem.includes("23503") || mensagem.includes("foreign key")) {
    return ERRO_EXCLUSAO_EM_USO;
  }
  return null;
}
