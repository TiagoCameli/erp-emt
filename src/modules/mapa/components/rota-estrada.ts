import type { Posicao } from "@/modules/mapa/tipos";

/**
 * Pavimentação desenhada pelo início, curvas e fim: pede ao Google o caminho pela estrada.
 *
 * 1. Routes API (`google.maps.routes.Route.computeRoutes`), a que o projeto `erp-emt` do Google
 *    Cloud pode ter: a Directions virou serviço antigo em março de 2025 e não se ativa em projeto
 *    novo. O Tiago ativou a Routes API e a pôs na chave restrita em 15/10/2026.
 * 2. Directions (`DirectionsService`), como reserva para projeto antigo que ainda a tenha.
 *
 * Sem nenhuma das duas (ou sem Google na página, no motor de tiles), volta null e quem chama usa
 * os pontos tocados.
 */

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

export async function rotaPelaEstrada(
  pontos: readonly Posicao[],
): Promise<Posicao[] | null> {
  if (pontos.length < 2 || typeof window === "undefined") return null;
  const g = (window as unknown as { google?: typeof google }).google;
  if (!g?.maps?.importLibrary) return null;
  try {
    const rota = await pelaRoutesApi(g, pontos);
    if (rota) return rota;
  } catch {
    // Routes API fora da chave ou fora do ar: tenta o serviço antigo
  }
  try {
    return await pelaDirections(g, pontos);
  } catch {
    return null;
  }
}
