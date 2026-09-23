/*
 * Service worker das telas de campo (escopo /m/). Registrado por
 * src/modules/manutencao/campo/components/registrar-service-worker.tsx.
 *
 * Faz uma coisa só: a tela do QR abrir sem sinal, como estava na última vez que abriu.
 * - Página de /m/: rede primeiro; guarda a última resposta boa. Sem rede, devolve a
 *   guardada; sem guardada, um aviso curto.
 * - /_next/static/: cache primeiro (o nome do arquivo muda a cada build).
 * - O resto (API da fila, Supabase, RSC) passa direto. A fila é da página, não daqui.
 *
 * Mudou este arquivo? Suba a VERSAO: é ela que apaga o cache velho.
 */
const VERSAO = "v1";
const PAGINAS = `erp-campo-paginas-${VERSAO}`;
const ESTATICOS = `erp-campo-estaticos-${VERSAO}`;

const OFFLINE = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem sinal</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:32px 16px;color:#1F1F1F;background:#fff}
a{color:#3E7744}</style></head><body><h1 style="font-size:18px">Sem sinal</h1>
<p>Esta tela ainda não foi aberta neste celular com internet, então não há cópia guardada.</p>
<p>O que você já lançou continua na fila e sai sozinho quando a internet voltar.</p>
<p><a href="/m/leitor">Tentar de novo</a></p></body></html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(
        nomes
          .filter((nome) => nome.startsWith("erp-campo-") && nome !== PAGINAS && nome !== ESTATICOS)
          .map((nome) => caches.delete(nome)),
      );
      await self.clients.claim();
    })(),
  );
});

async function paginaRedePrimeiro(request) {
  const cache = await caches.open(PAGINAS);
  try {
    const resposta = await fetch(request);
    // Redirecionado (login, conta desativada) ou erro não vira cópia offline.
    if (resposta.ok && !resposta.redirected && resposta.type === "basic") {
      await cache.put(request, resposta.clone());
    }
    return resposta;
  } catch {
    const guardada = await cache.match(request, { ignoreSearch: true });
    if (guardada) return guardada;
    return new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

async function estaticoCachePrimeiro(request) {
  const cache = await caches.open(ESTATICOS);
  const guardado = await cache.match(request);
  if (guardado) return guardado;
  const resposta = await fetch(request);
  if (resposta.ok) await cache.put(request, resposta.clone());
  return resposta;
}

self.addEventListener("fetch", (evento) => {
  const { request } = evento;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && url.pathname.startsWith("/m/")) {
    evento.respondWith(paginaRedePrimeiro(request));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    evento.respondWith(estaticoCachePrimeiro(request));
  }
});
