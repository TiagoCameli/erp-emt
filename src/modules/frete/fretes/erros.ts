import type { ErroDeBanco } from "@/lib/erros-banco";

/**
 * Erro das RPCs do frete em frase para a tela. As travas da `fn_frete_salvar` e da
 * `fn_frete_excluir` já falam português com as mensagens da origem (`raise exception`,
 * P0001): passam direto. Permissão negada (42501) vira frase nossa; o resto, o fallback.
 * Módulo puro.
 */
export const ERRO_SEM_PERMISSAO_FRETE = "Você não tem permissão para esta ação no Frete";

export function traduzirErroFrete(erro: ErroDeBanco | null | undefined, fallback: string): string {
  if (!erro) return fallback;
  if (erro.code === "42501") return ERRO_SEM_PERMISSAO_FRETE;
  if (erro.code === "P0001" && erro.message) return erro.message;
  return fallback;
}
