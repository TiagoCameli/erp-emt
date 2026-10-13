import type { ErroDeBanco } from "@/lib/erros-banco";

/**
 * Erro das RPCs do Estoque em frase para a tela.
 *
 * As travas do banco (migration estoque_modulo) já falam português e dizem o que
 * aconteceu: "Saldo insuficiente de X em 06/10/2026: faltam 3", "A OC ... só tem 1
 * deste item para dar entrada", centro de custo inativo. São todas `raise exception`
 * (P0001) e vão para a tela como vieram. Outro código vira o texto genérico, para
 * nenhuma mensagem crua do Postgres chegar ao usuário.
 */

const RAISE_EXCEPTION = "P0001";
const PERMISSAO_NEGADA = "42501";

export const ERRO_SEM_PERMISSAO_BANCO = "Você não tem permissão para esta ação no Estoque";

export function traduzirErroEstoque(erro: ErroDeBanco | null | undefined, fallback: string): string {
  if (!erro) return fallback;
  if (erro.code === PERMISSAO_NEGADA) return ERRO_SEM_PERMISSAO_BANCO;
  if (erro.code === RAISE_EXCEPTION && erro.message) return erro.message;
  return fallback;
}
