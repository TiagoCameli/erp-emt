"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { PARAM_NOVO } from "@/modules/combustivel/_shared/navegacao";

/**
 * O drawer de criação aberto pelos botões "+ Nova Entrada/Saída/Transferência" do topo.
 *
 * O botão leva à lista com `?novo=1` (ver `hrefNovo`). A lista abre o drawer ao ver o
 * parâmetro e o TIRA da URL na hora: sem isso, voltar ou recarregar a página reabriria o
 * formulário que a pessoa já fechou (ou já salvou).
 *
 * Abrir acontece no render (o ajuste de estado quando a entrada muda, da doc do React), não
 * num efeito: `setState` em efeito é render em cascata e o lint do projeto barra. O efeito só
 * limpa a URL. Sem `ativo` (quem não pode criar), o parâmetro é só removido.
 */
export function useNovoDaUrl(ativo: boolean): [boolean, (aberto: boolean) => void] {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const pedido = params.get(PARAM_NOVO) === "1";

  const [aberto, setAberto] = React.useState(pedido && ativo);
  // O último pedido já atendido, em ESTADO (tocar em ref no render o lint barra).
  const [atendido, setAtendido] = React.useState(pedido);
  if (pedido !== atendido) {
    setAtendido(pedido);
    if (pedido && ativo) setAberto(true);
  }

  React.useEffect(() => {
    if (!pedido) return;
    const proximo = new URLSearchParams(params.toString());
    proximo.delete(PARAM_NOVO);
    const query = proximo.toString();
    router.replace(query ? `${caminho}?${query}` : caminho, { scroll: false });
  }, [pedido, params, caminho, router]);

  return [aberto, setAberto];
}
