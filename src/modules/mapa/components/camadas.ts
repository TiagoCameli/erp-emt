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
import { ScenegraphLayer } from "@deck.gl/mesh-layers";

import { hexParaRgb, type TrechoMedido } from "@/modules/mapa/geo";
import { COR_AREA, COR_ESTADO, type Rgb } from "@/modules/mapa/rotulos";
import type {
  AreaMapa,
  EquipamentoMapa,
  LocalidadeMapa,
  Modelo3d,
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

const FONTE = "Inter, Helvetica, Arial, sans-serif";
const BRANCO: Rgb = [255, 255, 255];

export interface Cena {
  /** Só os que têm posição (quem não tem fica na lista do painel). */
  equipamentos: EquipamentoMapa[];
  pessoas: PessoaMapa[];
  trechos: TrechoMedido[];
  marcos: { km: number; pos: Posicao }[];
  areas: AreaMapa[];
  localidades: LocalidadeMapa[];
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

export function arquivoDoModelo(
  modelos: ReadonlyMap<string, Modelo3d>,
  chave: string,
): string {
  return modelos.get(chave)?.arquivo || ARQUIVO_GENERICO;
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
        data: cena.areas.filter((a) => a.centro),
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

  camadas.push(
    new TextLayer<{ km: number; pos: Posicao }>({
      id: "marcos-km",
      data: cena.marcos,
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
      getRadius: cena.snapLocalM,
      radiusUnits: "meters",
      filled: true,
      getFillColor: [42, 120, 214, 30],
      stroked: true,
      getLineColor: [42, 120, 214, 160],
      lineWidthMinPixels: 1,
      pickable: false,
    }),
    new TextLayer<LocalidadeMapa>({
      id: "locais-nome",
      data: cena.localidades,
      getPosition: (d) => d.pos,
      getText: (d) => d.nome,
      getSize: 12,
      getColor: BRANCO,
      background: true,
      getBackgroundColor: [42, 120, 214, 210],
      backgroundPadding: [6, 3],
      getPixelOffset: [0, -22],
      fontFamily: FONTE,
      characterSet: "auto",
      pickable: false,
    }),
  );

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
            : d.estado === "parado"
              ? [205, 205, 205]
              : BRANCO,
        sizeScale: escala,
        // Mínimo de pixels POR METRO do modelo: de longe a máquina vira um ícone de uns 25 a 40 px
        // em vez de sumir (14 px/m, do spike, fazia uma frente inteira virar um borrão só).
        sizeMinPixels: 2.5,
        sizeMaxPixels: 400,
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
        sizeScale: 1.6,
        sizeMinPixels: 5,
        sizeMaxPixels: 120,
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
      getRadius: (d) => (d.modelo3d === "usina_asfalto" ? 28 : 13),
      radiusUnits: "meters",
      radiusMinPixels: 26,
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
