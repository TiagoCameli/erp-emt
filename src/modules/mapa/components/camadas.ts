import {
  AmbientLight,
  DirectionalLight,
  LightingEffect,
  type Layer,
} from "@deck.gl/core";
import {
  PathLayer,
  PolygonLayer,
  ScatterplotLayer,
  TextLayer,
} from "@deck.gl/layers";
import { ScenegraphLayer, SimpleMeshLayer } from "@deck.gl/mesh-layers";
import { ConeGeometry, CubeGeometry, Geometry } from "@luma.gl/engine";

import {
  hexParaRgb,
  marcosNoZoom,
  type TrechoMedido,
} from "@/modules/mapa/geo";
import {
  malhaTanqueHorizontal,
  malhaTanqueVertical,
  type FormaTanque,
} from "@/modules/mapa/malha-tanque";
import type { ObjetoMapa } from "@/modules/mapa/objetos";
import { COR_AREA, COR_ESTADO, type Rgb } from "@/modules/mapa/rotulos";
import type {
  AreaMapa,
  EquipamentoMapa,
  LocalidadeMapa,
  Modelo3d,
  ObraMapa,
  PessoaMapa,
  Posicao,
} from "@/modules/mapa/tipos";

/**
 * As camadas do deck.gl, montadas a partir da cena (o que desenhar + o que está selecionado,
 * sob o mouse ou sendo arrastado). Só roda no navegador: deck.gl mexe em WebGL no import.
 *
 * Ordem (de baixo para cima): áreas, trechos, marcos de km, locais, anel de seleção, miniaturas
 * 3D (uma camada por modelo, porque cada ScenegraphLayer carrega um GLB só), pessoas e rótulos.
 */

export const ARQUIVO_GENERICO = "/mapa-modelos/generico.glb";
export const ARQUIVO_BONECO = "/mapa-modelos/boneco.glb";

/** Prefixos de id das camadas clicáveis: é por eles que o ponteiro sabe o que pegou. */
export const PREFIXO_MAQUINA = "maq-";
export const ID_PESSOAS = "pessoas";
/** Rótulo do local: tocar nele abre a ficha do local (área). */
export const ID_LOCAIS = "locais-nome";

/** Quantas vezes o tamanho real a miniatura aparece (fixo no terreno, em metros). */
export const ESCALA_MAQUINA = 3;

/**
 * Quantas vezes o boneco cresce sobre a escala base (pedido do Tiago, 17/10/2026: "os bonecos
 * estão pequenos demais"; no mesmo dia, 10x "ficaram muito grandes", foi pela metade). Vale para a pessoa sozinha, a equipe e o operador na máquina (é a mesma
 * camada), multiplica também o mínimo e o máximo em pixels, e o card da ficha se afasta na mesma
 * proporção. O toque e o arraste pegam pela malha desenhada, então crescem junto.
 */
export const ESCALA_BONECO = 5;
/** Afastamento do card da ficha da pessoa: em metros e o mínimo em pixels. */
export const RAIO_BONECO_M = 3 * ESCALA_BONECO;
export const RAIO_MINIMO_BONECO_PX = 14 * ESCALA_BONECO;

/** Raio do anel de seleção da máquina, em metros (a usina é maior). */
export function raioDoAnelM(modelo3d: string): number {
  return (modelo3d === "usina_asfalto" ? 28 : 13) * ESCALA_MAQUINA;
}
/** O anel nunca fica menor que isto na tela, por mais longe que esteja. */
export const RAIO_MINIMO_ANEL_PX = 26;
/** Idem para o anel de giro (maior, para dar para pegar de longe). */
export const RAIO_MINIMO_GIRO_PX = 34;
const FONTE = "Inter, Helvetica, Arial, sans-serif";
const BRANCO: Rgb = [255, 255, 255];

/** Obra que já tem ponto (a cena só leva essas). */
export type ObraNoMapa = ObraMapa & { pos: Posicao };

export interface RotuloObra {
  id: string;
  nome: string;
  pos: Posicao;
}

/** Anel de giro da máquina selecionada. */
export const ID_GIRO = "giro-anel";

