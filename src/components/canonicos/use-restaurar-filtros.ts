"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  filtrosLembraveis,
  lerQuerySessao,
} from "@/components/canonicos/filtros-sessao";

/**
 * Devolve à listagem o filtro que o usuário escolheu antes de sair dela.
 *
 * Vale para a família de filtros que vive na URL (`useFiltrosUrl`). Chamado uma
 * única vez, pelo AppShell: as listagens não têm contêiner de filtro em comum (o
 * `FiltroSelect` é controlado pelo pai, e são 42 telas), então não existe outro
 * lugar onde a restauração aconteça exatamente uma vez por página.
 *
 * Três regras, todas com motivo:
 *
 * 1. Só age quando a URL chegou SEM filtro. Link com filtro na query
 *    (compartilhado no WhatsApp, aberto de um relatório, favorito) ganha da
 *    sessão sempre: quem manda uma URL está dizendo o que quer ver.
 * 2. Query lembrada vazia é "eu limpei o filtro", e também é não fazer nada.
 * 3. Só a rota entra nas dependências. Com `searchParams` ali, o `replace`
 *    faria o efeito rodar de novo em cima do próprio resultado, e o app entraria
 *    em laço de navegação.
 */
export function useRestaurarFiltrosDaSessao(rota: string): void {
  const router = useRouter();

  React.useEffect(() => {
    // A query sai de `window.location`, não do `useSearchParams`, e isso é
    // deliberado. Com o hook, a query teria que entrar nas dependências (ou ser
    // copiada num ref durante o render, que o React proíbe), e aí o `replace`
    // faria o efeito rodar em cima do próprio resultado. O efeito roda depois do
    // DOM atualizado, então `location` já é a URL desta rota. De quebra, o
    // AppShell deixa de usar `useSearchParams` e para de empurrar o layout
    // inteiro para render dinâmico.
    const atual = window.location.search.replace(/^\?/, "");
    if (filtrosLembraveis(atual) !== "") return;
    const lembrado = lerQuerySessao(rota);
    if (!lembrado) return;
    router.replace(`${rota}?${lembrado}`, { scroll: false });
  }, [rota, router]);
}
