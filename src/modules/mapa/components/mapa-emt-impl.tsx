"use client";

import * as React from "react";
import {
  Deck,
  type Layer,
  type MapViewState,
  type PickingInfo,
} from "@deck.gl/core";
import { TileLayer } from "@deck.gl/geo-layers";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { BitmapLayer } from "@deck.gl/layers";
import { Loader } from "@googlemaps/js-api-loader";

import { cn } from "@/lib/utils";
import {
  criarIluminacao,
  ID_GIRO,
  ID_LOCAIS,
  ID_OBJETOS,
  ID_OBRAS,
  ID_PESSOAS,
  montarCamadas,
  PREFIXO_MAQUINA,
  type Cena,
} from "@/modules/mapa/components/camadas";
import { pontoAoLeste, posicaoDoCartao } from "@/modules/mapa/cartao";
import { rumo } from "@/modules/mapa/geo";
import { ROTULO_ESTADO } from "@/modules/mapa/tipos";
import type {
  ConfigGoogle,
  EquipamentoMapa,
  PessoaMapa,
  Posicao,
} from "@/modules/mapa/tipos";

/**
 * O mapa 3D (deck.gl) sobre o Google Maps, com arraste de máquinas e pessoas. Porte do spike
 * validado em 14 e 15/10/2026 (spike/spike-mapa-3d.html), já com:
 *
 * - Google Maps vetorial (Map ID) com o deck.gl num canvas próprio por cima, seguindo a câmera
 *   do Google (inclinável); se o aparelho não roda o mapa vetorial, o Google cai para raster e o
 *   overlay é recriado (`renderingtype_changed`), sem inclinação;
 * - sem chave do Google (ambiente sem as variáveis), tiles da Esri com o deck.gl puro, para a
 *   tela continuar útil;
 * - arraste com o mapa travado durante o gesto (mouse e toque), com `pickMultipleObjects` para
 *   a máquina ganhar da pessoa que está "dentro" dela;
 * - a posição durante o arraste fica num ref e redesenha direto no deck.gl (sem passar pelo
 *   React a cada pixel); ao soltar, o pai decide (confirmação) e só então a posição vale.
 *
 * Só roda no navegador: deck.gl e o loader do Google tocam `window` no import, por isso o
 * componente entra via `dynamic(..., { ssr: false })` em mapa-emt.tsx.
 */

export type Alvo =
  | { tipo: "equipamento"; id: string }
  | { tipo: "pessoa"; id: string };
export type ModoFundo = "mapa" | "satelite";
export type TipoMotor = "google-vetorial" | "google-raster" | "tiles";

export interface ItemSolto {
  alvo: Alvo;
  de: Posicao;
  para: Posicao;
}

export interface ArrasteSolto {
  principal: Alvo;
  itens: ItemSolto[];
}

/** A parte da cena que vem do pai (o que desenhar); seleção, hover e arraste entram aqui. */
export type CenaBase = Omit<
  Cena,
  "selecao" | "hover" | "posicoes" | "tick" | "zoom"
>;

export interface Foco {
  pos: Posicao;
  zoom?: number;
  /** Muda a cada pedido, para o mesmo ponto poder ser focado duas vezes. */
  chave: number;
}

/** Pedido de girar o mapa: graus a somar ao rumo atual, ou null para voltar ao norte. */
export interface GiroMapa {
  delta: number | null;
  /** Muda a cada pedido, para o mesmo giro poder ser pedido duas vezes. */
  chave: number;
}

/**
 * Card preso a um ponto do mapa (a ficha da máquina ou do objeto tocado): fica ao lado dele, fora
 * do raio, e acompanha quando o mapa anda, gira ou aproxima.
 */
export interface CartaoNoMapa {
  /** Muda quando o card passa a ser de outro objeto. */
  chave: string;
  pos: Posicao;
  /** Raio do objeto (ou do anel em volta dele), em metros: o card começa depois dele. */
  raioM: number;
  /** O raio nunca é menor que isto na tela (o anel tem tamanho mínimo). */
  raioMinimoPx: number;
  conteudo: React.ReactNode;
}

