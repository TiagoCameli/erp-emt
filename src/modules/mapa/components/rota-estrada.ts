import { tirarRetornoDasPontas } from "@/modules/mapa/geo";
import type { Posicao } from "@/modules/mapa/tipos";

/**
 * Pavimentação desenhada pelo início, curvas e fim: pede ao Google o caminho pela estrada.
 *
 * 1. Routes API (`google.maps.routes.Route.computeRoutes`), a que o projeto `erp-emt` do Google
 *    Cloud pode ter: a Directions virou serviço antigo em março de 2025 e não se ativa em projeto
 *    novo. O Tiago ativou a Routes API e a pôs na chave restrita em 15/10/2026.
 * 2. Directions (`DirectionsService`), como reserva para projeto antigo que ainda a tenha.
 * 3. Roteador público do OpenStreetMap (OSRM), quando o Google não responde: em 15/10/2026 a Routes
 *    API recusava a chave do ERP (`API_KEY_INVALID`) e o Tiago pediu a linha pela estrada mesmo
 *    assim. Vão só as coordenadas tocadas. É servidor público, sem garantia: se cair, segue.
 *
 * O que vier passa por `tirarRetornoDasPontas` (o roteador às vezes contorna uma rotatória na
 * ponta). Sem nenhum (ou sem rede), volta null e quem chama usa os pontos tocados.
 */

const OSRM = "https://router.project-osrm.org/route/v1/driving";

const ll = (p: Posicao) => ({ lat: p[1], lng: p[0] });

async function pelaRoutesApi(
  g: typeof google,
  pontos: readonly Posicao[],
): Promise<Posicao[] | null> {
  const { Route } = (await g.maps.importLibrary(
    "routes",
  )) as google.maps.RoutesLibrary;
  if (!Route?.computeRoutes) return null;
  const { routes } = await Route.computeRoutes({
    origin: ll(pontos[0]),
    destination: ll(pontos[pontos.length - 1]),
    // As curvas tocadas são pontos de passagem, não paradas.
    intermediates: pontos
      .slice(1, -1)
      .slice(0, 25)
      .map((p) => ({ location: ll(p), via: true })),
    travelMode: "DRIVING",
    fields: ["path"],
  });
  const caminho = routes?.[0]?.path;
  if (!caminho || caminho.length < 2) return null;
  return caminho.map((p) => [p.lng, p.lat]);
}

async function pelaDirections(
  g: typeof google,
  pontos: readonly Posicao[],
): Promise<Posicao[] | null> {
  const { DirectionsService } = (await g.maps.importLibrary(
    "routes",
  )) as google.maps.RoutesLibrary;
  const resposta = await new DirectionsService().route({
    origin: ll(pontos[0]),
    destination: ll(pontos[pontos.length - 1]),
    waypoints: pontos
      .slice(1, -1)
      .slice(0, 25)
      .map((p) => ({ location: ll(p), stopover: false })),
    travelMode: g.maps.TravelMode.DRIVING,
  });
  const caminho = resposta.routes[0]?.overview_path;
  if (!caminho || caminho.length < 2) return null;
  return caminho.map((p) => [p.lng(), p.lat()]);
}

async function peloOsm(pontos: readonly Posicao[]): Promise<Posicao[] | null> {
  const coordenadas = pontos
    .slice(0, 100)
    .map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`)
    .join(";");
  const resposta = await fetch(
    `${OSRM}/${coordenadas}?overview=full&geometries=geojson`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!resposta.ok) return null;
  const corpo = (await resposta.json()) as {
    code?: string;
    routes?: { geometry?: { coordinates?: unknown } }[];
  };
  const coords = corpo.routes?.[0]?.geometry?.coordinates;
  if (corpo.code !== "Ok" || !Array.isArray(coords)) return null;
  const caminho = coords.filter(
    (c): c is Posicao =>
      Array.isArray(c) &&
      c.length >= 2 &&
      typeof c[0] === "number" &&
      typeof c[1] === "number",
  );
  return caminho.length >= 2 ? caminho.map((c) => [c[0], c[1]]) : null;
}

export async function rotaPelaEstrada(
  pontos: readonly Posicao[],
): Promise<Posicao[] | null> {
  if (pontos.length < 2 || typeof window === "undefined") return null;
  const g = (window as unknown as { google?: typeof google }).google;
  const tentativas: (() => Promise<Posicao[] | null>)[] = [];
  if (g?.maps?.importLibrary) {
    tentativas.push(() => pelaRoutesApi(g, pontos));
    tentativas.push(() => pelaDirections(g, pontos));
  }
  tentativas.push(() => peloOsm(pontos));
  for (const tentar of tentativas) {
    try {
      const rota = await tentar();
      if (rota) return tirarRetornoDasPontas(rota);
    } catch {
      // serviço fora da chave ou fora do ar: tenta o próximo
    }
  }
  return null;
}
