import "server-only";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import type { AlvoObjeto } from "@/modules/mapa/tipos";

/**
 * Tanque, pilha e depósito nascem no Estoque e o lugar deles é marcado no mapa do módulo Mapa
 * (pedido do Tiago, 15/10/2026). A ação de criar chama isto com o id novo: quem pode editar o
 * Mapa recebe o endereço que abre o /mapa já no "toque onde fica"; quem não pode, null (o
 * cadastro fica sem lugar e aparece na lista "sem lugar" para quem tem o Mapa).
 */
export async function enderecoParaColocar(
  alvo: AlvoObjeto,
  id: string,
): Promise<string | null> {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "mapa.mapa", "editar")) return null;
  return `/mapa?colocar=${alvo}&id=${encodeURIComponent(id)}`;
}
