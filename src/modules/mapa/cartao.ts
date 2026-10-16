import type { Posicao } from "@/modules/mapa/tipos";

/**
 * Onde o card da ficha fica, ao lado do objeto tocado no mapa (pedido do Tiago, 16/10/2026: "o
 * card com as informações aparece ao lado do equipamento"). Contas puras, em pixels do mapa.
 */

/** Espaço entre o raio do objeto e o card. */
export const FOLGA_CARTAO_PX = 12;
/** Distância mínima do card às bordas do mapa. */
export const MARGEM_CARTAO_PX = 8;
/** Faixa de cima ocupada pelos botões do mapa (Satélite, 3D...): o card não sobe nela. */
export const TOPO_CARTAO_PX = 44;

const METROS_POR_GRAU = 111_320;

/** Ponto a `metros` a leste: medir quantos pixels o raio do objeto ocupa no zoom atual. */
export function pontoAoLeste(pos: Posicao, metros: number): Posicao {
  const cosLat = Math.max(Math.cos((pos[1] * Math.PI) / 180), 1e-6);
  return [pos[0] + metros / (METROS_POR_GRAU * cosLat), pos[1]];
}

/**
 * À direita do objeto, centrado na altura dele; vai para a esquerda quando não cabe à direita e
 * cabe à esquerda. Sempre dentro do mapa: com o objeto perto da borda ou fora da vista, o card
 * encosta na borda em vez de sumir (o "Centralizar" da ficha traz o objeto de volta).
 */
export function posicaoDoCartao({
  ponto,
  raioPx,
  largura,
  altura,
  larguraMapa,
  alturaMapa,
}: {
  ponto: [number, number];
  raioPx: number;
  largura: number;
  altura: number;
  larguraMapa: number;
  alturaMapa: number;
}): { x: number; y: number; lado: "direita" | "esquerda" } {
  const afastamento = Math.max(raioPx, 0) + FOLGA_CARTAO_PX;
  const direita = ponto[0] + afastamento;
  const esquerda = ponto[0] - afastamento - largura;
  const cabeDireita = direita + largura <= larguraMapa - MARGEM_CARTAO_PX;
  const cabeEsquerda = esquerda >= MARGEM_CARTAO_PX;
  const lado = !cabeDireita && cabeEsquerda ? "esquerda" : "direita";
  const xMax = larguraMapa - largura - MARGEM_CARTAO_PX;
  const x = Math.max(
    MARGEM_CARTAO_PX,
    Math.min(lado === "direita" ? direita : esquerda, xMax),
  );
  const yMax = alturaMapa - altura - MARGEM_CARTAO_PX;
  const y = Math.max(TOPO_CARTAO_PX, Math.min(ponto[1] - altura / 2, yMax));
  return { x: Math.round(x), y: Math.round(y), lado };
}