/**
 * A partir de que zoom cada nome aparece (pedido do Tiago, 15/10/2026: "os nomes só quando estou
 * mais próximo"). De longe ficam só os desenhos; as obras nomeiam primeiro, as máquinas por último.
 */
export const ZOOM_NOMES = {
  obras: 10,
  km: 11.5,
  locais: 12.5,
  areas: 13,
  objetos: 14,
  maquinas: 15,
} as const;

/** Nome do tanque, pilha ou depósito: tocar nele abre a ficha. */
export const ID_OBJETOS = "objetos-nome";

/** Objeto do Estoque que já tem lugar no mapa. */
export type ObjetoNoMapa = ObjetoMapa & { pos: Posicao };

/**
 * Malhas de unidade, montadas uma vez: cone com diâmetro 1 e altura 1, caixa 2×2×2 (a do luma
 * vai de -1 a 1). Vêm em pé no eixo Y; a camada deita para o Z do mapa.
 */
let malhas: Record<"cone" | "caixa", Geometry> | null = null;
function malha(forma: "cone" | "caixa"): Geometry {
  malhas ??= {
    cone: new ConeGeometry({ radius: 0.5, height: 1, nradial: 40, cap: true }),
    caixa: new CubeGeometry(),
  };
  return malhas[forma];
}

/** Malha detalhada do tanque (diâmetro 1, Z para cima), uma por modelo e cor do conteúdo. */
const malhasTanque = new Map<string, Geometry>();
function malhaDoTanque(forma: FormaTanque, cor: Rgb): Geometry {
  const chave = `${forma}:${cor.join(",")}`;
  let g = malhasTanque.get(chave);
  if (!g) {
    const m =
      forma === "tanque_vertical"
        ? malhaTanqueVertical(cor)
        : malhaTanqueHorizontal(cor);
    g = new Geometry({
      topology: "triangle-list",
      attributes: {
        POSITION: { size: 3, value: m.positions },
        NORMAL: { size: 3, value: m.normals },
        COLOR_0: { size: 3, value: m.colors },
      },
    });
    malhasTanque.set(chave, g);
  }
  return g;
}

/** Nome da obra: tocar nele abre a ficha da obra. */
export const ID_OBRAS = "obras-nome";

/** Verde EMT: obra sem cor própria no cadastro. */
const VERDE_EMT: Rgb = [62, 119, 68];

export interface Cena {
  /** Só os que têm posição (quem não tem fica na lista do painel). */
  equipamentos: EquipamentoMapa[];
  pessoas: PessoaMapa[];
  trechos: TrechoMedido[];
  /** Rotas dos fretes em rota (a carreta anda nelas), em [lng, lat]. */
  rotasFrete: { id: string; caminho: Posicao[] }[];
  marcos: { km: number; pos: Posicao }[];
  areas: AreaMapa[];
  localidades: LocalidadeMapa[];
  /** Segunda linha do rótulo do local: o que está ali ("2 tanques · 1 depósito"). */
  extrasDoLocal: ReadonlyMap<string, string>;
  /** Obras com ponto no mapa (o pino). */
  obras: ObraNoMapa[];
  /** Nome de cada obra no mapa: no ponto, no meio do trecho ou no centro da área (clicável). */
  rotulosObra: RotuloObra[];
  /** Tanques, pilhas e depósitos com lugar no mapa (3D gerado, sem arquivo de modelo). */
  objetos: ObjetoNoMapa[];
  /** Anel de giro em volta da máquina selecionada: apertar e arrastar gira a máquina. */
  anelGiro: { id: string; pos: Posicao; raioM: number } | null;
  /** Obra sendo desenhada (pavimentação = linha, edificação = polígono): o rascunho. */
  desenho: { forma: "trecho" | "area"; pontos: Posicao[] } | null;
  /** Ferramenta "Rota": os pontos tocados e o caminho pela estrada (vazio enquanto calcula). */
  rota: { origem: Posicao; destino: Posicao | null; caminho: Posicao[] } | null;
  modelos: ReadonlyMap<string, Modelo3d>;
  snapLocalM: number;
  selecao: ReadonlySet<string>;
  hover: string | null;
  /** Posições que valem mais que as do banco: arraste em curso ou solto à espera da confirmação. */
  posicoes: ReadonlyMap<string, Posicao> | null;
  mostrarPessoas: boolean;
  mostrarRotulos: boolean;
  mostrarAreas: boolean;
  /** Muda a cada arraste/seleção para o deck.gl reavaliar os accessors. */
  tick: number;
  /** Zoom atual do mapa (degrau de meio nível): os nomes só aparecem de perto. */
  zoom: number;
}