export interface MapaEmtProps {
  google: ConfigGoogle;
  cena: CenaBase;
  selecao: ReadonlySet<string>;
  hover: string | null;
  /** Posições de um arraste solto à espera da confirmação (o pai guarda; cancelar = null). */
  posicoesPendentes: ReadonlyMap<string, Posicao> | null;
  fundo: ModoFundo;
  inclinado: boolean;
  podeArrastar: boolean;
  /** Clique no chão posiciona a máquina escolhida no painel (cursor em cruz). */
  modoPosicionar: boolean;
  foco: Foco | null;
  giroMapa: GiroMapa | null;
  centroInicial: { pos: Posicao; zoom: number };
  onSelecionar: (alvo: Alvo | null, multi: boolean) => void;
  onHover: (id: string | null) => void;
  onSoltar: (arraste: ArrasteSolto) => void;
  onClicarMapa: (pos: Posicao) => void;
  /** Toque no nome de um local (abre a ficha do local). */
  onClicarLocal: (id: string) => void;
  /** Toque no nome de uma obra (abre a ficha da obra). */
  onClicarObra: (id: string) => void;
  /** Toque no nome de um tanque, pilha ou depósito (abre a ficha dele). */
  onClicarObjeto: (id: string) => void;
  /** Arrastando o anel de giro: o rumo apontado (prévia). */
  onGirarPrevia: (id: string, rumo: number) => void;
  /** Soltou o anel de giro: grava o rumo. */
  onGirarFim: (id: string, rumo: number) => void;
  onMotor: (motor: TipoMotor, aviso: string | null) => void;
  /** Ficha aberta ao lado do objeto (null = nenhuma, ou mostrada fora do mapa). */
  cartao?: CartaoNoMapa | null;
  /** Clique no mapa sem nada embaixo (nem máquina, nem nome): fecha o card aberto. */
  onClicarVazio?: () => void;
  className?: string;
}

interface Motor {
  tipo: TipoMotor;
  setLayers(layers: Layer[]): void;
  pegar(x: number, y: number, ids: string[]): PickingInfo[];
  pixelParaCoord(x: number, y: number): Posicao | null;
  /** Ponto do mapa em pixels do container (null enquanto o motor não tem projeção). */
  coordParaPixel(pos: Posicao): [number, number] | null;
  travar(travar: boolean): void;
  setFundo(fundo: ModoFundo, inclinado: boolean): void;
  setInclinado(inclinado: boolean, fundo: ModoFundo): void;
  voarPara(pos: Posicao, zoom?: number): void;
  /** Soma graus ao rumo do mapa; null volta ao norte. */
  girarMapa(delta: number | null): void;
  finalizar(): void;
}

interface Arrasto {
  x0: number;
  y0: number;
  c0: Posicao;
  pointerId: number;
  principal: Alvo;
  itens: { alvo: Alvo; pos0: Posicao }[];
  /** Operadores que acompanham as máquinas arrastadas. */
  seguidores: { id: string; pos0: Posicao }[];
  movendo: boolean;
  posicoes: Map<string, Posicao>;
}

const CONTROLE_DECK = {
  dragPan: true,
  dragRotate: true,
  touchRotate: true,
  inertia: 300,
} as const;
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
/**
 * Piso de zoom dos dois motores: no 5 o mundo já é mais largo que a tela, então o planeta não se
 * repete lado a lado ao afastar (pedido do Tiago, 15/10/2026: "limite a um só mapa").
 */
const ZOOM_MINIMO = 5;
/** Teto de zoom dos dois motores (o Google ainda limita pelo que tem de imagem no lugar). */
const ZOOM_MAXIMO = 22;

/**
 * Cada motor desenha num div PRÓPRIO dentro do container. Sem isso, o StrictMode do React (monta,
 * desmonta, monta de novo em desenvolvimento) deixava dois mapas no mesmo div e o `finalizar` do
 * primeiro apagava o segundo junto.
 */
function criarPalco(el: HTMLDivElement): HTMLDivElement {
  const palco = document.createElement("div");
  palco.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  el.appendChild(palco);
  return palco;
}

let loaderGoogle: Loader | null = null;
function obterLoader(chave: string): Loader {
  // O Loader é singleton por página: instanciar de novo com opções diferentes lança.
  if (!loaderGoogle)
    loaderGoogle = new Loader({ apiKey: chave, version: "weekly" });
  return loaderGoogle;
}

function alvoDe(info: PickingInfo): Alvo | null {
  const id = info.layer?.id ?? "";
  const objeto = info.object as { id?: unknown } | undefined;
  if (!objeto || typeof objeto.id !== "string") return null;
  if (id.startsWith(PREFIXO_MAQUINA))
    return { tipo: "equipamento", id: objeto.id };
  if (id === ID_PESSOAS) return { tipo: "pessoa", id: objeto.id };
  return null;
}

