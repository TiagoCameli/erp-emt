import type { ErroDeBanco } from "@/lib/erros-banco";

/**
 * Erro das RPCs do Frete em frase para a tela. As travas de
 * 20260925100000_fase4_frete_banco.sql já falam português ("Valor deve ser > 0",
 * "Selecione quem pagou", "O fornecedor escolhido não está marcado como transportadora no
 * cadastro"); chegam como P0001 e vão direto. Qualquer outro código (CHECK, FK) tem texto
 * técnico em inglês e volta o fallback. Módulo puro, usado por Pagamentos e Pedidos.
 */

const RAISE_EXCEPTION = "P0001";
const PERMISSAO_NEGADA = "42501";

export const ERRO_SEM_PERMISSAO_FRETE = "Você não tem permissão para esta ação no Frete";

export function traduzirErroFrete(erro: ErroDeBanco | null | undefined, fallback: string): string {
  if (!erro) return fallback;
  if (erro.code === PERMISSAO_NEGADA) return ERRO_SEM_PERMISSAO_FRETE;
  if (erro.code === RAISE_EXCEPTION && erro.message) return erro.message;
  return fallback;
}