/** A luz: ambiente forte (sem sombra preta) e um sol de cima. Validado no spike. */
export function criarIluminacao(): LightingEffect {
  return new LightingEffect({
    ambiente: new AmbientLight({ color: BRANCO, intensity: 1.6 }),
    sol: new DirectionalLight({
      color: BRANCO,
      intensity: 2.2,
      direction: [-1, -2, -3],
    }),
  });
}

/**
 * Orientação do GLB no deck.gl: [pitch, yaw, roll]. Os modelos foram preparados com Z para
 * cima e a frente em +Y, e o rumo vem do norte em sentido horário, então yaw = -heading.
 */
export function orientacao(heading: number): [number, number, number] {
  return [0, -heading, 0];
}

/**
 * Arquivo do modelo com a versão na URL (`?v=`): trocar o .glb e subir `mapa_modelos_3d.versao`
 * faz o navegador baixar o novo em vez de usar o que guardou (16/10/2026, trator de esteira).
 */
export function arquivoDoModelo(
  modelos: ReadonlyMap<string, Modelo3d>,
  chave: string,
): string {
  const modelo = modelos.get(chave);
  if (!modelo?.arquivo) return ARQUIVO_GENERICO;
  return modelo.versao > 1
    ? `${modelo.arquivo}?v=${modelo.versao}`
    : modelo.arquivo;
}

function posicaoDe(
  cena: Cena,
  d: { id: string; pos: Posicao | null },
): Posicao {
  return cena.posicoes?.get(d.id) ?? d.pos ?? [0, 0];
}

