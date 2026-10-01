"use client";

import "leaflet/dist/leaflet.css";

import * as React from "react";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

import { formatarBRL } from "@/lib/formatadores";
import type { LinhaRota } from "@/modules/frete/carretas-emt/rotas";

/**
 * O mapa das rotas das carretas. Leaflet com o mapa do OpenStreetMap (ou satélite da Esri),
 * porque o Google Maps com rota desenhada pede chave de API paga; os dados (traçado e
 * coordenadas) são nossos e servem para qualquer mapa.
 *
 * Espessura da linha pela produção da rota (raiz quadrada, para a rota pequena não sumir); cor
 * pelo tipo de transporte. Cada rota tem o número dela na tabela embaixo, no meio do traçado.
 * Passar o mouse mostra os números; clicar destaca (e a tabela também destaca pelo mesmo número).
 *
 * As cores vêm dos tokens --viz-* do globals.css: o Leaflet escreve a cor como atributo do SVG,
 * que não lê var(), então ela é resolvida no navegador.
 */

const CAMADAS = {
  mapa: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    atribuicao: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satelite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    atribuicao: "Imagens &copy; Esri, Maxar, Earthstar Geographics",
  },
} as const;
export type CamadaMapa = keyof typeof CAMADAS;

function corDoToken(token: string, reserva: string): string {
  if (typeof window === "undefined") return reserva;
  const valor = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return valor || reserva;
}

function useCores() {
  const [cores, setCores] = React.useState({ material: "#2a78d6", transferencia: "#eb6834", local: "#1f1f1f" });
  React.useEffect(() => {
    const ler = () =>
      setCores({
        material: corDoToken("--viz-producao", "#2a78d6"),
        transferencia: corDoToken("--viz-custo", "#eb6834"),
        local: corDoToken("--foreground", "#1f1f1f"),
      });
    ler();
    // O tema escuro troca a classe do <html>: as cores acompanham.
    const observador = new MutationObserver(ler);
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observador.disconnect();
  }, []);
  return cores;
}

/** Enquadra todos os locais quando o conjunto muda (filtro). */
function Enquadrar({ limites }: { limites: LatLngBoundsExpression | null }) {
  const map = useMap();
  const chave = JSON.stringify(limites);
  React.useEffect(() => {
    if (limites) map.fitBounds(limites, { padding: [32, 32] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, map]);
  return null;
}

function pontoDoMeio(pontos: [number, number][]): [number, number] {
  return pontos[Math.floor(pontos.length / 2)] ?? pontos[0] ?? [0, 0];
}

function caminho(rota: LinhaRota): [number, number][] | null {
  if (rota.tracado) return rota.tracado;
  const { origem: o, destino: d } = rota;
  if (o.latitude === null || o.longitude === null || d.latitude === null || d.longitude === null) return null;
  return [
    [o.latitude, o.longitude],
    [d.latitude, d.longitude],
  ];
}

const numero = (v: number | null, casas = 0) =>
  v === null ? "sem dado" : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

export function MapaRotas({
  rotas,
  camada,
  selecionada,
  onSelecionar,
}: {
  rotas: LinhaRota[];
  camada: CamadaMapa;
  selecionada: string | null;
  onSelecionar: (chave: string | null) => void;
}) {
  const cores = useCores();
  const maior = Math.max(...rotas.map((r) => r.producao), 1);

  const locais = new Map<string, { nome: string; ponto: [number, number] }>();
  for (const r of rotas) {
    for (const l of [r.origem, r.destino]) {
      if (l.latitude !== null && l.longitude !== null) locais.set(l.id, { nome: l.nome, ponto: [l.latitude, l.longitude] });
    }
  }
  const pontos = [...locais.values()].map((l) => l.ponto);
  const limites: LatLngBoundsExpression | null = pontos.length > 0 ? pontos : null;
  const centro: LatLngExpression = pontos[0] ?? [-8.9, -69];

  return (
    <MapContainer
      center={centro}
      zoom={6}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%", borderRadius: "0.375rem", background: "var(--surface)" }}
      attributionControl
    >
      <TileLayer key={camada} url={CAMADAS[camada].url} attribution={CAMADAS[camada].atribuicao} />
      <Enquadrar limites={limites} />

      {rotas.map((rota, i) => {
        const trilha = caminho(rota);
        if (!trilha) return null;
        const transferencia = rota.tipos.length === 1 && rota.tipos[0] === "transferencia";
        const cor = transferencia ? cores.transferencia : cores.material;
        const apagada = selecionada !== null && selecionada !== rota.chave;
        const peso = 3 + 9 * Math.sqrt(rota.producao / maior);
        return (
          <React.Fragment key={rota.chave}>
            <Polyline
              positions={trilha}
              pathOptions={{
                color: cor,
                weight: selecionada === rota.chave ? peso + 3 : peso,
                opacity: apagada ? 0.2 : 0.85,
                dashArray: rota.tracado ? undefined : "6 8",
                lineCap: "round",
              }}
              eventHandlers={{ click: () => onSelecionar(selecionada === rota.chave ? null : rota.chave) }}
            >
              <Tooltip sticky>
                <div className="space-y-0.5 text-xs">
                  <p className="font-semibold">
                    {i + 1}. {rota.origem.nome} → {rota.destino.nome}
                  </p>
                  <p>
                    {formatarBRL(rota.producao)} em {rota.viagens} {rota.viagens === 1 ? "viagem" : "viagens"}
                  </p>
                  <p>
                    {numero(rota.kmMapa)} km pela estrada · {numero(rota.kmMedio)} km lançado
                  </p>
                  <p>Tempo médio: {rota.diasMedio === null ? "sem chegada" : `${numero(rota.diasMedio, 1)} dias`}</p>
                </div>
              </Tooltip>
            </Polyline>
            <CircleMarker
              center={pontoDoMeio(trilha)}
              radius={9}
              pathOptions={{ color: "#ffffff", weight: 2, fillColor: cor, fillOpacity: apagada ? 0.3 : 1 }}
              eventHandlers={{ click: () => onSelecionar(selecionada === rota.chave ? null : rota.chave) }}
            >
              <Tooltip permanent direction="center" className="rota-numero">
                {i + 1}
              </Tooltip>
            </CircleMarker>
          </React.Fragment>
        );
      })}

      {/* Os locais ficam em dois grupos apertados (pedreiras em RO, obra no AC): o nome alterna
          em cima e embaixo, na ordem da longitude, para dois vizinhos não se encavalarem. */}
      {[...locais.entries()]
        .sort(([, a], [, b]) => a.ponto[1] - b.ponto[1])
        .map(([id, l], i) => (
          <CircleMarker
            key={id}
            center={l.ponto}
            radius={5}
            pathOptions={{ color: "#ffffff", weight: 2, fillColor: cores.local, fillOpacity: 1 }}
          >
            <Tooltip
              permanent
              direction={i % 2 === 0 ? "top" : "bottom"}
              offset={i % 2 === 0 ? [0, -6] : [0, 6]}
              className="rota-local"
            >
              {l.nome}
            </Tooltip>
          </CircleMarker>
        ))}
    </MapContainer>
  );
}
