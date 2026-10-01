"use client";

import "leaflet/dist/leaflet.css";

import * as React from "react";
import { latLngBounds, type LatLngBounds } from "leaflet";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";

import type { LinhaRota } from "@/modules/frete/carretas-emt/rotas";

/**
 * O mapa das rotas das carretas (Leaflet). O Google Maps com rota desenhada pede chave de API
 * paga; coordenada e traçado são nossos, então a camada de fundo é trocável.
 *
 * - Fundo que acompanha o tema: Esri Canvas cinza claro ou escuro; ou satélite (Esri).
 * - Cada rota é contorno + linha (espessura pela produção, cor pelo tipo) + um fluxo animado no
 *   sentido origem -> destino (CSS `.rota-fluxo`, desligado em `prefers-reduced-motion`).
 * - Foco: passar o mouse numa rota (aqui ou na tabela) acende ela e apaga as outras; escolher a
 *   rota (filtro da aba) faz o mapa voar até ela, e tirar o filtro volta para o quadro todo.
 * - Roda do mouse só depois de clicar no mapa, para a rolagem da
 *   página não virar zoom sem querer.
 * - Locais com tamanho pela tonelagem que passa por eles; pedreira (só origem) é anel, destino é
 *   cheio.
 *
 * As cores vêm dos tokens --viz-* do globals.css: o Leaflet escreve a cor como atributo do SVG,
 * que não lê var(), então ela é resolvida no navegador e acompanha a troca de tema.
 */

export type CamadaMapa = "mapa" | "satelite";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const ATRIBUICAO_ESRI = "Mapa &copy; Esri, HERE, Garmin, &copy; OpenStreetMap";

/**
 * Fundo e camada de nomes. Esri Canvas (cinza claro ou escuro, sem chave de API): o fundo
 * neutro deixa a cor das rotas mandar. A CARTO, testada antes, passou a exigir chave.
 */
function camada(tipo: CamadaMapa, escuro: boolean) {
  if (tipo === "satelite") {
    return {
      base: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
      rotulos: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
      atribuicao: "Imagens &copy; Esri, Maxar, Earthstar Geographics",
    };
  }
  const tom = escuro ? "Dark" : "Light";
  return {
    base: `${ESRI}/Canvas/World_${tom}_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    rotulos: `${ESRI}/Canvas/World_${tom}_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    atribuicao: ATRIBUICAO_ESRI,
  };
}

function lerTema() {
  const raiz = document.documentElement;
  const css = getComputedStyle(raiz);
  const token = (nome: string, reserva: string) => css.getPropertyValue(nome).trim() || reserva;
  return {
    escuro: raiz.classList.contains("dark"),
    material: token("--viz-producao", "#2a78d6"),
    transferencia: token("--viz-custo", "#eb6834"),
    texto: token("--foreground", "#1f1f1f"),
    fundo: token("--card", "#ffffff"),
  };
}

const TEMA_PADRAO = { escuro: false, material: "#2a78d6", transferencia: "#eb6834", texto: "#1f1f1f", fundo: "#ffffff" };

function useTema() {
  const [tema, setTema] = React.useState(TEMA_PADRAO);
  React.useEffect(() => {
    const ler = () => setTema(lerTema());
    ler();
    const observador = new MutationObserver(ler);
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observador.disconnect();
  }, []);
  return tema;
}

export function caminhoDaRota(rota: LinhaRota): [number, number][] | null {
  if (rota.tracado) return rota.tracado;
  const { origem: o, destino: d } = rota;
  if (o.latitude === null || o.longitude === null || d.latitude === null || d.longitude === null) return null;
  return [
    [o.latitude, o.longitude],
    [d.latitude, d.longitude],
  ];
}

/** Onde vai o número da rota: escalonado ao longo do traçado, para rotas no mesmo corredor não se cobrirem. */
function pontoDoNumero(pontos: [number, number][], indice: number): [number, number] {
  const fracao = 0.28 + ((indice * 0.11) % 0.5);
  return pontos[Math.min(pontos.length - 1, Math.floor(pontos.length * fracao))] ?? pontos[0] ?? [0, 0];
}