export function montarCamadas(cena: Cena): Layer[] {
  const camadas: Layer[] = [];
  const gatilho = [cena.tick, cena.selecao.size, cena.hover];

  if (cena.mostrarAreas && cena.areas.length > 0) {
    const partes = cena.areas.flatMap((area) =>
      area.poligonos.map((poligono) => ({ area, poligono })),
    );
    camadas.push(
      new PolygonLayer<{ area: AreaMapa; poligono: Posicao[][] }>({
        id: "areas",
        data: partes,
        getPolygon: (d) => d.poligono,
        getFillColor: (d) =>
          [...(COR_AREA[d.area.tipo] ?? [95, 102, 115]), 50] as [
            number,
            number,
            number,
            number,
          ],
        getLineColor: (d) =>
          [...(COR_AREA[d.area.tipo] ?? [95, 102, 115]), 200] as [
            number,
            number,
            number,
            number,
          ],
        lineWidthMinPixels: 1.5,
        filled: true,
        stroked: true,
        pickable: false,
      }),
    );
    camadas.push(
      new TextLayer<AreaMapa>({
        id: "areas-nome",
        visible: cena.zoom >= ZOOM_NOMES.areas,
        // Área de edificação de uma obra leva o nome da obra (rótulo da obra, clicável).
        data: cena.areas.filter(
          (a) => a.centro && !(a.tipo === "edificacao" && a.obraId),
        ),
        getPosition: (d) => d.centro ?? [0, 0],
        getText: (d) => d.nome,
        getSize: 12,
        getColor: BRANCO,
        background: true,
        getBackgroundColor: (d) =>
          [...(COR_AREA[d.tipo] ?? [95, 102, 115]), 200] as [
            number,
            number,
            number,
            number,
          ],
        backgroundPadding: [5, 2],
        fontFamily: FONTE,
        characterSet: "auto",
        pickable: false,
      }),
    );
  }

  camadas.push(
    new PathLayer<TrechoMedido>({
      id: "trechos",
      data: cena.trechos,
      getPath: (d) => d.trecho.pontos,
      getColor: (d) => hexParaRgb(d.trecho.cor),
      getWidth: 5,
      widthUnits: "pixels",
      widthMinPixels: 3,
      capRounded: true,
      jointRounded: true,
      pickable: false,
    }),
  );

  // Rota do frete: contorno branco e miolo asfalto, como uma estrada; abaixo dos marcos e das
  // máquinas, acima dos trechos das obras (a BR-364 é a mesma estrada).
  for (const [id, cor, largura] of [
    ["rotas-frete-contorno", [255, 255, 255, 220], 7],
    ["rotas-frete", [69, 70, 75, 235], 3],
  ] as const)
    camadas.push(
      new PathLayer<{ id: string; caminho: Posicao[] }>({
        id,
        data: cena.rotasFrete,
        getPath: (d) => d.caminho,
        getColor: [...cor],
        getWidth: largura,
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
        pickable: false,
      }),
    );

  camadas.push(
    new TextLayer<{ km: number; pos: Posicao }>({
      id: "marcos-km",
      visible: cena.zoom >= ZOOM_NOMES.km,
      data: marcosNoZoom(cena.marcos, cena.zoom),
      getPosition: (d) => d.pos,
      getText: (d) => `km ${d.km}`,
      getSize: 11,
      getColor: BRANCO,
      background: true,
      getBackgroundColor: [31, 31, 31, 170],
      backgroundPadding: [4, 2],
      getPixelOffset: [0, -16],
      fontFamily: FONTE,
      characterSet: "auto",
      pickable: false,
    }),
  );

  camadas.push(
    new ScatterplotLayer<LocalidadeMapa>({
      id: "locais-zona",
      data: cena.localidades,
      getPosition: (d) => d.pos,
      getRadius: (d) => d.raioM ?? cena.snapLocalM,
      radiusUnits: "meters",
      filled: true,
      getFillColor: [42, 120, 214, 30],
      stroked: true,
      getLineColor: [42, 120, 214, 160],
      lineWidthMinPixels: 1,
      pickable: false,
    }),
    new TextLayer<LocalidadeMapa>({
      id: ID_LOCAIS,
      visible: cena.zoom >= ZOOM_NOMES.locais,
      data: cena.localidades,
      getPosition: (d) => d.pos,
      getText: (d) => {
        const extra = cena.extrasDoLocal.get(d.id);
        return extra ? `${d.nome}\n${extra}` : d.nome;
      },
      getSize: 12,
      getColor: BRANCO,
      background: true,
      getBackgroundColor: [42, 120, 214, 210],
      backgroundPadding: [6, 3],
      getPixelOffset: [0, -22],
      fontFamily: FONTE,
      characterSet: "auto",
      pickable: true,
    }),
  );

  // Obras: pino na cor da obra e o nome num rótulo verde, acima do pino.
  camadas.push(
    new ScatterplotLayer<ObraNoMapa>({
      id: "obras-pino",
      data: cena.obras,
      getPosition: (d) => d.pos,
      getRadius: 9,
      radiusUnits: "pixels",
      filled: true,
      getFillColor: (d) => (d.cor ? hexParaRgb(d.cor, VERDE_EMT) : VERDE_EMT),
      stroked: true,
      getLineColor: BRANCO,
      lineWidthMinPixels: 2,
      pickable: false,
    }),
    new TextLayer<RotuloObra>({
      id: ID_OBRAS,
      visible: cena.zoom >= ZOOM_NOMES.obras,
      data: cena.rotulosObra,
      getPosition: (d) => d.pos,
      getText: (d) => d.nome,
      getSize: 13,
      getColor: BRANCO,
      background: true,
      getBackgroundColor: [...VERDE_EMT, 230],
      backgroundPadding: [6, 3],
      getPixelOffset: [0, -24],
      fontFamily: FONTE,
      characterSet: "auto",
      pickable: true,
    }),
  );

  // Tanques com o modelo detalhado (aéreo deitado na bacia ou de usina em pé), na escala das
  // máquinas: uma camada por modelo e cor, com a cor já pintada na malha.
  const tanquesPorMalha = new Map<string, ObjetoNoMapa[]>();
  for (const o of cena.objetos) {
    if (o.forma !== "tanque_horizontal" && o.forma !== "tanque_vertical")
      continue;
    const chave = `${o.forma}:${o.cor.join(",")}`;
    const lista = tanquesPorMalha.get(chave);
    if (lista) lista.push(o);
    else tanquesPorMalha.set(chave, [o]);
  }
  for (const [chave, dados] of tanquesPorMalha) {
    const { forma, cor } = dados[0];
    if (forma !== "tanque_horizontal" && forma !== "tanque_vertical") continue;
    camadas.push(
      new SimpleMeshLayer<ObjetoNoMapa>({
        id: `objetos-${chave}`,
        data: dados,
        mesh: malhaDoTanque(forma, cor),
        getPosition: (d) => d.pos,
        getColor: BRANCO,
        // A malha já nasce com Z para cima e o pé no chão.
        getOrientation: [0, 0, 0],
        getScale: (d) => {
          const s = d.largura * ESCALA_MAQUINA;
          return [s, s, s];
        },
        material: {
          ambient: 0.4,
          diffuse: 0.65,
          shininess: 48,
          specularColor: [70, 70, 70],
        },
        pickable: false,
      }),
    );
  }

  // Pilhas (cone) e depósitos (caixa) em pé no chão, e o nome de cada objeto (clicável: abre a
  // ficha com "Mover no mapa").
  for (const forma of ["cone", "caixa"] as const) {
    const dados = cena.objetos.filter((o) => o.forma === forma);
    if (dados.length === 0) continue;
    // A caixa do luma tem 2 de lado; o cone, 1.
    const unidade = forma === "caixa" ? 0.5 : 1;
    // Em escala real: a pilha (15/10/2026: o tamanho dela já é o volume do saldo) e o depósito
    // (16/10/2026: o tamanho é o escolhido na ficha, em metros).
    camadas.push(
      new SimpleMeshLayer<ObjetoNoMapa>({
        id: `objetos-${forma}`,
        data: dados,
        mesh: malha(forma),
        getPosition: (d) => d.pos,
        getColor: (d) => d.cor,
        // Cone: malha em pé no Y, o roll de 90° põe o Y no Z (para cima) do mapa. Caixa: o cubo é
        // simétrico, então a escala já vai em X (largura), Y (comprimento, norte) e Z (altura), e o
        // giro é só o rumo em volta do Z, como o das máquinas (16/10/2026: girar o almoxarifado).
        getOrientation:
          forma === "caixa" ? (d) => orientacao(d.rumo ?? 0) : [0, 0, 90],
        getScale: (d) =>
          forma === "caixa"
            ? [d.largura * unidade, d.comprimento * unidade, d.altura * unidade]
            : [
                d.largura * unidade,
                d.altura * unidade,
                d.comprimento * unidade,
              ],
        // A malha nasce centrada: sobe meia altura para apoiar no chão.
        getTranslation: (d) => [0, 0, d.altura / 2],
        pickable: false,
      }),
    );
  }
  if (cena.objetos.length > 0)
    camadas.push(
      new TextLayer<ObjetoNoMapa>({
        id: ID_OBJETOS,
        visible: cena.zoom >= ZOOM_NOMES.objetos,
        data: cena.objetos,
        getPosition: (d) => d.pos,
        getText: (d) => d.nome,
        getSize: 11,
        getColor: BRANCO,
        background: true,
        getBackgroundColor: (d) => [...d.cor, 220],
        backgroundPadding: [5, 2],
        getPixelOffset: [0, 18],
        fontFamily: FONTE,
        characterSet: "auto",
        pickable: true,
        parameters: { depthCompare: "always" },
      }),
    );

  // Anel de giro: só o contorno (o miolo deixa a máquina clicável para arrastar), com mínimo em
  // pixels para dar para pegar mesmo de longe.
  if (cena.anelGiro)
    camadas.push(
      new ScatterplotLayer<{ id: string; pos: Posicao; raioM: number }>({
        id: ID_GIRO,
        data: [cena.anelGiro],
        getPosition: (d) => d.pos,
        getRadius: (d) => d.raioM,
        radiusUnits: "meters",
        radiusMinPixels: RAIO_MINIMO_GIRO_PX,
        filled: false,
        stroked: true,
        getLineColor: [255, 255, 255, 230],
        lineWidthUnits: "pixels",
        getLineWidth: 6,
        pickable: true,
        parameters: { depthCompare: "always" },
      }),
    );

  // Rascunho da obra sendo desenhada: a linha (fechada, na edificação) e os pontos tocados.
  if (cena.desenho && cena.desenho.pontos.length > 0) {
    const { forma, pontos } = cena.desenho;
    const caminho =
      forma === "area" && pontos.length >= 3 ? [...pontos, pontos[0]] : pontos;
    if (forma === "area" && pontos.length >= 3)
      camadas.push(
        new PolygonLayer<{ anel: Posicao[] }>({
          id: "desenho-area",
          data: [{ anel: caminho }],
          getPolygon: (d) => d.anel,
          filled: true,
          getFillColor: [74, 58, 167, 60],
          stroked: false,
          pickable: false,
        }),
      );
    camadas.push(
      new PathLayer<{ caminho: Posicao[] }>({
        id: "desenho-linha",
        data: [{ caminho }],
        getPath: (d) => d.caminho,
        getColor: [255, 255, 255, 230],
        getWidth: 4,
        widthUnits: "pixels",
        pickable: false,
      }),
      new ScatterplotLayer<{ pos: Posicao; i: number }>({
        id: "desenho-pontos",
        data: pontos.map((pos, i) => ({ pos, i })),
        getPosition: (d) => d.pos,
        getRadius: 6,
        radiusUnits: "pixels",
        getFillColor: (d) => (d.i === 0 ? [62, 119, 68] : [255, 255, 255]),
        stroked: true,
        getLineColor: [31, 31, 31],
        lineWidthMinPixels: 2,
        pickable: false,
      }),
    );
  }

  // Rota medida: a linha pela estrada (contorno branco, eixo âmbar do logo) e as duas pontas.
  if (cena.rota) {
    const { origem, destino, caminho } = cena.rota;
    if (caminho.length >= 2)
      camadas.push(
        new PathLayer<{ caminho: Posicao[] }>({
          id: "rota-contorno",
          data: [{ caminho }],
          getPath: (d) => d.caminho,
          getColor: [255, 255, 255, 235],
          getWidth: 8,
          widthUnits: "pixels",
          capRounded: true,
          jointRounded: true,
          pickable: false,
          parameters: { depthCompare: "always" },
        }),
        new PathLayer<{ caminho: Posicao[] }>({
          id: "rota-linha",
          data: [{ caminho }],
          getPath: (d) => d.caminho,
          getColor: [207, 148, 58],
          getWidth: 4,
          widthUnits: "pixels",
          capRounded: true,
          jointRounded: true,
          pickable: false,
          parameters: { depthCompare: "always" },
        }),
      );
    camadas.push(
      new ScatterplotLayer<{ pos: Posicao; origem: boolean }>({
        id: "rota-pontas",
        data: [
          { pos: origem, origem: true },
          ...(destino ? [{ pos: destino, origem: false }] : []),
        ],
        getPosition: (d) => d.pos,
        getRadius: 7,
        radiusUnits: "pixels",
        getFillColor: (d) => (d.origem ? VERDE_EMT : [31, 31, 31]),
        stroked: true,
        getLineColor: [255, 255, 255],
        lineWidthMinPixels: 2,
        pickable: false,
        parameters: { depthCompare: "always" },
      }),
    );
  }

  // Anel e rótulos desenham por cima do que já está na tela (sem teste de profundidade): no
  // chão eles sumiriam atrás do corpo da máquina, que fica na frente para a câmera.
  const porCima = { depthCompare: "always" as const };

  const porModelo = new Map<string, EquipamentoMapa[]>();
  for (const d of cena.equipamentos) {
    const lista = porModelo.get(d.modelo3d);
    if (lista) lista.push(d);
    else porModelo.set(d.modelo3d, [d]);
  }
  for (const [chave, dados] of porModelo) {
    const escala = cena.modelos.get(chave)?.escala ?? 1;
    camadas.push(
      new ScenegraphLayer<EquipamentoMapa>({
        id: `${PREFIXO_MAQUINA}${chave}`,
        data: dados,
        scenegraph: arquivoDoModelo(cena.modelos, chave),
        pickable: true,
        getPosition: (d) => posicaoDe(cena, d),
        getOrientation: (d) => orientacao(d.heading),
        getColor: (d) =>
          cena.selecao.has(d.id)
            ? [255, 230, 150]
            : d.estado === "fora_funcionamento"
              ? [120, 120, 120]
              : d.estado === "parado"
                ? [205, 205, 205]
                : BRANCO,
        // 3x o tamanho real, em metros no terreno, sem mínimo nem máximo em pixels: o tamanho
        // fica preso ao chão e não cresce ao afastar o zoom (pedido do Tiago, 15/10).
        sizeScale: escala * ESCALA_MAQUINA,
        _lighting: "pbr",
        updateTriggers: {
          getPosition: gatilho,
          getOrientation: gatilho,
          getColor: gatilho,
        },
      }),
    );
  }

  if (cena.mostrarPessoas) {
    camadas.push(
      new ScenegraphLayer<PessoaMapa>({
        id: ID_PESSOAS,
        data: cena.pessoas,
        scenegraph: ARQUIVO_BONECO,
        pickable: true,
        getPosition: (d) => posicaoDe(cena, d),
        getOrientation: orientacao(0),
        getColor: (d) => (cena.selecao.has(d.id) ? [255, 230, 150] : BRANCO),
        // Segue o zoom entre o mínimo e o máximo em pixels; os três levam o ESCALA_BONECO.
        sizeScale: 1.6 * ESCALA_BONECO,
        sizeMinPixels: 5 * ESCALA_BONECO,
        sizeMaxPixels: 120 * ESCALA_BONECO,
        _lighting: "pbr",
        updateTriggers: { getPosition: gatilho, getColor: gatilho },
      }),
    );
  }

  // Anel de seleção/hover por cima das miniaturas (e dos rótulos não): só o contorno, para a
  // máquina continuar visível dentro dele. Branco com contorno escuro aparece no satélite
  // (escuro) e no mapa (claro), e não some sobre o traçado amarelo do Lote 09.
  const marcados = cena.equipamentos.filter(
    (d) => cena.selecao.has(d.id) || cena.hover === d.id,
  );
  camadas.push(
    new ScatterplotLayer<EquipamentoMapa>({
      id: "anel",
      data: marcados,
      getPosition: (d) => posicaoDe(cena, d),
      getRadius: (d) => raioDoAnelM(d.modelo3d),
      radiusUnits: "meters",
      radiusMinPixels: RAIO_MINIMO_ANEL_PX,
      filled: true,
      getFillColor: (d) =>
        cena.selecao.has(d.id) ? [255, 255, 255, 40] : [255, 255, 255, 25],
      stroked: true,
      getLineColor: (d) =>
        cena.selecao.has(d.id) ? [31, 31, 31, 235] : [255, 255, 255, 255],
      lineWidthMinPixels: 3,
      pickable: false,
      parameters: porCima,
      updateTriggers: {
        getPosition: gatilho,
        getFillColor: gatilho,
        getLineColor: gatilho,
      },
    }),
  );

  if (cena.mostrarRotulos) {
    camadas.push(
      new TextLayer<EquipamentoMapa>({
        id: "rotulos",
        visible: cena.zoom >= ZOOM_NOMES.maquinas,
        data: cena.equipamentos,
        getPosition: (d) => posicaoDe(cena, d),
        getText: (d) => d.codigo || d.descricao,
        getSize: 11,
        getColor: BRANCO,
        background: true,
        getBackgroundColor: (d) =>
          [...COR_ESTADO[d.estado], 215] as [number, number, number, number],
        backgroundPadding: [4, 2],
        getPixelOffset: [0, 26],
        fontFamily: FONTE,
        fontWeight: 600,
        characterSet: "auto",
        pickable: false,
        parameters: porCima,
        updateTriggers: { getPosition: gatilho, getBackgroundColor: gatilho },
      }),
    );
  }

  return camadas;
}
