"use client";

import * as React from "react";

const CHAVE_USUARIO = "erp-campo-usuario";

/**
 * Registra o worker das telas de campo, com escopo `/m/`: o computador nunca passa por
 * ele. O worker guarda a última versão de cada tela aberta, para a tela do QR abrir sem
 * sinal; o envio não passa por ele (a fila é da página, ver fila.ts).
 *
 * Celular emprestado: quando quem entrou não é quem abriu as telas guardadas, as cópias
 * saem do cache. Sem isso, a tela de um abriria sem sinal para o outro.
 */
export function RegistrarServiceWorker({ usuarioId }: { usuarioId: string }) {
  React.useEffect(() => {
    void (async () => {
      try {
        const anterior = window.localStorage.getItem(CHAVE_USUARIO);
        if (anterior !== usuarioId && "caches" in window) {
          const nomes = await caches.keys();
          await Promise.all(
            nomes.filter((nome) => nome.startsWith("erp-campo-paginas-")).map((nome) => caches.delete(nome)),
          );
        }
        window.localStorage.setItem(CHAVE_USUARIO, usuarioId);
      } catch {
        // Armazenamento bloqueado: segue sem a troca, a tela funciona igual com sinal.
      }
      if (!("serviceWorker" in navigator)) return;
      navigator.serviceWorker.register("/sw-campo.js", { scope: "/m/" }).catch(() => {
        // Sem worker a tela funciona igual com sinal; só não abre offline.
      });
    })();
  }, [usuarioId]);
  return null;
}