function limitesDe(pontos: [number, number][]): LatLngBounds | null {
  return pontos.length > 0 ? latLngBounds(pontos) : null;
}

/** Enquadra na primeira vez e voa até a rota escolhida (ou volta ao quadro todo). */
function Camera({ todos, foco }: { todos: LatLngBounds | null; foco: LatLngBounds | null }) {
  const map = useMap();
  const primeiro = React.useRef(true);
  const chaveTodos = todos?.toBBoxString() ?? "";
  const chaveFoco = foco?.toBBoxString() ?? "";
  React.useEffect(() => {
    const alvo = foco ?? todos;
    if (!alvo) return;
    // O cartão da rota ocupa ~340 px à direita na tela larga (md+): o enquadramento não põe rota
    // embaixo dele.
    const direita = map.getSize().x >= 720 ? 350 : 24;
    const margens = { paddingTopLeft: [24, 24] as [number, number], paddingBottomRight: [direita, 24] as [number, number] };
    if (primeiro.current) {
      map.fitBounds(alvo, margens);
      primeiro.current = false;
      return;
    }
    map.flyToBounds(alvo, { ...margens, duration: 0.9 });
    // As chaves descrevem os limites; o objeto muda a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveTodos, chaveFoco, map]);
  return null;
}

/** Roda do mouse só depois de clicar no mapa; sair com o mouse desliga de novo. */
function ZoomPorClique() {
  const map = useMapEvents({
    click: () => map.scrollWheelZoom.enable(),
    mouseout: () => map.scrollWheelZoom.disable(),
  });
  return null;
}

export interface MapaRotasProps {
  rotas: LinhaRota[];
  camada: CamadaMapa;
  /** A rota do filtro da aba (null = todas). */
  selecionada: string | null;
  /** A rota sob o mouse, aqui ou na tabela. */
  destacada: string | null;
  onSelecionar: (chave: string) => void;
  onDestacar: (chave: string | null) => void;
  numeroDaRota: (chave: string) => number | null;
}

export function MapaRotas({ rotas, camada: tipoCamada, selecionada, destacada, onSelecionar, onDestacar, numeroDaRota }: MapaRotasProps) {
  const tema = useTema();
  const fundo = camada(tipoCamada, tema.escuro);
  const maior = Math.max(...rotas.map((r) => r.producao), 1);
  const foco = destacada ?? selecionada;

  // Locais: tonelagem que passa por eles e se só saem cargas dali (pedreira).
  const locais = new Map<string, { nome: string; ponto: [number, number]; toneladas: number; destino: boolean }>();
  for (const r of rotas) {
    for (const [l, ehDestino] of [
      [r.origem, false],
      [r.destino, true],
    ] as const) {
      if (l.latitude === null || l.longitude === null) continue;
      const atual = locais.get(l.id) ?? { nome: l.nome, ponto: [l.latitude, l.longitude] as [number, number], toneladas: 0, destino: false };
      atual.toneladas += r.toneladas;
      atual.destino = atual.destino || ehDestino;
      locais.set(l.id, atual);
    }
  }
  const maiorTonelagem = Math.max(...[...locais.values()].map((l) => l.toneladas), 1);

  const todos = limitesDe([...locais.values()].map((l) => l.ponto));
  const rotaSelecionada = rotas.find((r) => r.chave === selecionada);
  const caminhoSelecionado = rotaSelecionada ? caminhoDaRota(rotaSelecionada) : null;
  const limitesFoco = caminhoSelecionado ? limitesDe(caminhoSelecionado) : null;

  return (
    <MapContainer
      center={[-8.9, -69]}
      zoom={6}
      // Zoom inteiro: no fracionado o Leaflet escala os pedaços do mapa e aparecem emendas finas
      // entre eles. A fluidez fica no voo (flyToBounds) e na roda mais macia.
      zoomSnap={1}
      zoomDelta={1}
      wheelPxPerZoomLevel={120}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%", background: tema.fundo }}
    >
      <TileLayer key={fundo.base} url={fundo.base} attribution={fundo.atribuicao} maxNativeZoom={16} />
      {/* Nomes de cidade e fronteira por cima do fundo e por baixo das rotas. */}
      <TileLayer key={fundo.rotulos} url={fundo.rotulos} maxNativeZoom={16} opacity={0.9} />
      <Camera todos={todos} foco={limitesFoco} />
      <ZoomPorClique />

      {/* Das menores para as maiores: a rota grande fica por cima no corredor compartilhado. */}
      {[...rotas].reverse().map((rota) => {
        const trilha = caminhoDaRota(rota);
        if (!trilha) return null;
        const transferencia = rota.tipos.length === 1 && rota.tipos[0] === "transferencia";
        const cor = transferencia ? tema.transferencia : tema.material;
        const emFoco = foco === rota.chave;
        const apagada = foco !== null && !emFoco;
        const peso = 3 + 8 * Math.sqrt(rota.producao / maior);
        const eventos = {
          click: () => onSelecionar(rota.chave),
          mouseover: () => onDestacar(rota.chave),
          mouseout: () => onDestacar(null),
        };
        return (
          <React.Fragment key={rota.chave}>
            <Polyline
              positions={trilha}
              pathOptions={{ color: tema.escuro ? "#000000" : "#ffffff", weight: peso + 4, opacity: apagada ? 0.1 : 0.7, lineCap: "round", lineJoin: "round" }}
              eventHandlers={eventos}
            />
            <Polyline
              positions={trilha}
              pathOptions={{
                color: cor,
                weight: emFoco ? peso + 2 : peso,
                opacity: apagada ? 0.18 : 0.95,
                dashArray: rota.tracado ? undefined : "6 8",
                lineCap: "round",
                lineJoin: "round",
              }}
              eventHandlers={eventos}
            />
            {!apagada ? (
              <Polyline
                positions={trilha}
                interactive={false}
                pathOptions={{ color: "#ffffff", weight: Math.max(1.5, peso / 3), opacity: emFoco ? 0.95 : 0.6, className: "rota-fluxo", lineCap: "round" }}
              />
            ) : null}
          </React.Fragment>
        );
      })}

      {[...locais.entries()]
        .sort(([, a], [, b]) => a.ponto[1] - b.ponto[1])
        .map(([id, l], i) => (
          <CircleMarker
            key={id}
            center={l.ponto}
            radius={5 + 7 * Math.sqrt(l.toneladas / maiorTonelagem)}
            pathOptions={
              l.destino
                ? { color: tema.fundo, weight: 2, fillColor: tema.texto, fillOpacity: 0.9 }
                : { color: tema.texto, weight: 3, fillColor: tema.fundo, fillOpacity: 1 }
            }
          >
            <Tooltip permanent direction={i % 2 === 0 ? "top" : "bottom"} offset={i % 2 === 0 ? [0, -8] : [0, 8]} className="rota-local">
              {l.nome}
            </Tooltip>
          </CircleMarker>
        ))}

      {rotas.map((rota, i) => {
        const trilha = caminhoDaRota(rota);
        const numero = numeroDaRota(rota.chave);
        if (!trilha || numero === null) return null;
        const transferencia = rota.tipos.length === 1 && rota.tipos[0] === "transferencia";
        const apagada = foco !== null && foco !== rota.chave;
        return (
          <CircleMarker
            key={`n-${rota.chave}`}
            center={pontoDoNumero(trilha, i)}
            radius={10}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: transferencia ? tema.transferencia : tema.material,
              fillOpacity: apagada ? 0.25 : 1,
              opacity: apagada ? 0.4 : 1,
            }}
            eventHandlers={{ click: () => onSelecionar(rota.chave), mouseover: () => onDestacar(rota.chave), mouseout: () => onDestacar(null) }}
          >
            <Tooltip permanent direction="center" className="rota-numero">
              {numero}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
