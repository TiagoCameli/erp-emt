"use client";

import { useSyncExternalStore } from "react";

/**
 * Abaixo do `md` do Tailwind (48rem): é onde o AppShell troca a sidebar pelo
 * menu inferior, então "celular" aqui quer dizer o mesmo que no resto do app.
 */
const CONSULTA_CELULAR = "(max-width: 47.99rem)";

function assinar(avisar: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const consulta = window.matchMedia(CONSULTA_CELULAR);
  consulta.addEventListener("change", avisar);
  return () => consulta.removeEventListener("change", avisar);
}

function lerNoCliente(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(CONSULTA_CELULAR).matches
  );
}

/**
 * A tela é de celular? `null` enquanto não dá para saber: no servidor e na
 * hidratação. Quem usa trata o `null` desenhando as duas versões e deixando o
 * CSS (`md:hidden` / `max-md:hidden`) escolher, para o celular não piscar a
 * versão de computador antes de trocar.
 *
 * Existe para a tela que é OUTRA no celular, não só mais estreita: o CSS
 * sozinho resolveria, mas deixaria as duas árvores montadas para sempre, com
 * botão de aprovar em dobro na página e no leitor de tela.
 *
 * Sem `matchMedia` (jsdom) a resposta é "não é celular", então os testes
 * existentes continuam vendo a tela de computador.
 */
export function useTelaCelular(): boolean | null {
  return useSyncExternalStore(assinar, lerNoCliente, () => null);
}
