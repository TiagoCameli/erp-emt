import type { Posicao } from "@/modules/mapa/tipos";

/**
 * Pavimentação desenhada pelo início, curvas e fim: tenta o caminho pela estrada no serviço de
 * rotas do Google (Directions). Em 15/10/2026 a chave do ERP NÃO tem esse serviço liberado
 * ("REQUEST_DENIED"), então hoje volta null e quem chama usa os pontos tocados. Quando a
 * "Directions API" for ativada no Google Cloud e liberada na chave, a linha passa a seguir a
 * estrada sem mudar código. Sem Google na página (motor de tiles), também volta null.
 */
export async function rotaPelaEstrada(
  pontos: readonly Posicao[],
): Promise<Posicao[] | null> {
  if (pontos.length < 2 || typeof window === "undefined") return null;
  const g = (window as unknown as { google?: typeof google }).google;
  if (!g?.maps?.importLibrary) return null;
  try {
    const { DirectionsService } = (await g.maps.importLibrary(
      "routes",
    )) as google.maps.RoutesLibrary;
    const ll = (p: Posicao) => ({ lat: p[1], lng: p[0] });
    const resposta = await new DirectionsService().route({
      origin: ll(pontos[0]),
      destination: ll(pontos[pontos.length - 1]),
      // O serviço aceita até 25 pontos no meio.
      waypoints: pontos
        .slice(1, -1)
        .slice(0, 25)
        .map((p) => ({ location: ll(p), stopover: false })),
      travelMode: g.maps.TravelMode.DRIVING,
    });
    const caminho = resposta.routes[0]?.overview_path;
    if (!caminho || caminho.length < 2) return null;
    return caminho.map((p) => [p.lng(), p.lat()]);
  } catch {
    return null;
  }
}
