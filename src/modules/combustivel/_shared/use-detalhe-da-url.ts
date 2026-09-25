"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { PARAM_DETALHE } from "@/modules/combustivel/_shared/navegacao";

/**
 * O drawer de detalhe aberto por link de outra tela (os movimentos do detalhe do tanque).
 *
 * O link leva à lista com `?detalhe=<id>` (ver `hrefDetalhe`). A lista abre o drawer do
 * registro com esse id e TIRA o parâmetro da URL na hora, como o `useNovoDaUrl`: sem isso,
 * voltar ou recarregar reabriria o drawer que a pessoa já fechou. Id que não está na lista
 * (excluído, sem permissão) só some da URL.
 *
 * Abrir acontece no render (ajuste de estado quando a entrada muda), não num efeito; o
 * efeito só limpa a URL.
 */
export function useDetalheDaUrl<T extends { id: string }>(
  registros: readonly T[],
): [T | null, (registro: T | null) => void] {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const pedido = params.get(PARAM_DETALHE);

  const [detalhe, setDetalhe] = React.useState<T | null>(() =>
    pedido ? (registros.find((r) => r.id === pedido) ?? null) : null,
  );
  // O último pedido já atendido, em ESTADO (tocar em ref no render o lint barra).
  const [atendido, setAtendido] = React.useState(pedido);
  if (pedido !== atendido) {
    setAtendido(pedido);
    const achado = pedido ? registros.find((r) => r.id === pedido) : undefined;
    if (achado) setDetalhe(achado);
  }

  React.useEffect(() => {
    if (!pedido) return;
    const proximo = new URLSearchParams(params.toString());
    proximo.delete(PARAM_DETALHE);
    const query = proximo.toString();
    router.replace(query ? `${caminho}?${query}` : caminho, { scroll: false });
  }, [pedido, params, caminho, router]);

  return [detalhe, setDetalhe];
}