function camadaTiles(fundo: ModoFundo): Layer[] {
  const base =
    fundo === "satelite"
      ? `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`
      : `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`;
  const urls =
    fundo === "satelite"
      ? [
          base,
          `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
        ]
      : [base];
  return urls.map(
    (url, i) =>
      new TileLayer({
        id: `fundo-${fundo}-${i}`,
        data: url,
        minZoom: 0,
        maxZoom: fundo === "satelite" ? 18 : 19,
        tileSize: 256,
        renderSubLayers: (props) => {
          const { west, south, east, north } = props.tile.bbox as {
            west: number;
            south: number;
            east: number;
            north: number;
          };
          return new BitmapLayer(props, {
            data: undefined,
            image: props.data,
            bounds: [west, south, east, north],
          });
        },
      }),
  );
}

/** deck.gl puro com tiles da Esri: o reserva quando não há chave do Google. */
function criarMotorTiles(
  el: HTMLDivElement,
  centro: { pos: Posicao; zoom: number },
  inclinado: boolean,
  fundo: ModoFundo,
  aoZoom: (zoom: number) => void,
): Motor {
  const palco = criarPalco(el);
  let fundoAtual = fundo;
  let camadas: Layer[] = [];
  let vista: MapViewState = {
    longitude: centro.pos[0],
    latitude: centro.pos[1],
    zoom: centro.zoom,
    pitch: inclinado ? 50 : 0,
    bearing: 0,
    maxPitch: 70,
    // Além do último nível de tile (18/19) a imagem só amplia, mas dá para mirar uma máquina no
    // pátio com precisão de metro.
    maxZoom: ZOOM_MAXIMO,
    minZoom: ZOOM_MINIMO,
  };
  const deck = new Deck({
    parent: palco,
    initialViewState: vista,
    controller: { ...CONTROLE_DECK },
    effects: [criarIluminacao()],
    layers: camadaTiles(fundo),
    useDevicePixels: Math.min(2, window.devicePixelRatio || 1),
    onViewStateChange: ({ viewState }) => {
      vista = viewState as MapViewState;
      aoZoom(vista.zoom);
    },
  });
  const aplicar = () =>
    deck.setProps({ layers: [...camadaTiles(fundoAtual), ...camadas] });
  return {
    tipo: "tiles",
    setLayers(layers) {
      camadas = layers;
      aplicar();
    },
    pegar(x, y, ids) {
      return (
        deck.pickMultipleObjects({
          x,
          y,
          radius: 10,
          depth: 6,
          layerIds: ids,
        }) ?? []
      );
    },
    pixelParaCoord(x, y) {
      const vp = deck.getViewports()[0];
      if (!vp) return null;
      const [lng, lat] = vp.unproject([x, y]);
      return [lng, lat];
    },
    coordParaPixel(pos) {
      const vp = deck.getViewports()[0];
      if (!vp) return null;
      const [x, y] = vp.project([pos[0], pos[1]]);
      return [x, y];
    },
    travar(travar) {
      deck.setProps({ controller: travar ? false : { ...CONTROLE_DECK } });
    },
    setFundo(novo) {
      fundoAtual = novo;
      aplicar();
    },
    setInclinado(novo) {
      deck.setProps({
        initialViewState: {
          ...vista,
          pitch: novo ? 50 : 0,
          transitionDuration: 500,
        },
      });
    },
    voarPara(pos, zoom) {
      deck.setProps({
        initialViewState: {
          ...vista,
          longitude: pos[0],
          latitude: pos[1],
          zoom: zoom ?? Math.max(vista.zoom, 14),
          transitionDuration: 700,
        },
      });
    },
    girarMapa(delta) {
      deck.setProps({
        initialViewState: {
          ...vista,
          bearing: delta === null ? 0 : (vista.bearing ?? 0) + delta,
          transitionDuration: 400,
        },
      });
    },
    finalizar() {
      deck.finalize();
      palco.remove();
    },
  };
}

/** Google Maps (vetorial com Map ID, raster sem) com o deck.gl por cima. */
async function criarMotorGoogle(
  el: HTMLDivElement,
  cfg: ConfigGoogle,
  centro: { pos: Posicao; zoom: number },
  inclinado: boolean,
  fundo: ModoFundo,
  aoMudarMotor: (tipo: TipoMotor, aviso: string | null) => void,
  aindaVale: () => boolean,
  aoZoom: (zoom: number) => void,
): Promise<Motor | null> {
  const loader = obterLoader(cfg.chave);
  const {
    Map: MapaGoogle,
    OverlayView,
    RenderingType,
  } = await loader.importLibrary("maps");
  // O componente pode ter desmontado enquanto o script carregava: não cria mapa órfão.
  if (!aindaVale()) return null;
  const palco = criarPalco(el);
  const opcoes: google.maps.MapOptions = {
    center: { lat: centro.pos[1], lng: centro.pos[0] },
    zoom: centro.zoom,
    mapTypeId: fundo === "satelite" ? "satellite" : "roadmap",
    tilt: inclinado && fundo === "mapa" ? 45 : 0,
    heading: 0,
    gestureHandling: "greedy",
    disableDefaultUI: true,
    zoomControl: true,
    fullscreenControl: false,
    // Desliga os atalhos de teclado do Google (setas, +/-) e com eles o link "Atalhos do teclado"
    // da barra de baixo; no mapa se navega com o mouse e o toque.
    keyboardShortcuts: false,
    isFractionalZoomEnabled: true,
    maxZoom: ZOOM_MAXIMO,
    minZoom: ZOOM_MINIMO,
    clickableIcons: false,
  };
  if (cfg.mapId) opcoes.mapId = cfg.mapId;
  const map = new MapaGoogle(palco, opcoes);
  map.addListener("zoom_changed", () => aoZoom(map.getZoom() ?? centro.zoom));

  // Projeção pixel ↔ lat/lng do próprio mapa (vale para raster e vetorial).
  let projecao: google.maps.MapCanvasProjection | null = null;
  const sonda = new OverlayView();
  sonda.onAdd = () => {};
  sonda.draw = () => {
    projecao = sonda.getProjection();
  };
  sonda.onRemove = () => {};
  sonda.setMap(map);

  let camadas: Layer[] = [];
  let overlay: GoogleMapsOverlay | null = null;
  let tipoNaCriacao: string | null = null;
  let tipoMotor: TipoMotor = cfg.mapId ? "google-vetorial" : "google-raster";

  const criarOverlay = () => {
    overlay?.finalize();
    // Não entrelaçado: no @deck.gl/google-maps 9.4.0, com o mapa vetorial, o overlay de
    // posicionamento cria o Deck antes do `onContextRestored`, e este devolve a mesma instância
    // sem o `gl` do Google; o deck desenha num canvas próprio de 1x1 e nada aparece (visto em
    // produção em 15/10/2026). Com canvas próprio as máquinas só deixam de ser escondidas por
    // prédios 3D do Google, o que não existe na BR-364.
    overlay = new GoogleMapsOverlay({
      interleaved: false,
      layers: camadas,
      effects: [criarIluminacao()],
    });
    overlay.setMap(map);
    tipoNaCriacao = map.getRenderingType();
    tipoMotor =
      tipoNaCriacao === RenderingType.RASTER
        ? "google-raster"
        : "google-vetorial";
    aoMudarMotor(tipoMotor, null);
  };
  criarOverlay();

  // O overlay escolhe raster/vetorial na criação. Se o tipo muda depois (aparelho sem WebGL2,
  // troca para satélite), recria para não ficar um overlay vetorial num mapa raster.
  map.addListener("renderingtype_changed", () => {
    const atual: string = map.getRenderingType();
    if (atual === RenderingType.UNINITIALIZED) return;
    if (
      tipoNaCriacao !== null &&
      tipoNaCriacao !== RenderingType.UNINITIALIZED &&
      atual !== tipoNaCriacao
    ) {
      criarOverlay();
      if (atual === RenderingType.RASTER) {
        map.setTilt(0);
        aoMudarMotor(
          "google-raster",
          cfg.mapId
            ? "Mapa vetorial não rodou neste aparelho: seguindo em raster, sem inclinação."
            : null,
        );
      }
    } else if (tipoNaCriacao === RenderingType.UNINITIALIZED) {
      tipoNaCriacao = atual;
      tipoMotor =
        atual === RenderingType.RASTER ? "google-raster" : "google-vetorial";
      aoMudarMotor(
        tipoMotor,
        atual === RenderingType.RASTER && cfg.mapId
          ? "Mapa vetorial não rodou neste aparelho: seguindo em raster, sem inclinação."
          : null,
      );
    }
  });

  return {
    get tipo() {
      return tipoMotor;
    },
    setLayers(layers) {
      camadas = layers;
      overlay?.setProps({ layers });
    },
    pegar(x, y, ids) {
      return (
        overlay?.pickMultipleObjects({
          x,
          y,
          radius: 10,
          depth: 6,
          layerIds: ids,
        }) ?? []
      );
    },
    pixelParaCoord(x, y) {
      if (!projecao) return null;
      const ll = projecao.fromContainerPixelToLatLng(
        new google.maps.Point(x, y),
      );
      return ll ? [ll.lng(), ll.lat()] : null;
    },
    coordParaPixel(pos) {
      if (!projecao) return null;
      const p = projecao.fromLatLngToContainerPixel(
        new google.maps.LatLng(pos[1], pos[0]),
      );
      return p ? [p.x, p.y] : null;
    },
    travar(travar) {
      map.setOptions({
        gestureHandling: travar ? "none" : "greedy",
        draggable: !travar,
      });
    },
    setFundo(novo, incl) {
      map.setMapTypeId(novo === "satelite" ? "satellite" : "roadmap");
      map.setTilt(
        novo === "mapa" &&
          incl &&
          map.getRenderingType() === RenderingType.VECTOR
          ? 45
          : 0,
      );
    },
    setInclinado(incl, fundoAtual) {
      map.setTilt(
        incl &&
          fundoAtual === "mapa" &&
          map.getRenderingType() === RenderingType.VECTOR
          ? 45
          : 0,
      );
    },
    girarMapa(delta) {
      // Só o mapa vetorial gira; no raster o Google ignora o rumo.
      map.setHeading(delta === null ? 0 : (map.getHeading() ?? 0) + delta);
    },
    voarPara(pos, zoom) {
      map.panTo({ lat: pos[1], lng: pos[0] });
      const atual = map.getZoom() ?? centro.zoom;
      map.setZoom(zoom ?? Math.max(atual, 14));
    },
    finalizar() {
      overlay?.finalize();
      overlay = null;
      sonda.setMap(null);
      google.maps.event.clearInstanceListeners(map);
      palco.remove();
    },
  };
}

export function MapaEmtImpl(props: MapaEmtProps) {
  const { centroInicial, className } = props;
  // Strings, não o objeto: o pai monta `google` a cada renderização e o motor só pode ser
  // recriado quando a chave ou o Map ID mudarem de verdade.
  const { chave: chaveGoogle, mapId: mapIdGoogle } = props.google;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const cartaoRef = React.useRef<HTMLDivElement>(null);
  const propsRef = React.useRef(props);
  // Antes dos demais efeitos (layout effect roda primeiro): os handlers leem as props daqui.
  React.useLayoutEffect(() => {
    propsRef.current = props;
  });
  const motorRef = React.useRef<Motor | null>(null);
  const arrastoRef = React.useRef<Arrasto | null>(null);
  // Giro pelo anel: centro da máquina e o último rumo apontado pelo ponteiro.
  const giroRef = React.useRef<{
    id: string;
    centro: Posicao;
    pointerId: number;
    rumo: number | null;
  } | null>(null);
  // O navegador dispara um `click` depois do arraste; ele não pode limpar a seleção.
  const ignorarCliqueRef = React.useRef(false);
  // Onde o ponteiro desceu: soltar depois de arrastar o mapa ainda dispara `click` no mouse.
  const descidaRef = React.useRef<{ x: number; y: number } | null>(null);
  const tickRef = React.useRef(0);
  const [dica, setDica] = React.useState<{
    titulo: string;
    detalhe: string;
  } | null>(null);
  const [carregando, setCarregando] = React.useState(true);

  // Zoom em degraus de meio nível, lido na hora de montar as camadas (os nomes dependem dele).
  const zoomRef = React.useRef(Math.floor(centroInicial.zoom * 2) / 2);

  /** Monta as camadas com a cena atual e manda para o motor (sem passar pelo React). */
  const redesenhar = React.useCallback(() => {
    const motor = motorRef.current;
    if (!motor) return;
    const p = propsRef.current;
    tickRef.current += 1;
    const posicoes = arrastoRef.current?.posicoes ?? p.posicoesPendentes;
    motor.setLayers(
      montarCamadas({
        ...p.cena,
        selecao: p.selecao,
        hover: p.hover,
        posicoes,
        tick: tickRef.current,
        zoom: zoomRef.current,
      }),
    );
  }, []);

  /** Zoom mudou: só redesenha quando cruza um degrau de meio nível (é o que liga/desliga nomes). */
  const aoZoom = React.useCallback(
    (zoom: number) => {
      const degrau = Math.floor(zoom * 2) / 2;
      if (degrau === zoomRef.current) return;
      zoomRef.current = degrau;
      redesenhar();
    },
    [redesenhar],
  );

  // Motor: Google quando há chave, tiles quando não. Recriado só se a chave/Map ID mudarem.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelado = false;
    let motor: Motor | null = null;
    setCarregando(true);
    const p = propsRef.current;
    const cfgGoogle: ConfigGoogle = { chave: chaveGoogle, mapId: mapIdGoogle };
    const montar = async () => {
      if (cfgGoogle.chave) {
        try {
          motor = await criarMotorGoogle(
            el,
            cfgGoogle,
            centroInicial,
            p.inclinado,
            p.fundo,
            (tipo, aviso) => {
              if (!cancelado) propsRef.current.onMotor(tipo, aviso);
            },
            () => !cancelado,
            aoZoom,
          );
          if (!motor) return;
        } catch (erro) {
          if (cancelado) return;
          propsRef.current.onMotor(
            "tiles",
            `Google Maps não carregou (${erro instanceof Error ? erro.message : "chave ou rede"}); seguindo com tiles da Esri.`,
          );
          motor = criarMotorTiles(
            el,
            centroInicial,
            p.inclinado,
            p.fundo,
            aoZoom,
          );
        }
      } else {
        motor = criarMotorTiles(
          el,
          centroInicial,
          p.inclinado,
          p.fundo,
          aoZoom,
        );
        propsRef.current.onMotor(
          "tiles",
          "Sem chave do Google Maps (NEXT_GOOGLE_MAPS_API_KEY): mapa com tiles da Esri.",
        );
      }
      if (cancelado) {
        motor.finalizar();
        return;
      }
      motorRef.current = motor;
      // O fundo pode ter mudado enquanto o Google carregava (o salvo no navegador chega depois da
      // hidratação): o motor nasceu com o da montagem, então aplica o de agora.
      const atual = propsRef.current;
      if (atual.fundo !== p.fundo) motor.setFundo(atual.fundo, atual.inclinado);
      setCarregando(false);
      redesenhar();
    };
    void montar();
    return () => {
      cancelado = true;
      motorRef.current?.finalizar();
      motorRef.current = null;
      arrastoRef.current = null;
    };
  }, [chaveGoogle, mapIdGoogle, centroInicial, redesenhar, aoZoom]);

  // Qualquer mudança no que desenhar redesenha; o arraste em curso tem prioridade (ref).
  const { cena, selecao, hover, posicoesPendentes } = props;
  React.useEffect(() => {
    redesenhar();
  }, [cena, selecao, hover, posicoesPendentes, redesenhar]);

  const { fundo, inclinado, foco, giroMapa } = props;
  React.useEffect(() => {
    motorRef.current?.setFundo(fundo, inclinado);
    redesenhar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inclinado tem o efeito próprio
  }, [fundo, redesenhar]);
  React.useEffect(() => {
    motorRef.current?.setInclinado(inclinado, fundo);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fundo tem o efeito próprio
  }, [inclinado]);
  React.useEffect(() => {
    if (foco) motorRef.current?.voarPara(foco.pos, foco.zoom);
  }, [foco]);

  React.useEffect(() => {
    if (giroMapa) motorRef.current?.girarMapa(giroMapa.delta);
  }, [giroMapa]);

  // Card ao lado do objeto: a cada quadro projeta o ponto (o Google anima o zoom e o giro sem
  // avisar o React) e move o card por transform, sem renderizar.
  const temCartao = Boolean(props.cartao);
  React.useEffect(() => {
    if (!temCartao) return;
    let quadro = 0;
    const passo = () => {
      quadro = requestAnimationFrame(passo);
      const c = propsRef.current.cartao;
      const el = cartaoRef.current;
      const cont = containerRef.current;
      const motor = motorRef.current;
      if (!c || !el || !cont || !motor) return;
      // Arrastando o próprio objeto, o card vai junto.
      const pos = arrastoRef.current?.posicoes.get(c.chave) ?? c.pos;
      const p = motor.coordParaPixel(pos);
      if (!p) {
        el.style.visibility = "hidden";
        return;
      }
      const leste = motor.coordParaPixel(pontoAoLeste(pos, c.raioM));
      const raioPx = Math.max(
        leste ? Math.hypot(leste[0] - p[0], leste[1] - p[1]) : 0,
        c.raioMinimoPx,
      );
      const { x, y } = posicaoDoCartao({
        ponto: p,
        raioPx,
        largura: el.offsetWidth,
        altura: el.offsetHeight,
        larguraMapa: cont.clientWidth,
        alturaMapa: cont.clientHeight,
      });
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.visibility = "visible";
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [temCartao]);

  // Ponteiro: clique, hover e arraste (mouse e toque), como no spike.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const idsClicaveis = () => {
      const chaves = new Set(
        propsRef.current.cena.equipamentos.map((e) => e.modelo3d),
      );
      return [...chaves]
        .map((c) => `${PREFIXO_MAQUINA}${c}`)
        .concat([ID_PESSOAS]);
    };
    const pegar = (x: number, y: number): PickingInfo | null => {
      const motor = motorRef.current;
      if (!motor) return null;
      const infos = motor.pegar(x, y, idsClicaveis());
      // Máquina ganha da pessoa: o operador fica "dentro" da máquina.
      return (
        infos.find((i) => i.layer?.id.startsWith(PREFIXO_MAQUINA)) ??
        infos.find((i) => i.object) ??
        null
      );
    };
    const posicaoAtual = (alvo: Alvo): Posicao | null => {
      const p = propsRef.current;
      const pendente = p.posicoesPendentes?.get(alvo.id);
      if (pendente) return pendente;
      const item =
        alvo.tipo === "equipamento"
          ? p.cena.equipamentos.find((e) => e.id === alvo.id)
          : p.cena.pessoas.find((q) => q.id === alvo.id);
      return item?.pos ?? null;
    };
    const relativo = (e: PointerEvent): [number, number] => {
      const r = el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const mostrarDica = (e: PointerEvent, info: PickingInfo | null) => {
      const tt = tooltipRef.current;
      if (!tt) return;
      if (!info) {
        setDica(null);
        return;
      }
      const alvo = alvoDe(info);
      const [x, y] = relativo(e);
      tt.style.left = `${x + 14}px`;
      tt.style.top = `${y + 14}px`;
      if (alvo?.tipo === "equipamento") {
        const d = info.object as EquipamentoMapa;
        setDica({
          titulo: `${d.codigo} · ${d.descricao}`,
          detalhe: `${ROTULO_ESTADO[d.estado]}${d.km !== null ? ` · km ${d.km.toFixed(1).replace(".", ",")}` : ""}${d.localidadeNome ? ` · ${d.localidadeNome}` : ""}`,
        });
      } else if (alvo?.tipo === "pessoa") {
        const q = info.object as PessoaMapa;
        setDica({
          titulo: q.nome,
          detalhe: [q.funcao, q.equipeNome].filter(Boolean).join(" · "),
        });
      }
    };

    const aoPressionar = (e: PointerEvent) => {
      descidaRef.current = { x: e.clientX, y: e.clientY };
      if (e.button !== undefined && e.button !== 0) return;
      const motor = motorRef.current;
      if (!motor) return;
      const [x, y] = relativo(e);
      const info = pegar(x, y);
      const alvo = info ? alvoDe(info) : null;
      if (!alvo) {
        // Sem máquina embaixo: o anel de giro da selecionada?
        const anel = propsRef.current.cena.anelGiro;
        if (
          anel &&
          motor.pegar(x, y, [ID_GIRO]).some((i) => i.object) &&
          propsRef.current.podeArrastar
        ) {
          giroRef.current = {
            id: anel.id,
            centro: anel.pos,
            pointerId: e.pointerId,
            rumo: null,
          };
          motor.travar(true);
          try {
            el.setPointerCapture(e.pointerId);
          } catch {
            // sem captura o giro segue
          }
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      const p = propsRef.current;
      const c0 = motor.pixelParaCoord(x, y);
      if (!c0) return;
      // Arrastar uma máquina selecionada arrasta a seleção toda.
      const conjunto: Alvo[] =
        alvo.tipo === "equipamento" && p.selecao.has(alvo.id)
          ? p.cena.equipamentos
              .filter((d) => p.selecao.has(d.id))
              .map((d) => ({ tipo: "equipamento" as const, id: d.id }))
          : [alvo];
      const itens = conjunto.flatMap((a) => {
        const pos0 = posicaoAtual(a);
        return pos0 ? [{ alvo: a, pos0 }] : [];
      });
      const idsMaquinas = new Set(
        itens
          .filter((i) => i.alvo.tipo === "equipamento")
          .map((i) => i.alvo.id),
      );
      const seguidores = p.cena.pessoas
        .filter(
          (q) => q.equipamentoId && idsMaquinas.has(q.equipamentoId) && q.pos,
        )
        .map((q) => ({ id: q.id, pos0: q.pos as Posicao }));
      arrastoRef.current = {
        x0: x,
        y0: y,
        c0,
        pointerId: e.pointerId,
        principal: alvo,
        itens,
        seguidores,
        movendo: false,
        posicoes: new Map(),
      };
      if (p.podeArrastar) motor.travar(true);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // alguns navegadores recusam a captura em toque sintético; o arraste segue sem ela
      }
      e.preventDefault();
      e.stopPropagation();
    };

    const aoMover = (e: PointerEvent) => {
      const motor = motorRef.current;
      if (!motor) return;
      const [x, y] = relativo(e);
      const g = giroRef.current;
      if (g) {
        const c = motor.pixelParaCoord(x, y);
        if (!c) return;
        g.rumo = rumo(g.centro, c);
        propsRef.current.onGirarPrevia(g.id, g.rumo);
        e.preventDefault();
        return;
      }
      const a = arrastoRef.current;
      if (a) {
        if (!propsRef.current.podeArrastar) return;
        if (!a.movendo && Math.hypot(x - a.x0, y - a.y0) < 4) return;
        a.movendo = true;
        const c = motor.pixelParaCoord(x, y);
        if (!c) return;
        const dx = c[0] - a.c0[0];
        const dy = c[1] - a.c0[1];
        for (const it of a.itens)
          a.posicoes.set(it.alvo.id, [it.pos0[0] + dx, it.pos0[1] + dy]);
        for (const s of a.seguidores)
          a.posicoes.set(s.id, [s.pos0[0] + dx, s.pos0[1] + dy]);
        setDica(null);
        redesenhar();
        e.preventDefault();
        return;
      }
      if (e.pointerType === "mouse") {
        const info = pegar(x, y);
        const alvo = info ? alvoDe(info) : null;
        const id = alvo?.id ?? null;
        if (id !== propsRef.current.hover) propsRef.current.onHover(id);
        mostrarDica(e, info);
      }
    };

    const soltar = (e: PointerEvent) => {
      const g = giroRef.current;
      if (g) {
        giroRef.current = null;
        motorRef.current?.travar(false);
        try {
          el.releasePointerCapture(g.pointerId);
        } catch {
          // sem captura, nada a soltar
        }
        ignorarCliqueRef.current = true;
        if (g.rumo !== null) propsRef.current.onGirarFim(g.id, g.rumo);
        return;
      }
      const a = arrastoRef.current;
      if (!a) return;
      arrastoRef.current = null;
      const motor = motorRef.current;
      motor?.travar(false);
      try {
        el.releasePointerCapture(a.pointerId);
      } catch {
        // sem captura, nada a soltar
      }
      const p = propsRef.current;
      if (!a.movendo) {
        p.onSelecionar(a.principal, e.shiftKey || e.ctrlKey || e.metaKey);
        return;
      }
      ignorarCliqueRef.current = true;
      const itens: ItemSolto[] = a.itens.map((it) => ({
        alvo: it.alvo,
        de: it.pos0,
        para: a.posicoes.get(it.alvo.id) ?? it.pos0,
      }));
      p.onSoltar({ principal: a.principal, itens });
    };

    const aoClicarChao = (e: MouseEvent) => {
      // Clique simples no chão (sem arraste e sem máquina embaixo): posiciona ou limpa a seleção.
      if (ignorarCliqueRef.current) {
        ignorarCliqueRef.current = false;
        return;
      }
      const motor = motorRef.current;
      if (!motor) return;
      // Foi arraste do mapa, não clique: não posiciona nem fecha nada.
      const desceu = descidaRef.current;
      if (desceu && Math.hypot(e.clientX - desceu.x, e.clientY - desceu.y) > 5)
        return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (pegar(x, y)) return;
      const p = propsRef.current;
      const c = motor.pixelParaCoord(x, y);
      if (p.modoPosicionar && c) {
        p.onClicarMapa(c);
        return;
      }
      const rotulo = motor
        .pegar(x, y, [ID_OBJETOS, ID_OBRAS, ID_LOCAIS])
        .find((i) => i.object) as
        | { object?: { id?: unknown }; layer?: { id: string } | null }
        | undefined;
      if (rotulo && typeof rotulo.object?.id === "string") {
        if (rotulo.layer?.id === ID_OBRAS) p.onClicarObra(rotulo.object.id);
        else if (rotulo.layer?.id === ID_OBJETOS)
          p.onClicarObjeto(rotulo.object.id);
        else p.onClicarLocal(rotulo.object.id);
        return;
      }
      if (p.selecao.size > 0 && !(e.shiftKey || e.ctrlKey || e.metaKey))
        p.onSelecionar(null, false);
      p.onClicarVazio?.();
    };

    const aoSair = () => {
      setDica(null);
      if (propsRef.current.hover !== null) propsRef.current.onHover(null);
    };

    el.addEventListener("pointerdown", aoPressionar);
    el.addEventListener("pointermove", aoMover);
    el.addEventListener("pointerup", soltar);
    el.addEventListener("pointercancel", soltar);
    el.addEventListener("click", aoClicarChao);
    el.addEventListener("pointerleave", aoSair);
    return () => {
      el.removeEventListener("pointerdown", aoPressionar);
      el.removeEventListener("pointermove", aoMover);
      el.removeEventListener("pointerup", soltar);
      el.removeEventListener("pointercancel", soltar);
      el.removeEventListener("click", aoClicarChao);
      el.removeEventListener("pointerleave", aoSair);
    };
  }, [redesenhar]);

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden bg-surface",
        className,
      )}
    >
      {/* width/height explícitos: o Google Maps troca a position do container e sem isso a altura vira 0. */}
      <div
        ref={containerRef}
        className={cn(
          "absolute inset-0 h-full w-full touch-none select-none",
          props.modoPosicionar ? "cursor-crosshair" : "cursor-grab",
        )}
        role="application"
        aria-label="Mapa da frota"
      />
      {carregando ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-detalhe text-muted-foreground">
          Carregando o mapa...
        </div>
      ) : null}
      {props.cartao ? (
        <div
          key={props.cartao.chave}
          ref={cartaoRef}
          className="invisible absolute top-0 left-0 z-[5] max-h-[calc(100%-3.5rem)] w-72 overflow-y-auto rounded-lg shadow-lg"
        >
          {props.cartao.conteudo}
        </div>
      ) : null}
      <div
        ref={tooltipRef}
        className={cn(
          "pointer-events-none absolute z-10 max-w-xs rounded-md border border-border bg-popover px-2.5 py-1.5 text-legenda text-popover-foreground shadow-md",
          dica ? "block" : "hidden",
        )}
      >
        {dica ? (
          <>
            <p className="font-medium">{dica.titulo}</p>
            {dica.detalhe ? (
              <p className="text-muted-foreground">{dica.detalhe}</p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
